// ── NIF / NIE / CIF ──────────────────────────────────────────
export function validarNIF(valor) {
  if (!valor) return false
  const v = valor.trim().toUpperCase()

  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(v)) {
    const letras = 'TRWAGMYFPDXBNJZSQVHLCKE'
    return v[8] === letras[parseInt(v.slice(0, 8)) % 23]
  }

  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(v)) {
    const letras = 'TRWAGMYFPDXBNJZSQVHLCKE'
    const num = v.replace('X', '0').replace('Y', '1').replace('Z', '2')
    return v[8] === letras[parseInt(num.slice(0, 8)) % 23]
  }

  // CIF: letra + 7 dígitos + dígito/letra control
  if (/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[A-Z0-9]$/.test(v)) {
    return true // validación simplificada
  }

  return false
}

// ── CUPS ─────────────────────────────────────────────────────
export function validarCUPS(valor) {
  if (!valor) return false
  const v = valor.trim().toUpperCase().replace(/\s/g, '')
  // Exactamente 22 caracteres y termina en F
  return v.length === 22 && v.endsWith('F')
}

// ── IBAN ─────────────────────────────────────────────────────
export function validarIBAN(valor) {
  if (!valor) return false
  const v = valor.trim().toUpperCase().replace(/\s/g, '')

  // España: siempre ES + 22 dígitos = 24 caracteres total
  if (!v.startsWith('ES')) return false
  if (v.length !== 24) return false
  // Los 22 caracteres tras "ES" deben ser todos dígitos
  if (!/^\d{22}$/.test(v.slice(2))) return false

  // Validación dígito de control bancario CCC (posiciones ES xx EEEE OOOO DC CCCCCCCCCC)
  // El dígito de control de la cuenta (posición 12-13 del IBAN, índices 12-13)
  // se verifica con módulo 11 sobre EEEE OOOO CCCCCCCCCC
  const banco   = v.slice(4, 8)
  const oficina = v.slice(8, 12)
  const dc      = v.slice(12, 14)
  const cuenta  = v.slice(14, 24)
  const pesos   = [1, 2, 4, 8, 5, 10, 9, 7, 3, 6]

  function digitoControl(str) {
    let suma = 0
    for (let i = 0; i < str.length; i++) suma += parseInt(str[i]) * pesos[i]
    const r = 11 - (suma % 11)
    return r === 11 ? 0 : r === 10 ? 1 : r
  }

  const dc1 = digitoControl(('0000' + banco + oficina).slice(-8).padStart(8, '0').slice(0, 8))
    // dígito 1: sobre "00" + banco + oficina (10 dígitos con los 2 ceros delante)
  const dc1calc = digitoControl('00' + banco + oficina)
  const dc2calc = digitoControl(cuenta)
  if (parseInt(dc[0]) !== dc1calc || parseInt(dc[1]) !== dc2calc) return false

  // Verificación final mod-97 (estándar internacional IBAN)
  const reord = v.slice(4) + v.slice(0, 4)
  const numStr = reord.split('').map(c => {
    const code = c.charCodeAt(0)
    return code >= 65 ? (code - 55).toString() : c
  }).join('')
  let remainder = 0
  for (let i = 0; i < numStr.length; i++) {
    remainder = (remainder * 10 + parseInt(numStr[i])) % 97
  }
  return remainder === 1
}

// Formatea IBAN con espacios cada 4 caracteres para mostrar
export function formatearIBAN(valor) {
  if (!valor) return ''
  return valor.trim().toUpperCase().replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim()
}

// ── BIC / SWIFT ──────────────────────────────────────────────
export function getBICFromIBAN(iban) {
  // Mapa de los principales bancos españoles por prefijo IBAN
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
  if (!iban || iban.length < 12) return ''
  const entidad = iban.replace(/\s/g, '').slice(4, 8)
  return map[entidad] || ''
}

// ── Validar fila importada ────────────────────────────────────
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

  if (fila.iban) {
    if (!validarIBAN(fila.iban)) {
      errores.push('IBAN inválido (dígito de control incorrecto)')
    }
  }

  if (fila.coeficiente_reparto !== undefined && fila.coeficiente_reparto !== '') {
    const coef = parseFloat(fila.coeficiente_reparto)
    if (isNaN(coef) || coef <= 0 || coef > 1) {
      errores.push('Coeficiente debe ser un número entre 0 y 1 (ej: 0.25000000)')
    }
  }

  if (fila.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fila.email)) {
    advertencias.push('Email con formato inválido')
  }

  return { errores, advertencias, valido: errores.length === 0 }
}

// ── Generar RUM (Referencia Única de Mandato) SEPA ───────────
export function generarRUM(installationId, clientId) {
  const ts = Date.now().toString(36).toUpperCase()
  const inst = (installationId || '').slice(0, 4).toUpperCase()
  const cli = (clientId || '').slice(0, 4).toUpperCase()
  return `PRO-${inst}-${cli}-${ts}`
}

// ── Formatear fecha ──────────────────────────────────────────
export function formatearFecha(fecha) {
  const d = fecha ? new Date(fecha) : new Date()
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Formatear número ─────────────────────────────────────────
export function formatearNumero(num, decimales = 2) {
  return parseFloat(num || 0).toLocaleString('es-ES', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales
  })
}
