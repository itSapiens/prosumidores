import ExcelJS from 'exceljs'
import { validarFilaImportacion } from './validaciones.js'

// Columnas esperadas en el Excel (normalizado → nombre en BD)
const COLUMN_MAP = {
  // Nombre
  'nombre': 'nombre',
  'name': 'nombre',
  // Apellidos
  'apellidos': 'apellidos',
  'apellido': 'apellidos',
  'surnames': 'apellidos',
  // NIF/DNI/CIF
  'nif': 'dni',
  'dni': 'dni',
  'cif': 'dni',
  'documento': 'dni',
  // CUPS
  'cups': 'cups',
  'cups_consumo': 'cups',
  // IBAN
  'iban': 'iban',
  'cuenta': 'iban',
  'cuenta_bancaria': 'iban',
  // Coeficiente
  'coeficiente': 'coeficiente_reparto',
  'coeficiente_reparto': 'coeficiente_reparto',
  'porcentaje': 'coeficiente_reparto',
  '%': 'coeficiente_reparto',
  // Email
  'email': 'email',
  'correo': 'email',
  'correo_electronico': 'email',
  // Teléfono
  'telefono': 'telefono',
  'teléfono': 'telefono',
  'tel': 'telefono',
  // Dirección
  'direccion': 'direccion_completa',
  'dirección': 'direccion_completa',
  'direccion_completa': 'direccion_completa',
  // Código postal
  'cp': 'codigo_postal',
  'codigo_postal': 'codigo_postal',
  'código_postal': 'codigo_postal',
  'postal': 'codigo_postal',
  // Población
  'poblacion': 'poblacion',
  'población': 'poblacion',
  'municipio': 'poblacion',
  'ciudad': 'poblacion',
  // Provincia
  'provincia': 'provincia',
  // Tipo factura
  'tipo_factura': 'tipo_factura',
  'tarifa': 'tipo_factura',
}

function normalizarClave(clave) {
  return (clave || '')
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

// Convierte el valor de una celda ExcelJS (que puede ser string, number, Date,
// objeto hyperlink { text, hyperlink }, objeto richText, etc.) a un valor plano.
function valorPlano(cell) {
  const v = cell?.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  if (typeof v === 'object') {
    // Hyperlink: { text, hyperlink }
    if (typeof v.text === 'string') return v.text
    // RichText: { richText: [{ text }, ...] }
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join('')
    // Formula: { formula, result }
    if ('result' in v) return v.result ?? ''
    return ''
  }
  return v
}

// Dispara descarga de un buffer como archivo .xlsx
function descargarXlsx(buffer, nombreArchivo) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function parsearExcel(file) {
  try {
    const buffer = await file.arrayBuffer()
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('El archivo no contiene hojas')

    // Extraer todas las filas como array de arrays
    const raw = []
    ws.eachRow({ includeEmpty: false }, (row) => {
      // row.values es 1-based: índice 0 es undefined. Usamos slice(1).
      const vals = (row.values || []).slice(1)
      // Sustituimos objetos complejos por valores planos y undefined por ''
      const plana = vals.map((_, i) => {
        const cell = row.getCell(i + 1)
        return valorPlano(cell)
      })
      raw.push(plana)
    })

    if (raw.length < 2) {
      throw new Error('El archivo está vacío o no tiene datos')
    }

    // Primera fila = cabeceras
    const headers = (raw[0] || []).map(h => normalizarClave(h))
    const filas = raw.slice(1).filter(r => r.some(c => c !== '' && c !== null && c !== undefined))

    const resultado = filas.map((fila, idx) => {
      const obj = {}
      headers.forEach((h, i) => {
        const campo = COLUMN_MAP[h] || h
        let val = fila[i]
        if (typeof val === 'string') val = val.trim()
        if (typeof val === 'number' && COLUMN_MAP[h] !== 'coeficiente_reparto') {
          val = val.toString()
        }
        obj[campo] = val ?? ''
      })

      // Normalizar IBAN (quitar espacios)
      if (obj.iban) obj.iban = obj.iban.toString().replace(/\s/g, '').toUpperCase()
      // Normalizar CUPS
      if (obj.cups) obj.cups = obj.cups.toString().replace(/\s/g, '').toUpperCase()
      // Normalizar DNI
      if (obj.dni) obj.dni = obj.dni.toString().trim().toUpperCase()
      // Tipo factura por defecto
      if (!obj.tipo_factura) obj.tipo_factura = '2TD'

      const { errores, advertencias, valido } = validarFilaImportacion(obj)

      return {
        fila: idx + 2,
        datos: obj,
        errores,
        advertencias,
        valido,
      }
    })

    return {
      total: resultado.length,
      validos: resultado.filter(r => r.valido).length,
      errores: resultado.filter(r => !r.valido).length,
      filas: resultado,
      headers: headers.map(h => COLUMN_MAP[h] || h),
    }
  } catch (err) {
    throw new Error('Error al leer el archivo: ' + err.message)
  }
}

export async function generarPlantillaExcel() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sapiens Energía - Prosumidores'
  wb.created = new Date()

  const ws = wb.addWorksheet('Partícipes')

  // Cabeceras + dos filas de ejemplo (equivalente al aoa_to_sheet anterior)
  ws.addRow(['nombre', 'apellidos', 'nif', 'cups', 'iban', 'coeficiente', 'email', 'telefono', 'direccion', 'codigo_postal', 'poblacion', 'provincia'])
  ws.addRow(['Juan', 'García López', '12345678A', 'ES0021000025041234KA', 'ES9121000418401234567891', '3.50', 'juan@email.com', '600000000', 'Calle Mayor 1', '28001', 'Madrid', 'Madrid'])
  ws.addRow(['María', 'Pérez Ruiz', '87654321B', 'ES0021000025041235LA', 'ES7621000418401234567890', '2.80', 'maria@email.com', '600000001', 'Av. Principal 5', '28002', 'Madrid', 'Madrid'])

  // Ancho de columnas (wch ≈ width en exceljs)
  ws.columns = [
    { width: 15 }, { width: 20 }, { width: 12 }, { width: 24 }, { width: 28 },
    { width: 12 }, { width: 25 }, { width: 14 }, { width: 25 }, { width: 12 }, { width: 15 }, { width: 15 },
  ]
  // Fila de cabeceras en negrita (mejora UX vs la versión xlsx)
  ws.getRow(1).font = { bold: true }

  const buffer = await wb.xlsx.writeBuffer()
  descargarXlsx(buffer, 'plantilla_participes_prosumidores.xlsx')
}

export async function exportarErroresExcel(filas) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Sapiens Energía - Prosumidores'
  wb.created = new Date()

  const ws = wb.addWorksheet('Errores')

  ws.addRow(['Fila', 'Nombre', 'Apellidos', 'NIF', 'Errores', 'Advertencias'])
  ws.getRow(1).font = { bold: true }

  filas
    .filter(f => !f.valido)
    .forEach(f => {
      ws.addRow([
        f.fila,
        f.datos.nombre || '',
        f.datos.apellidos || '',
        f.datos.dni || '',
        (f.errores || []).join(' | '),
        (f.advertencias || []).join(' | '),
      ])
    })

  ws.columns = [
    { width: 6 }, { width: 15 }, { width: 20 }, { width: 12 }, { width: 50 }, { width: 40 },
  ]

  const buffer = await wb.xlsx.writeBuffer()
  descargarXlsx(buffer, 'errores_importacion.xlsx')
}
