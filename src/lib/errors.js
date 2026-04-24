// ============================================================
// errors.js — Mapeo de errores de Supabase/Postgres a mensajes humanos
// ============================================================
// Uso típico:
//
//   import { mapSupabaseError } from '../lib/errors.js'
//
//   const { data, error } = await supabase.from('clients').insert(...)
//   if (error) {
//     setError(mapSupabaseError(error, { entidad: 'partícipe' }))
//     return
//   }
//
// Objetivo:
//   - Nunca mostrar nombres de tablas/columnas/constraints al usuario.
//   - Traducir códigos Postgres al español.
//   - Preservar contexto cuando el constraint violado identifica el campo
//     (ej: "clients_empresa_id_dni_key" → "Ya existe con ese DNI").
// ============================================================

// ------------------------------------------------------------
// Diccionario: fragmentos de constraint → campo en lenguaje humano
// (orden importa: primero los más específicos)
// ------------------------------------------------------------
const CAMPOS_HUMANOS = [
  { match: 'dni',         nombre: 'DNI/NIE/CIF' },
  { match: 'cif',         nombre: 'CIF' },
  { match: 'cups',        nombre: 'CUPS' },
  { match: 'iban',        nombre: 'IBAN' },
  { match: 'email',       nombre: 'email' },
  { match: 'codigo_postal', nombre: 'código postal' },
  { match: 'telefono',    nombre: 'teléfono' },
  { match: 'rum',         nombre: 'RUM SEPA' },
  { match: 'version',     nombre: 'versión' },
  { match: 'coeficiente', nombre: 'coeficiente' },
]

function extraerCampo(texto) {
  if (!texto) return null
  const t = String(texto).toLowerCase()
  for (const { match, nombre } of CAMPOS_HUMANOS) {
    if (t.includes(match)) return nombre
  }
  return null
}

// ------------------------------------------------------------
// Errores de Postgres (código SQLSTATE)
// ------------------------------------------------------------
function mapPostgresError(err, ctx = {}) {
  const code = err.code
  const msg = err.message || err.details || ''
  const campo = extraerCampo(err.constraint || err.details || msg)
  const entidad = ctx.entidad || 'registro'

  switch (code) {
    case '23505': // unique_violation
      return campo
        ? `Este ${campo} ya está registrado.`
        : 'Ya existe un registro con esos datos.'

    case '23503': // foreign_key_violation
      return 'Referencia inválida: este registro apunta a un elemento que no existe o fue borrado.'

    case '23502': // not_null_violation
      return campo
        ? `Falta el campo obligatorio: ${campo}.`
        : 'Falta un campo obligatorio.'

    case '23514': // check_violation
      return campo
        ? `El valor del campo ${campo} no cumple las reglas de validación.`
        : 'Algún dato no cumple las reglas de validación.'

    case '23P01': // exclusion_violation
      return 'Conflicto con otro registro (solapamiento no permitido).'

    case '42501': // insufficient_privilege — RLS bloqueó
      return 'No tienes permisos para realizar esta acción.'

    case '42P01': // undefined_table
    case '42703': // undefined_column
      return 'Error interno de la aplicación. Contacta con soporte.'

    case '22001': // string_data_right_truncation
      return campo
        ? `El valor del campo ${campo} es demasiado largo.`
        : 'Alguno de los valores es demasiado largo.'

    case '22P02': // invalid_text_representation (ej: UUID malformado)
      return 'Formato de dato inválido.'

    case '40001': // serialization_failure
    case '40P01': // deadlock_detected
      return 'Conflicto de concurrencia. Inténtalo de nuevo.'

    default:
      return null
  }
}

// ------------------------------------------------------------
// Errores de PostgREST (prefijo PGRST)
// ------------------------------------------------------------
function mapPostgrestError(err) {
  const code = err.code || ''
  if (!code.startsWith('PGRST')) return null

  switch (code) {
    case 'PGRST301': // JWT expired
    case 'PGRST302': // Attempted to reach protected route without JWT
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'
    case 'PGRST116': // No rows found on .single()
      return 'No se encontró el registro.'
    default:
      return 'Error al procesar la solicitud.'
  }
}

