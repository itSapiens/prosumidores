import * as XLSX from 'xlsx'
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

export async function parsearExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (raw.length < 2) {
          reject(new Error('El archivo está vacío o no tiene datos'))
          return
        }

        // Primera fila = cabeceras
        const headers = raw[0].map(h => normalizarClave(h))
        const filas = raw.slice(1).filter(r => r.some(c => c !== ''))

        const resultado = filas.map((fila, idx) => {
          // Mapear columnas
          const obj = {}
          headers.forEach((h, i) => {
            const campo = COLUMN_MAP[h] || h
            let val = fila[i]
            // Limpiar espacios en strings
            if (typeof val === 'string') val = val.trim()
            // Números como string
            if (typeof val === 'number' && COLUMN_MAP[h] !== 'coeficiente_reparto') {
              val = val.toString()
            }
            obj[campo] = val
          })

          // Normalizar IBAN (quitar espacios)
          if (obj.iban) obj.iban = obj.iban.toString().replace(/\s/g, '').toUpperCase()
          // Normalizar CUPS
          if (obj.cups) obj.cups = obj.cups.toString().replace(/\s/g, '').toUpperCase()
          // Normalizar DNI
          if (obj.dni) obj.dni = obj.dni.toString().trim().toUpperCase()
          // Tipo factura por defecto
          if (!obj.tipo_factura) obj.tipo_factura = '2TD'

          // Validar
          const { errores, advertencias, valido } = validarFilaImportacion(obj)

          return {
            fila: idx + 2, // +2 porque fila 1 son cabeceras y es 1-based
            datos: obj,
            errores,
            advertencias,
            valido
          }
        })

        resolve({
          total: resultado.length,
          validos: resultado.filter(r => r.valido).length,
          errores: resultado.filter(r => !r.valido).length,
          filas: resultado,
          headers: headers.map(h => COLUMN_MAP[h] || h)
        })
      } catch (err) {
        reject(new Error('Error al leer el archivo: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsArrayBuffer(file)
  })
}

export function generarPlantillaExcel() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['nombre', 'apellidos', 'nif', 'cups', 'iban', 'coeficiente', 'email', 'telefono', 'direccion', 'codigo_postal', 'poblacion', 'provincia'],
    ['Juan', 'García López', '12345678A', 'ES0021000025041234KA', 'ES9121000418401234567891', '3.50', 'juan@email.com', '600000000', 'Calle Mayor 1', '28001', 'Madrid', 'Madrid'],
    ['María', 'Pérez Ruiz', '87654321B', 'ES0021000025041235LA', 'ES7621000418401234567890', '2.80', 'maria@email.com', '600000001', 'Av. Principal 5', '28002', 'Madrid', 'Madrid'],
  ])

  // Estilos básicos de ancho de columna
  ws['!cols'] = [
    { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 28 },
    { wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 25 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Partícipes')
  XLSX.writeFile(wb, 'plantilla_participes_prosumidores.xlsx')
}

export function exportarErroresExcel(filas) {
  const datos = filas
    .filter(f => !f.valido)
    .map(f => ({
      'Fila': f.fila,
      'Nombre': f.datos.nombre || '',
      'Apellidos': f.datos.apellidos || '',
      'NIF': f.datos.dni || '',
      'Errores': f.errores.join(' | '),
      'Advertencias': f.advertencias.join(' | '),
    }))

  const ws = XLSX.utils.json_to_sheet(datos)
  ws['!cols'] = [{ wch: 6 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 50 }, { wch: 40 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Errores')
  XLSX.writeFile(wb, 'errores_importacion.xlsx')
}
