#!/usr/bin/env node
/**
 * ============================================================
 * migrate-v1-to-v2.js — migración de datos Supabase v1 → v2
 * ============================================================
 *
 * Lee del proyecto v1 (SUPABASE_V1_*) y escribe en v2 (SUPABASE_V2_*)
 * usando service_role en ambos lados (bypasa RLS).
 *
 * Uso:
 *   node --env-file=scripts/.env.migration scripts/migrate-v1-to-v2.js --dry-run
 *   node --env-file=scripts/.env.migration scripts/migrate-v1-to-v2.js --commit
 *   node --env-file=scripts/.env.migration scripts/migrate-v1-to-v2.js --commit --only=clients,participes
 *   node --env-file=scripts/.env.migration scripts/migrate-v1-to-v2.js --dry-run --verbose
 *
 * Flags:
 *   --dry-run (default) → lee y transforma, NO escribe. Genera reporte.
 *   --commit            → hace dry-run + upserts reales.
 *   --only=tabla1,tabla2 → restringe a ciertas tablas (el orden de FKs se respeta igualmente).
 *   --verbose           → imprime detalle de cada fila transformada.
 *
 * Idempotencia:
 *   Todas las inserciones son UPSERT por `id` (UUID), de modo que
 *   re-ejecutar --commit no crea duplicados; actualiza filas ya existentes.
 *
 * Caveats:
 *   - Los triggers `set_audit_fields` de v2 sobrescriben `updated_at` con
 *     `created_at` en INSERT. Los `updated_at` migrados serán iguales a
 *     los `created_at` históricos. Aceptable para una migración one-off.
 *   - Las filas migradas quedan con `created_by = NULL` (service_role no
 *     tiene auth.uid()). Esperado.
 *   - `audit_log` se llenará con una fila por cada fila migrada. Es el
 *     comportamiento correcto: queda constancia de la migración.
 * ============================================================
 */

import { createClient } from '@supabase/supabase-js'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)

// ------------------------------------------------------------
// CLI args
// ------------------------------------------------------------
const argv = process.argv.slice(2)
const flags = {
  commit:  argv.includes('--commit'),
  verbose: argv.includes('--verbose'),
  only:    null,
}
flags.dryRun = !flags.commit

const onlyArg = argv.find(a => a.startsWith('--only='))
if (onlyArg) {
  flags.only = onlyArg.slice('--only='.length).split(',').map(s => s.trim()).filter(Boolean)
}

// ------------------------------------------------------------
// Env
// ------------------------------------------------------------
const {
  SUPABASE_V1_URL,
  SUPABASE_V1_SERVICE_ROLE_KEY,
  SUPABASE_V2_URL,
  SUPABASE_V2_SERVICE_ROLE_KEY,
  TARGET_EMPRESA_ID,
} = process.env

const required = {
  SUPABASE_V1_URL,
  SUPABASE_V1_SERVICE_ROLE_KEY,
  SUPABASE_V2_URL,
  SUPABASE_V2_SERVICE_ROLE_KEY,
  TARGET_EMPRESA_ID,
}

for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`[FATAL] Falta variable de entorno: ${k}`)
    console.error(`        Copia scripts/.env.migration.example a scripts/.env.migration y rellénala.`)
    process.exit(1)
  }
}

if (SUPABASE_V1_URL === SUPABASE_V2_URL) {
  console.error('[FATAL] SUPABASE_V1_URL y SUPABASE_V2_URL apuntan al mismo proyecto — abortando por seguridad.')
  process.exit(1)
}

if (!/^[0-9a-f-]{36}$/i.test(TARGET_EMPRESA_ID)) {
  console.error(`[FATAL] TARGET_EMPRESA_ID no es un UUID: ${TARGET_EMPRESA_ID}`)
  process.exit(1)
}