// ------------------------------------------------------------
// Errores de Supabase Auth
// ------------------------------------------------------------
function mapAuthError(err) {
  const name = err.name || ''
  const msg = (err.message || '').toLowerCase()

  if (name !== 'AuthApiError' && !msg.includes('auth')) return null

  if (msg.includes('invalid login credentials')) return 'Credenciales incorrectas.'
  if (msg.includes('email not confirmed'))       return 'Debes confirmar tu email antes de iniciar sesión.'
  if (msg.includes('user already registered'))   return 'Ya existe una cuenta con ese email.'
  if (msg.includes('password should be'))        return 'La contraseña no cumple los requisitos mínimos.'
  if (msg.includes('rate limit'))                return 'Demasiados intentos. Espera unos minutos.'
  if (msg.includes('jwt'))                       return 'Tu sesión ha caducado. Vuelve a iniciar sesión.'

  return 'Error de autenticación. Inténtalo de nuevo.'
}

// ------------------------------------------------------------
// Errores de red / fetch
// ------------------------------------------------------------
function mapNetworkError(err) {
  const msg = (err.message || '').toLowerCase()
  if (msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      err.name === 'TypeError' && msg.includes('fetch')) {
    return 'Sin conexión con el servidor. Revisa tu conexión a internet.'
  }
  return null
}

// ------------------------------------------------------------
// Errores de Storage
// ------------------------------------------------------------
function mapStorageError(err) {
  const statusCode = err.statusCode || err.status
  const msg = (err.message || '').toLowerCase()

  if (statusCode === 413 || msg.includes('payload too large')) {
    return 'El archivo es demasiado grande (máx. 10 MB).'
  }
  if (statusCode === 415 || msg.includes('mime type')) {
    return 'Tipo de archivo no permitido (solo PDF, PNG o JPG).'
  }
  if (statusCode === 404) {
    return 'El archivo solicitado no existe.'
  }
  if (statusCode === 403 || msg.includes('unauthorized')) {
    return 'No tienes permisos para acceder a este archivo.'
  }
  return null
}

// ------------------------------------------------------------
// API pública: mapSupabaseError
// ------------------------------------------------------------
/**
 * Convierte un error de Supabase (Postgres, PostgREST, Auth, Storage o red)
 * en un mensaje en español seguro para mostrar al usuario.
 *
 * @param {unknown} err - Error capturado (puede ser null/undefined)
 * @param {object} [ctx] - Contexto opcional
 * @param {string} [ctx.entidad] - Nombre legible del tipo de registro ('partícipe', 'instalación'...)
 * @param {string} [ctx.fallback] - Mensaje alternativo si no se reconoce el error
 * @returns {string} Mensaje para mostrar al usuario
 */
export function mapSupabaseError(err, ctx = {}) {
  if (!err) return ''

  // Si ya es un string, se asume mensaje pre-formateado
  if (typeof err === 'string') return err

  // Orden: específico → genérico
  return mapPostgresError(err, ctx)
      || mapPostgrestError(err)
      || mapAuthError(err)
      || mapStorageError(err)
      || mapNetworkError(err)
      || ctx.fallback
      || err.message
      || 'Ha ocurrido un error inesperado.'
}

/**
 * Combina log a consola + mapeo. Útil en catch blocks:
 *
 *   try { ... } catch (e) {
 *     setError(logAndMap(e, { entidad: 'partícipe' }))
 *   }
 *
 * En producción, console.error se elimina en build (ver vite.config.js).
 *
 * @param {unknown} err
 * @param {object} [ctx]
 * @returns {string}
 */
export function logAndMap(err, ctx = {}) {
  // eslint-disable-next-line no-console
  console.error('[Supabase Error]', ctx.entidad || '', err)
  return mapSupabaseError(err, ctx)
}
