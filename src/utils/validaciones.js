// ============================================================
// validaciones.js — Validadores centralizados
// ============================================================
// Todas las validaciones de datos de entrada viven aquí.
// Reglas:
//   - Funciones de validación devuelven boolean.
//   - Funciones de normalización devuelven string (input sanitizado).
//   - Ninguna lanza excepción; un valor vacío/malformado devuelve false.
// ============================================================

// ------------------------------------------------------------
// Normalizadores (trim + upper + sin espacios internos)
// ------------------------------------------------------------
export const normalizarNIF = (v) => (v || '').trim().toUpperCase().replace(/\s/g, '')
export const normalizarIBAN = (v) => (v || '').trim().toUpperCase().replace(/\s/g, '')
export const normalizarCUPS = (v) => (v || '').trim().toUpperCase().replace(/\s/g, '')
export const normalizarEmail = (v) => (v || '').trim().toLowerCase()
export const normalizarTelefono = (v) => (v || '').trim().replace(/[\s\-.()]/g, '')

// ------------------------------------------------------------
// NIF / NIE
// Algoritmo oficial: letra de control = "TRWAGMYFPDXBNJZSQVHLCKE"[num % 23]
// ------------------------------------------------------------
const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

export function validarDNI(valor) {
  const v = normalizarNIF(valor)
  if (!/^\d{8}[A-Z]$/.test(v)) return false
  return v[8] === LETRAS_DNI[parseInt(v.slice(0, 8), 10) % 23]
}

export function validarNIE(valor) {
  const v = normalizarNIF(valor)
  if (!/^[XYZ]\d{7}[A-Z]$/.test(v)) return false
  const num = v.replace('X', '0').replace('Y', '1').replace('Z', '2')
  return v[8] === LETRAS_DNI[parseInt(num.slice(0, 8), 10) % 23]
}

// ------------------------------------------------------------
// CIF (con dígito/letra de control REAL — algoritmo AEAT)
// Estructura: Letra inicial + 7 dígitos + carácter de control.
//   Suma pares   = dígitos en posición par (2,4,6)
//   Suma impares = suma de dígitos de (dígito*2) para posiciones impares (1,3,5,7)
//   total        = pares + impares
//   ctrlNum      = (10 - total % 10) % 10
//   - Letras A,B,E,H           → control NUMÉRICO = ctrlNum
//   - Letras K,P,Q,S,N,W       → control LETRA    = "JABCDEFGHI"[ctrlNum]
//   - Letras C,D,F,G,J,L,M,R,U,V → acepta ambos
// ------------------------------------------------------------
const CIF_LETRAS_CONTROL = 'JABCDEFGHI'

export function validarCIF(valor) {
  const v = normalizarNIF(valor)
  if (!/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-Z0-9]$/.test(v)) return false

  const letraInicial = v[0]
  const centrales = v.slice(1, 8)
  const control = v[8]

  let pares = 0
  let impares = 0
  for (let i = 0; i < 7; i++) {
    const d = parseInt(centrales[i], 10)
    if (i % 2 === 0) {
      // Posición 1,3,5,7 (índices pares en 0-based) → multiplicar por 2
      const doble = d * 2
      impares += Math.floor(doble / 10) + (doble % 10)
    } else {
      pares += d
    }
  }
  const total = pares + impares
  const ctrlNum = (10 - (total % 10)) % 10
  const ctrlLetra = CIF_LETRAS_CONTROL[ctrlNum]

  const soloLetra = 'KPQSNW'.includes(letraInicial)
  const soloNumero = 'ABEH'.includes(letraInicial)

  if (soloLetra) return control === ctrlLetra
  if (soloNumero) return control === String(ctrlNum)
  return control === ctrlLetra || control === String(ctrlNum)
}

// Comodín: acepta DNI, NIE o CIF (para usar en formularios unificados)
export function validarNIF(valor) {
  const v = normalizarNIF(valor)
  if (!v) return false
  if (/^\d{8}[A-Z]$/.test(v)) return validarDNI(v)
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) return validarNIE(v)
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-Z0-9]$/.test(v)) return validarCIF(v)
  return false
}