// ------------------------------------------------------------
// Clients
// ------------------------------------------------------------
const v1 = createClient(SUPABASE_V1_URL, SUPABASE_V1_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const v2 = createClient(SUPABASE_V2_URL, SUPABASE_V2_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
const CUPS_REGEX = /^[A-Z]{2}[0-9]{16}[A-Z]{2}([0-9][FPCR])?$/
const TIPO_FACTURA_VALID = new Set(['2.0TD','3.0TD','6.1TD','2TD','3TD'])
const MODALIDAD_VALID = new Set(['Inversion','Servicio','Ambas','inversion','servicio','ambas'])
const ORIENTACION_VALID = new Set(['sur','sureste','suroeste','este','oeste','norte','noreste','noroeste'])
const STUDY_STATUS_VALID = new Set(['uploaded','validated','calculated','sent','reserved','contracted','rejected','cancelled'])
const EMAIL_STATUS_VALID = new Set(['pending','sent','delivered','opened','bounced','failed'])
const RESERVATION_STATUS_VALID = new Set(['pending_payment','paid','confirmed','released','cancelled','rejected'])
const PAYMENT_STATUS_VALID = new Set(['pending','signal_paid','paid','failed','refunded'])
const CONTRACT_STATUS_VALID = new Set(['generated','uploaded','signed','confirmed','cancelled'])
const CONTRACT_SIG_VALID = new Set(['simple','advanced','qualified'])
const DOC_TIPO_VALID = new Set(['acuerdo_reparto','autorizacion_gestor','mandamiento_sepa','acuerdo_reparto_colectivo'])
const DOC_ESTADO_VALID = new Set(['generado','enviado','firmado','anulado'])
const ACUERDO_ESTADO_VALID = new Set(['activo','cerrado','anulado'])

function blank(v)           { return v === null || v === undefined ? '' : String(v) }
function toUpper(v)         { return v ? String(v).trim().toUpperCase() : null }
function cleanCups(v)       { return v ? String(v).replace(/\s+/g, '').toUpperCase() : null }
function cleanIban(v)       { return v ? String(v).replace(/\s+/g, '').toUpperCase() : null }
function lowerEmail(v)      { return v ? String(v).trim().toLowerCase() : '' }
function nonNegOr0(v)       { return (v === null || v === undefined || Number.isNaN(+v)) ? 0 : Math.max(0, +v) }
function orNull(v)          { return (v === null || v === undefined || v === '') ? null : v }

async function fetchAll(client, table, columns = '*') {
  const pageSize = 1000
  const rows = []
  let from = 0
  while (true) {
    const { data, error } = await client.from(table).select(columns).range(from, from + pageSize - 1)
    if (error) throw new Error(`[${table}] SELECT falló: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

async function deleteAll(client, table) {
  // supabase-js exige un filtro para delete: usamos un filtro que siempre es cierto.
  const { error } = await client.from(table).delete().not('id', 'is', null)
  if (error) throw new Error(`[${table}] DELETE falló: ${error.message}`)
}

async function upsertBatch(client, table, rows, { onConflict = 'id', batchSize = 500 } = {}) {
  const errors = []
  let inserted = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await client.from(table).upsert(batch, { onConflict })
    if (error) {
      errors.push({
        batchStart: i,
        batchSize: batch.length,
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
      })
    } else {
      inserted += batch.length
    }
  }
  return { inserted, errors }
}

function log(msg)  { console.log(msg) }
function logV(msg) { if (flags.verbose) console.log(msg) }
function logW(msg) { console.warn(`  ⚠  ${msg}`) }
function logE(msg) { console.error(`  ✗  ${msg}`) }

// ------------------------------------------------------------
// Estado compartido entre steps (cascada de skips por FK)
// ------------------------------------------------------------
// Cuando descartamos un cliente en el step `clients` (p.ej. por
// CUPS irrecuperable), todas las filas derivadas (participes,
// contracts, reservations, tokens, documents) que apunten a ese
// client_id deben cascadearse también, o el UPSERT en v2 fallaría
// con FK violation.
const skippedClientIds = new Set()

// ------------------------------------------------------------
// Step definitions
// ------------------------------------------------------------
// Cada step:
//   name      : nombre de la tabla en v2
//   before    : (opcional) hook que corre ANTES del fetch (p.ej. DELETE en v2)
//   fetch     : () => Promise<rows[]> — filas crudas de v1
//   transform : (row, ctx) => [transformed, warnings]  (warnings = string[])
//               Si `transformed` es null, la fila se descarta.
//   validate  : (transformed) => errorString | null   (descarta si !null)
// ------------------------------------------------------------
const steps = [
  // ==========================================================
  // 1. distribuidoras — reemplazar v2 por v1 preservando UUIDs
  // ==========================================================
  {
    name: 'distribuidoras',
    before: async () => {
      // ---------------------------------------------------------
      // WIPE TOTAL de v2 antes de migrar desde v1.
      // Orden inverso al INSERT para respetar FK (child → parent).
      // Motivo: v2 tiene una importación parcial previa con UUIDs
      // distintos; la unique (empresa_id,dni) de clientes rechazaría
      // el upsert por id si mantenemos esas filas. Partimos de cero.
      // ---------------------------------------------------------
      log('  ↳ WIPE TOTAL v2 (orden inverso FK)…')
      const wipeOrder = [
        'documents',
        'acuerdo_versiones',
        'contract_access_tokens',
        'installation_reservations',
        'contracts',
        'studies',
        'participes',
        'installations',
        'clients',
        'document_templates',
        'distribuidoras',
      ]
      for (const t of wipeOrder) {
        await deleteAll(v2, t)
        log(`     · ${t} vaciado`)
      }
    },
    fetch: () => fetchAll(v1, 'distribuidoras', 'id, nombre, codigo, active, created_at'),
    transform: (r) => [{
      id: r.id,
      nombre: r.nombre,
      codigo: r.codigo,
      active: r.active ?? true,
      created_at: r.created_at,
    }, []],
    validate: (r) => {
      if (!/^[a-z0-9_-]+$/.test(r.codigo)) return `codigo '${r.codigo}' no cumple regex v2`
      if (!r.nombre || !r.nombre.trim()) return 'nombre vacío'
      return null
    },
  },

  // ==========================================================
  // 2. document_templates — inyectar empresa_id, preservar UUIDs
  // ==========================================================
  {
    name: 'document_templates',
    fetch: () => fetchAll(v1, 'document_templates'),
    transform: (r) => [{
      id: r.id,
      empresa_id: TARGET_EMPRESA_ID,
      distribuidora_id: r.distribuidora_id,
      tipo: r.tipo,
      contenido: r.contenido || '',
      version: r.version || 1,
      active: r.active ?? true,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }, []],
    validate: (r) => {
      if (!DOC_TIPO_VALID.has(r.tipo)) return `tipo '${r.tipo}' no está en whitelist v2`
      return null
    },
  },

  // ==========================================================
  // 3. clients — inyectar empresa_id, normalizar CUPS/IBAN,
  //              NULL → '' en campos NOT NULL DEFAULT ''
  // ==========================================================
  {
    name: 'clients',
    fetch: () => fetchAll(v1, 'clients'),
    transform: (r) => {
      const warnings = []
      let cups = cleanCups(r.cups)
      if (cups && !CUPS_REGEX.test(cups)) {
        // CUPS corrupto en v1 (datos ensuciados con textos tipo
        // "DIRECCI", "FORMADEPAGO", etc.). Descartamos la fila y
        // registramos el id para cascadear el skip en las tablas
        // dependientes (participes, contracts, reservations,
        // tokens, documents) y evitar FK violations en v2.
        warnings.push(`cups malformado '${cups}' → fila descartada (cascada)`)
        skippedClientIds.add(r.id)
        return [null, warnings]
      }
      const iban = cleanIban(r.iban)
      const tipoFactura = r.tipo_factura && TIPO_FACTURA_VALID.has(r.tipo_factura)
        ? r.tipo_factura
        : '2TD'
      if (r.tipo_factura && !TIPO_FACTURA_VALID.has(r.tipo_factura)) {
        warnings.push(`tipo_factura '${r.tipo_factura}' → '2TD'`)
      }
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        nombre: blank(r.nombre),
        apellidos: blank(r.apellidos),
        dni: r.dni,  // NOT NULL en v1 y v2
        email: lowerEmail(r.email),
        telefono: blank(r.telefono),
        direccion_completa: blank(r.direccion_completa),
        codigo_postal: blank(r.codigo_postal),
        poblacion: blank(r.poblacion),
        provincia: blank(r.provincia),
        cups,
        iban,
        tipo_factura: tipoFactura,
        consumo_mensual_real_kwh: r.consumo_mensual_real_kwh,
        consumo_medio_mensual_kwh: r.consumo_medio_mensual_kwh,
        precio_p1_eur_kwh: r.precio_p1_eur_kwh,
        precio_p2_eur_kwh: r.precio_p2_eur_kwh,
        precio_p3_eur_kwh: r.precio_p3_eur_kwh,
        precio_p4_eur_kwh: r.precio_p4_eur_kwh,
        precio_p5_eur_kwh: r.precio_p5_eur_kwh,
        precio_p6_eur_kwh: r.precio_p6_eur_kwh,
        created_at: r.created_at,
      }, warnings]
    },
    validate: (r) => {
      if (!r.dni || !r.dni.trim()) return 'dni vacío'
      return null
    },
  },

  // ==========================================================
  // 4. installations — inyectar empresa_id, distribuidora_id ya válido
  // ==========================================================
  {
    name: 'installations',
    fetch: () => fetchAll(v1, 'installations'),
    transform: (r) => {
      const warnings = []
      let cups = cleanCups(r.cups_generador)
      if (cups && !CUPS_REGEX.test(cups)) {
        warnings.push(`cups_generador malformado '${cups}' → NULL`)
        cups = null
      }
      let orientacion = r.orientacion
      if (orientacion && !ORIENTACION_VALID.has(orientacion)) {
        warnings.push(`orientacion '${orientacion}' → NULL`)
        orientacion = null
      }
      let modalidad = r.modalidad
      if (modalidad && !MODALIDAD_VALID.has(modalidad)) {
        warnings.push(`modalidad '${modalidad}' → NULL`)
        modalidad = null
      }
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        nombre_instalacion: r.nombre_instalacion,
        cups_generador: cups,
        distribuidora_id: r.distribuidora_id,
        direccion: blank(r.direccion),
        municipio: '',  // v1 no la tiene separada
        codigo_postal: '',
        provincia: '',
        lat: r.lat,
        lng: r.lng,
        potencia_instalada_kwp: r.potencia_instalada_kwp,
        potencia_nominal_kw: r.potencia_nominal_kw,
        inclinacion: r.inclinacion,
        orientacion,
        almacenamiento_kwh: r.almacenamiento_kwh,
        horas_efectivas: r.horas_efectivas,
        porcentaje_autoconsumo: r.porcentaje_autoconsumo,
        coste_anual_mantenimiento_por_kwp: r.coste_anual_mantenimiento_por_kwp,
        coste_kwh_inversion: r.coste_kwh_inversion,
        coste_kwh_servicio: r.coste_kwh_servicio,
        modalidad,
        reserva: r.reserva || 'segun_potencia',
        reserva_fija_eur: r.reserva_fija_eur,
        iban_aportaciones: cleanIban(r.iban_aportaciones),
        calculo_estudios: r.calculo_estudios || 'segun_factura',
        potencia_fija_kwp: r.potencia_fija_kwp,
        potencia_minima_kwp: r.potencia_minima_kwp,
        contractable_kwp_total: r.contractable_kwp_total,
        contractable_kwp_reserved: nonNegOr0(r.contractable_kwp_reserved),
        contractable_kwp_confirmed: nonNegOr0(r.contractable_kwp_confirmed),
        precio_excedentes_eur_kwh: nonNegOr0(r.precio_excedentes_eur_kwh),
        tipo_reparto: r.tipo_reparto || 'fijo',
        fecha_activacion: r.fecha_activacion,
        fecha_activacion_real: r.fecha_activacion_real,
        active: r.active ?? true,
        created_at: r.created_at,
      }, warnings]
    },
    validate: (r) => {
      if (!r.nombre_instalacion || !r.nombre_instalacion.trim()) return 'nombre_instalacion vacío'
      if (!(r.potencia_instalada_kwp > 0)) return 'potencia_instalada_kwp debe ser > 0'
      if (!['fijo','dinamico'].includes(r.tipo_reparto)) return `tipo_reparto inválido: ${r.tipo_reparto}`
      return null
    },
  },

  // ==========================================================
  // 5. participes — coeficiente v1 (0-100) → v2 (0-1), inyectar empresa_id
  // ==========================================================
  {
    name: 'participes',
    fetch: () => fetchAll(v1, 'participes'),
    transform: (r) => {
      const warnings = []
      if (skippedClientIds.has(r.client_id)) {
        warnings.push(`client_id ${r.client_id} descartado → cascada skip`)
        return [null, warnings]
      }
      const rawCoef = r.coeficiente_reparto == null ? 0 : Number(r.coeficiente_reparto)
      // v1 ya guarda en escala 0–1 (el CHECK 0-100 es histórico pero la
      // app nunca lo explotó como porcentaje). Los datos activos suman
      // 1.0. Los 5 outliers legacy (todos active=false) se clampan a 1.0.
      let coef = rawCoef
      if (coef < 0) { warnings.push(`coeficiente negativo ${rawCoef} → 0`); coef = 0 }
      if (coef > 1) { warnings.push(`coeficiente fuera de rango ${rawCoef} → clamp 1`); coef = 1 }
      // numeric(8,6): 6 decimales
      coef = Math.round(coef * 1000000) / 1000000
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        installation_id: r.installation_id,
        client_id: r.client_id,
        coeficiente_reparto: coef,
        active: r.active ?? true,
        created_at: r.created_at,
      }, warnings]
    },
    validate: (r) => {
      if (!r.installation_id) return 'installation_id nulo'
      if (!r.client_id) return 'client_id nulo'
      return null
    },
  },

  // ==========================================================
  // 6. studies — inyectar empresa_id
  // ==========================================================
  {
    name: 'studies',
    fetch: () => fetchAll(v1, 'studies'),
    transform: (r) => {
      const warnings = []
      let status = r.status || 'uploaded'
      if (!STUDY_STATUS_VALID.has(status)) {
        warnings.push(`status '${status}' → 'uploaded'`)
        status = 'uploaded'
      }
      let emailStatus = r.email_status
      if (emailStatus && !EMAIL_STATUS_VALID.has(emailStatus)) {
        warnings.push(`email_status '${emailStatus}' → NULL`)
        emailStatus = null
      }
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        status,
        email_status: emailStatus,
        customer: r.customer || {},
        calculation: r.calculation || {},
        invoice_data: r.invoice_data || {},
        source_file: r.source_file || {},
        selected_installation_id: r.selected_installation_id,
        selected_installation_snapshot: r.selected_installation_snapshot,
        assigned_kwp: r.assigned_kwp,
        // v1 no tiene client_id directo en studies → NULL
        client_id: null,
        created_at: r.created_at,
      }, warnings]
    },
    validate: (r) => {
      if (r.assigned_kwp != null && !(r.assigned_kwp > 0)) {
        return `assigned_kwp debe ser > 0 o NULL (valor=${r.assigned_kwp})`
      }
      return null
    },
  },

  // ==========================================================
  // 7. contracts — tabla nueva (creada en 014)
  // ==========================================================
  {
    name: 'contracts',
    fetch: () => fetchAll(v1, 'contracts'),
    transform: (r) => {
      const warnings = []
      if (skippedClientIds.has(r.client_id)) {
        warnings.push(`client_id ${r.client_id} descartado → cascada skip`)
        return [null, warnings]
      }
      let status = r.status || 'generated'
      if (!CONTRACT_STATUS_VALID.has(status)) {
        warnings.push(`status '${status}' → 'generated'`)
        status = 'generated'
      }
      let sig = r.signature_type || 'simple'
      if (!CONTRACT_SIG_VALID.has(sig)) {
        warnings.push(`signature_type '${sig}' → 'simple'`)
        sig = 'simple'
      }
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        study_id: r.study_id,
        client_id: r.client_id,
        installation_id: r.installation_id,
        proposal_mode: r.proposal_mode,
        status,
        signature_type: sig,
        contract_number: orNull(r.contract_number),
        contract_drive_url: orNull(r.contract_drive_url),
        contract_drive_file_id: orNull(r.contract_drive_file_id),
        drive_folder_url: orNull(r.drive_folder_url),
        drive_folder_id: orNull(r.drive_folder_id),
        contract_supabase_path: orNull(r.contract_supabase_path),
        contract_supabase_bucket: orNull(r.contract_supabase_bucket),
        supabase_folder_path: orNull(r.supabase_folder_path),
        uploaded_at: r.uploaded_at,
        signed_at: r.signed_at,
        confirmed_at: r.confirmed_at,
        metadata: r.metadata || {},
        created_at: r.created_at,
      }, warnings]
    },
    validate: (r) => {
      if (!['investment','service'].includes(r.proposal_mode)) {
        return `proposal_mode inválido: ${r.proposal_mode}`
      }
      if (!r.study_id || !r.client_id || !r.installation_id) {
        return 'FK obligatorio (study/client/installation) nulo'
      }
      return null
    },
  },

  // ==========================================================
  // 8. installation_reservations — inyectar empresa_id,
  //    descartar columnas Stripe
  // ==========================================================
  {
    name: 'installation_reservations',
    fetch: () => fetchAll(v1, 'installation_reservations'),
    transform: (r) => {
      const warnings = []
      if (skippedClientIds.has(r.client_id)) {
        warnings.push(`client_id ${r.client_id} descartado → cascada skip`)
        return [null, warnings]
      }
      let rStatus = r.reservation_status || 'pending_payment'
      if (!RESERVATION_STATUS_VALID.has(rStatus)) {
        warnings.push(`reservation_status '${rStatus}' → 'pending_payment'`)
        rStatus = 'pending_payment'
      }
      let pStatus = r.payment_status || 'pending'
      if (!PAYMENT_STATUS_VALID.has(pStatus)) {
        warnings.push(`payment_status '${pStatus}' → 'pending'`)
        pStatus = 'pending'
      }
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        installation_id: r.installation_id,
        study_id: r.study_id,
        client_id: r.client_id,
        reserved_kwp: r.reserved_kwp,
        reservation_status: rStatus,
        payment_status: pStatus,
        payment_deadline_at: r.payment_deadline_at,
        reserved_at: r.reserved_at,
        confirmed_at: r.confirmed_at,
        released_at: r.released_at,
        release_reason: orNull(r.release_reason),
        deadline_enforced: r.deadline_enforced ?? false,
        signal_amount: r.signal_amount,
        currency: (r.currency || 'eur').toLowerCase(),
        metadata: r.metadata || {},
        notas: orNull(r.notes),
        created_at: r.created_at,
        // Descartados por decisión: stripe_checkout_session_id, stripe_payment_intent_id
      }, warnings]
    },
    validate: (r) => {
      if (!(r.reserved_kwp > 0)) return `reserved_kwp debe ser > 0 (valor=${r.reserved_kwp})`
      return null
    },
  },

  // ==========================================================
  // 9. contract_access_tokens — inyectar empresa_id
  // ==========================================================
  {
    name: 'contract_access_tokens',
    fetch: () => fetchAll(v1, 'contract_access_tokens'),
    transform: (r) => {
      const warnings = []
      if (skippedClientIds.has(r.client_id)) {
        warnings.push(`client_id ${r.client_id} descartado → cascada skip`)
        return [null, warnings]
      }
      let purpose = r.purpose || 'contract_sign'
      const VALID_PURPOSES = ['contract_sign','contract_view','proposal_continue']
      if (!VALID_PURPOSES.includes(purpose)) {
        warnings.push(`purpose '${purpose}' no soportado → 'contract_sign'`)
        purpose = 'contract_sign'
      }
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        study_id: r.study_id,
        contract_id: r.contract_id,
        client_id: r.client_id,
        token_hash: r.token_hash,
        purpose,
        expires_at: r.expires_at,
        used_at: r.used_at,
        revoked_at: r.revoked_at,
        created_at: r.created_at,
      }, warnings]
    },
    validate: (r) => {
      if (!r.token_hash || !r.token_hash.trim()) return 'token_hash vacío'
      return null
    },
  },

  // ==========================================================
  // 10. acuerdo_versiones — inyectar empresa_id
  // ==========================================================
  {
    name: 'acuerdo_versiones',
    fetch: () => fetchAll(v1, 'acuerdo_versiones'),
    transform: (r) => {
      const warnings = []
      let estado = r.estado || 'activo'
      if (!ACUERDO_ESTADO_VALID.has(estado)) {
        warnings.push(`estado '${estado}' → 'activo'`)
        estado = 'activo'
      }
      const row = {
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        installation_id: r.installation_id,
        version: r.version,
        estado,
        fecha_inicio: r.fecha_inicio || r.created_at || new Date().toISOString(),
        fecha_cierre: r.fecha_cierre,
        snapshot: r.snapshot,
        notas: orNull(r.notas),
        created_at: r.created_at,
      }
      // Coherencia: si cerrado, necesita fecha_cierre + snapshot
      if (estado === 'cerrado') {
        if (!row.fecha_cierre) { warnings.push('cerrado sin fecha_cierre → set now()'); row.fecha_cierre = new Date().toISOString() }
        if (!row.snapshot)     { warnings.push('cerrado sin snapshot → set {}');        row.snapshot = {} }
      }
      return [row, warnings]
    },
    validate: (r) => {
      if (!r.installation_id) return 'installation_id nulo'
      if (!(r.version > 0)) return `version debe ser > 0 (valor=${r.version})`
      return null
    },
  },

  // ==========================================================
  // 11. documents — inyectar empresa_id; campos Storage/hash NULL
  // ==========================================================
  {
    name: 'documents',
    fetch: () => fetchAll(v1, 'documents'),
    transform: (r) => {
      const warnings = []
      if (r.client_id && skippedClientIds.has(r.client_id)) {
        warnings.push(`client_id ${r.client_id} descartado → cascada skip`)
        return [null, warnings]
      }
      let tipo = r.tipo
      if (!DOC_TIPO_VALID.has(tipo)) { warnings.push(`tipo '${tipo}' no soportado → skip`); return [null, warnings] }
      let estado = r.estado || 'generado'
      if (!DOC_ESTADO_VALID.has(estado)) {
        warnings.push(`estado '${estado}' → 'generado'`)
        estado = 'generado'
      }
      return [{
        id: r.id,
        empresa_id: TARGET_EMPRESA_ID,
        installation_id: r.installation_id,
        client_id: r.client_id,
        version_acuerdo_id: null,   // v1 no tenía FK — queda NULL, se puede reparar luego
        tipo,
        estado,
        version_acuerdo: r.version_acuerdo || 1,
        storage_path_generado: null,
        hash_generado: null,
        size_bytes_generado: null,
        storage_path_firmado: null,
        hash_firmado: null,
        size_bytes_firmado: null,
        generado_en: r.generado_en,
        enviado_en: null,          // v1 no lo tenía
        firmado_en: r.firmado_en,
        notas: orNull(r.notas),
        created_at: r.created_at,
      }, warnings]
    },
    validate: (r) => {
      if (!r.installation_id) return 'installation_id nulo'
      return null
    },
  },
]

// ------------------------------------------------------------
// Main
// ------------------------------------------------------------
async function main() {
  log('='.repeat(64))
  log(`Migración Supabase v1 → v2   (modo: ${flags.dryRun ? 'DRY_RUN' : 'COMMIT'})`)
  log(`v1: ${SUPABASE_V1_URL}`)
  log(`v2: ${SUPABASE_V2_URL}`)
  log(`empresa_id destino: ${TARGET_EMPRESA_ID}`)
  if (flags.only) log(`only: ${flags.only.join(', ')}`)
  log('='.repeat(64))

  const report = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    mode: flags.dryRun ? 'DRY_RUN' : 'COMMIT',
    v1Url: SUPABASE_V1_URL,
    v2Url: SUPABASE_V2_URL,
    targetEmpresaId: TARGET_EMPRESA_ID,
    only: flags.only,
    tables: [],
    hadErrors: false,
  }

  for (const step of steps) {
    if (flags.only && !flags.only.includes(step.name)) continue

    log(`\n▶ ${step.name}`)
    const tableReport = {
      name: step.name,
      v1Count: 0,
      transformed: 0,
      skipped: 0,
      inserted: 0,
      warnings: [],
      validationErrors: [],
      insertErrors: [],
    }

    try {
      // Hook antes del fetch (p.ej. DELETE previo)
      if (step.before && !flags.dryRun) {
        await step.before()
      } else if (step.before && flags.dryRun) {
        log('  ↳ [dry-run] se saltaría el hook `before`')
      }

      // Fetch v1
      const raw = await step.fetch()
      tableReport.v1Count = raw.length
      log(`  ${raw.length} filas leídas de v1`)

      // Transform + validate
      const ok = []
      for (const r of raw) {
        const [transformed, warnings] = step.transform(r)
        if (warnings && warnings.length) {
          for (const w of warnings) tableReport.warnings.push({ id: r.id, msg: w })
        }
        if (transformed === null) {
          tableReport.skipped++
          continue
        }
        const err = step.validate(transformed)
        if (err) {
          tableReport.validationErrors.push({ id: r.id, err })
          tableReport.skipped++
          continue
        }
        ok.push(transformed)
      }
      tableReport.transformed = ok.length
      log(`  ${ok.length} válidas, ${tableReport.skipped} descartadas, ${tableReport.warnings.length} advertencias`)

      if (flags.verbose) {
        for (const e of tableReport.validationErrors.slice(0, 10)) {
          logE(`id=${e.id}  ${e.err}`)
        }
        if (tableReport.validationErrors.length > 10) {
          logE(`… y ${tableReport.validationErrors.length - 10} más`)
        }
        for (const w of tableReport.warnings.slice(0, 10)) {
          logW(`id=${w.id}  ${w.msg}`)
        }
        if (tableReport.warnings.length > 10) {
          logW(`… y ${tableReport.warnings.length - 10} más`)
        }
      }

      // Commit
      if (flags.commit && ok.length > 0) {
        log(`  insertando en v2…`)
        const { inserted, errors } = await upsertBatch(v2, step.name, ok)
        tableReport.inserted = inserted
        tableReport.insertErrors = errors
        if (errors.length > 0) {
          report.hadErrors = true
          for (const e of errors) {
            logE(`batch ${e.batchStart}-${e.batchStart + e.batchSize - 1}: ${e.message}${e.details ? ' | ' + e.details : ''}`)
          }
        } else {
          log(`  ✓ ${inserted} filas upserted`)
        }
      } else if (flags.dryRun) {
        log(`  [dry-run] se insertarían ${ok.length} filas en v2.${step.name}`)
      }

      if (tableReport.validationErrors.length > 0) {
        report.hadErrors = true
      }
    } catch (err) {
      logE(`FATAL en step ${step.name}: ${err.message}`)
      tableReport.fatal = err.message
      report.hadErrors = true
    }

    report.tables.push(tableReport)
  }

  report.finishedAt = new Date().toISOString()

  // Resumen
  log('\n' + '='.repeat(64))
  log('RESUMEN')
  log('='.repeat(64))
  log('tabla                     v1  transf.   ins.  skip  warn  errors')
  log('-'.repeat(64))
  for (const t of report.tables) {
    log(
      t.name.padEnd(24) + ' ' +
      String(t.v1Count).padStart(5) + '  ' +
      String(t.transformed).padStart(6) + '  ' +
      String(t.inserted).padStart(5) + '  ' +
      String(t.skipped).padStart(4) + '  ' +
      String(t.warnings.length).padStart(4) + '  ' +
      String(t.validationErrors.length + t.insertErrors.length).padStart(6)
    )
  }
  log('-'.repeat(64))

  // Escribir reporte
  const reportsDir = join(__dirname, 'reports')
  await mkdir(reportsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  const mode = flags.dryRun ? 'dryrun' : 'commit'
  const reportPath = join(reportsDir, `migration_${mode}_${ts}.json`)
  await writeFile(reportPath, JSON.stringify(report, null, 2))
  log(`\nReporte: ${reportPath}`)

  if (report.hadErrors) {
    log('\n⚠  Hubo errores o advertencias — revisa el reporte antes de continuar.')
    process.exit(2)
  } else {
    log('\n✓ Completado sin errores.')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('\n[FATAL]', err)
  process.exit(1)
})