// ------------------------------------------------------------
// CUPS (Código Universal del Punto de Suministro)
// Formatos aceptados:
//   CUPS20: ES + 16 dígitos + 2 letras de control                (20 chars)
//   CUPS22: CUPS20 + 1 dígito + 1 letra frontera (F/P/C/R)       (22 chars)
// Control de las 2 letras: módulo 529 sobre los 16 dígitos,
//   divmod(n, 23) → letras del alfabeto CUPS (sin I,Ñ,O,U,W)
// ------------------------------------------------------------
const CUPS_ALFABETO = 'TRWAGMYFPDXBNJZSQVHLCKE' // idéntico al DNI por convenio

export function validarCUPS(valor) {
  const v = normalizarCUPS(valor)
  if (!/^ES\d{16}[A-Z]{2}(\d[FPCR])?$/.test(v)) return false

  // Verifica el dígito de control de las 2 letras
  const numeros = v.slice(2, 18)
  const letras = v.slice(18, 20)
  const n = parseInt(numeros, 10) % 529
  const primero = Math.floor(n / 23)
  const segundo = n % 23
  return letras === CUPS_ALFABETO[primero] + CUPS_ALFABETO[segundo]
}

// ------------------------------------------------------------
// IBAN español (ES + 22 dígitos)
// Doble verificación:
//   1) dos dígitos de control bancario (DC sobre banco+oficina y sobre cuenta)
//   2) estándar internacional mod-97
// ------------------------------------------------------------
const PESOS_DC_IBAN = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6]

function digitoControlIBAN(str) {
  let suma = 0
  for (let i = 0; i < str.length; i++) suma += parseInt(str[i], 10) * PESOS_DC_IBAN[i]
  const r = 11 - (suma % 11)
  return r === 11 ? 0 : r === 10 ? 1 : r
}

export function validarIBAN(valor) {
  const v = normalizarIBAN(valor)
  if (!v.startsWith('ES')) return false
  if (v.length !== 24) return false
  if (!/^\d{22}$/.test(v.slice(2))) return false

  const banco = v.slice(4, 8)
  const oficina = v.slice(8, 12)
  const dc = v.slice(12, 14)
  const cuenta = v.slice(14, 24)

  // 1) Verificación nacional (2 dígitos de control CCC)
  if (parseInt(dc[0], 10) !== digitoControlIBAN('00' + banco + oficina)) return false
  if (parseInt(dc[1], 10) !== digitoControlIBAN(cuenta)) return false

  // 2) Verificación internacional (mod-97 = 1)
  const reord = v.slice(4) + v.slice(0, 4)
  const numStr = reord.split('').map(c => {
    const code = c.charCodeAt(0)
    return code >= 65 ? (code - 55).toString() : c
  }).join('')
  let remainder = 0
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numStr[i], 10)) % 97
  }
  return remainder === 1
}

// Formatea IBAN con espacios cada 4 caracteres para mostrar
export function formatearIBAN(valor) {
  if (!valor) return ''
  return normalizarIBAN(valor).replace(/(.{4})/g, '$1 ').trim()
}

// ------------------------------------------------------------
// BIC / SWIFT aproximado por prefijo de entidad IBAN
// ------------------------------------------------------------
export function getBICFromIBAN(iban) {
  const map = {
    '2100': 'CAIXESBBXXX', // CaixaBank
    '0049': 'BSCHESMMXXX', // Santander
    '0075': 'BBVAESMMXXX', // BBVA
    '1465': 'INGDESMMXXX', // ING
    '0081': 'BSABESBBXXX', // Sabadell
    '0182': 'BBVAESMMXXX', // BBVA (otra entidad)
    '2038': 'BSMMESBBXXX', // Bankia / CaixaBank
    '3058': 'CAHMESMMXXX', // Cajamar
    '0128': 'BKBKESMMXXX', // Bankinter
    '2080': 'ABSBESBBXXX', // Abanca
  }
  const v = normalizarIBAN(iban)
  if (v.length < 12) return ''
  const entidad = v.slice(4, 8)
  return map[entidad] || ''
}

// ------------------------------------------------------------
// Email — regex conservadora (no RFC-5322 completa, pero suficiente)
// ------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validarEmail(valor) {
  if (!valor) return false
  return EMAIL_RE.test(normalizarEmail(valor))
}

// ------------------------------------------------------------
// Teléfono español — fijo o móvil, con o sin +34
//   Móviles: empiezan por 6 o 7
//   Fijos:   empiezan por 8 o 9
// ------------------------------------------------------------
const TELEFONO_ES_RE = /^(?:\+?34)?[6789]\d{8}$/

export function validarTelefono(valor) {
  if (!valor) return false
  return TELEFONO_ES_RE.test(normalizarTelefono(valor))
}

// ------------------------------------------------------------
// Código postal español — 5 dígitos, 01xxx–52xxx
// ------------------------------------------------------------
export function validarCodigoPostal(valor) {
  if (!valor) return false
  const v = String(valor).trim()
  if (!/^\d{5}$/.test(v)) return false
  const prov = parseInt(v.slice(0, 2), 10)
  return prov >= 1 && prov <= 52
}

// ------------------------------------------------------------
// Coeficiente de reparto (numérico, 0 < c ≤ 1)
// ------------------------------------------------------------
export function validarCoeficiente(valor) {
  if (valor === undefined || valor === null || valor === '') return false
  const n = parseFloat(valor)
  return !Number.isNaN(n) && n > 0 && n <= 1
}

// ------------------------------------------------------------
// Validación compuesta de fila importada
// ------------------------------------------------------------
export function validarFilaImportacion(fila) {
  const errores = []
  const advertencias = []

  if (!fila.nombre || fila.nombre.trim() === '') errores.push('Nombre obligatorio')
  if (!fila.apellidos || fila.apellidos.trim() === '') errores.push('Apellidos obligatorio')

  if (!fila.dni || fila.dni.trim() === '') {
    errores.push('NIF/CIF obligatorio')
  } else if (!validarNIF(fila.dni)) {
    errores.push('NIF/CIF con formato incorrecto')
  }

  if (fila.cups && !validarCUPS(fila.cups)) {
    errores.push('CUPS con formato incorrecto')
  }

  if (fila.iban && !validarIBAN(fila.iban)) {
    errores.push('IBAN inválido (dígito de control incorrecto)')
  }

  if (fila.coeficiente_reparto !== undefined && fila.coeficiente_reparto !== '') {
    if (!validarCoeficiente(fila.coeficiente_reparto)) {
      errores.push('Coeficiente debe ser un número entre 0 y 1 (ej: 0.25000000)')
    }
  }

  if (fila.email && !validarEmail(fila.email)) {
    advertencias.push('Email con formato inválido')
  }

  if (fila.telefono && !validarTelefono(fila.telefono)) {
    advertencias.push('Teléfono con formato inválido')
  }

  if (fila.codigo_postal && !validarCodigoPostal(fila.codigo_postal)) {
    advertencias.push('Código postal con formato inválido')
  }

  return { errores, advertencias, valido: errores.length === 0 }
}

// ------------------------------------------------------------
// Generar RUM (Referencia Única de Mandato) SEPA
// ------------------------------------------------------------
export function generarRUM(installationId, clientId) {
  const ts = Date.now().toString(36).toUpperCase()
  const inst = (installationId || '').slice(0, 4).toUpperCase()
  const cli = (clientId || '').slice(0, 4).toUpperCase()
  return `PRO-${inst}-${cli}-${ts}`
}

// ------------------------------------------------------------
// Formateadores (no son validadores, viven aquí por histórico)
// ------------------------------------------------------------
export function formatearFecha(fecha) {
  const d = fecha ? new Date(fecha) : new Date()
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatearNumero(num, decimales = 2) {
  return parseFloat(num || 0).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })
}
