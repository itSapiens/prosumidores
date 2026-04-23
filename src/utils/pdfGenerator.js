import jsPDF from 'jspdf'
import JSZip from 'jszip'
import { generarRUM, formatearFecha, getBICFromIBAN } from './validaciones.js'

const TIPO_LABELS = {
  acuerdo_reparto: 'Acuerdo_Reparto',
  autorizacion_gestor: 'Autorizacion_Gestor',
  mandamiento_sepa: 'Mandamiento_SEPA',
  acuerdo_reparto_colectivo: 'Acuerdo_Reparto_Colectivo',
}

// Reemplaza todas las variables {{clave}} en el template
function reemplazarVariables(template, datos) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, clave) => {
    return datos[clave] !== undefined && datos[clave] !== null
      ? String(datos[clave])
      : match
  })
}

// Construye el objeto de datos para los templates
function construirDatos(participe, instalacion, empresa) {
  const client = participe.clients
  const bic = getBICFromIBAN(client?.iban || '')

  return {
    // Datos del partícipe
    nombre_participe: client?.nombre || '',
    apellidos_participe: client?.apellidos || '',
    dni_participe: client?.dni || '',
    cups_consumo: client?.cups || '',
    iban_participe: client?.iban || '',
    bic_participe: bic || '(consultar entidad bancaria)',
    direccion_participe: client?.direccion_completa || '',

    // Datos de la instalación
    cups_generador: instalacion?.cups_generador || '',
    direccion_instalacion: instalacion?.nombre_instalacion || instalacion?.direccion || '',
    potencia_kwp: instalacion?.potencia_instalada_kwp?.toFixed(1) || '',
    tipo_reparto: instalacion?.tipo_reparto === 'dinamico' ? 'dinámico horario' : 'fijo',
    nombre_distribuidora: instalacion?.distribuidoras?.nombre || '',

    // Coeficiente del partícipe
    coeficiente: parseFloat(participe.coeficiente_reparto || 0).toFixed(6),

    // Datos de la empresa
    nombre_empresa: empresa?.nombre || 'La empresa',
    cif_empresa: empresa?.cif || '',
    direccion_empresa: empresa?.direccion ? `${empresa.direccion}, ${empresa.codigo_postal} ${empresa.municipio}` : '',
    representante_legal: empresa?.representante_legal || '',
    creditor_id_sepa: empresa?.creditor_id_sepa || '',

    // Otros
    municipio: empresa?.municipio || '',
    fecha_generacion: formatearFecha(new Date()),
    rum: generarRUM(instalacion?.id, client?.id),
  }
}

// Genera un PDF a partir del contenido del template
function generarPDF(contenido, titulo) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const marginLeft = 20
  const marginRight = 20
  const marginTop = 25
  const lineHeight = 6
  const pageWidth = 210
  const maxWidth = pageWidth - marginLeft - marginRight
  const pageHeight = 297
  const bottomMargin = 25

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(30, 30, 30)

  let y = marginTop

  const lineas = contenido.split('\n')
  lineas.forEach(linea => {
    // Título principal (todo mayúsculas al inicio)
    if (linea === linea.toUpperCase() && linea.trim().length > 3 && y === marginTop) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      const wraps = doc.splitTextToSize(linea, maxWidth)
      wraps.forEach(w => {
        if (y > pageHeight - bottomMargin) { doc.addPage(); y = marginTop }
        doc.text(w, pageWidth / 2, y, { align: 'center' })
        y += 8
      })
      y += 4
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      return
    }

    // Secciones en negrita (REUNIDOS, EXPONEN, ACUERDAN, etc.)
    const esSeccion = /^(REUNIDOS|EXPONEN|ACUERDAN|DATOS|AUTORIZACIÓN|AUTORIZO|TIPO|CONCEPTO|Y EN PRUEBA)/.test(linea.trim())
    if (esSeccion) {
      if (y > pageHeight - bottomMargin) { doc.addPage(); y = marginTop }
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.text(linea, marginLeft, y)
      y += lineHeight + 1
      doc.setFont('helvetica', 'normal')
      return
    }

    // Línea vacía
    if (linea.trim() === '') {
      y += lineHeight * 0.5
      return
    }

    // Texto normal con wrap
    const wraps = doc.splitTextToSize(linea, maxWidth)
    wraps.forEach(w => {
      if (y > pageHeight - bottomMargin) { doc.addPage(); y = marginTop }
      doc.text(w, marginLeft, y)
      y += lineHeight
    })
  })

  // Pie de página
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`${titulo} — Pág. ${i}/${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' })
    doc.setTextColor(30, 30, 30)
  }

  return doc
}

// Genera todos los documentos para un partícipe
export function generarDocumentosParticipe(participe, instalacion, empresa, templates, tipos) {
  const datos = construirDatos(participe, instalacion, empresa)
  const client = participe.clients
  const nombreArchivo = `${(client?.apellidos || 'Cliente').replace(/\s/g, '_')}_${(client?.nombre || '').replace(/\s/g, '_')}`
  const docs = []

  tipos.forEach(tipo => {
    const template = templates.find(t => t.tipo === tipo)
    if (!template) return

    const contenido = reemplazarVariables(template.contenido, datos)
    const pdf = generarPDF(contenido, TIPO_LABELS[tipo])
    docs.push({
      nombre: `${TIPO_LABELS[tipo]}_${nombreArchivo}.pdf`,
      blob: pdf.output('blob'),
      tipo
    })
  })

  return docs
}

// Genera todos los documentos de una instalación y descarga como ZIP
export async function generarYDescargarZIP(participes, instalacion, empresa, templates, tipos, onProgress) {
  const zip = new JSZip()
  const total = participes.length * tipos.length
  let procesados = 0

  for (const participe of participes) {
    if (!participe.active) continue
    const docs = generarDocumentosParticipe(participe, instalacion, empresa, templates, tipos)
    for (const doc of docs) {
      zip.file(doc.nombre, doc.blob)
      procesados++
      if (onProgress) onProgress(Math.round((procesados / total) * 100))
    }
  }

  const contenido = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(contenido)
  const a = document.createElement('a')
  a.href = url
  a.download = `Documentos_${(instalacion?.nombre_instalacion || 'instalacion').replace(/\s/g, '_')}_${Date.now()}.zip`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── ACUERDO DE REPARTO COLECTIVO ────────────────────────────────────────────

// Construye los datos a nivel de instalación (sin participe concreto)
function construirDatosColectivo(instalacion, empresa, participes) {
  const hoy = new Date()
  return {
    cau: instalacion?.cups_generador || '',
    nombre_instalacion: instalacion?.nombre_instalacion || '',
    potencia_kwp: instalacion?.potencia_instalada_kwp?.toFixed(1) || '',
    tipo_reparto: instalacion?.tipo_reparto === 'dinamico' ? 'dinámico horario' : 'fijo',
    nombre_distribuidora: instalacion?.distribuidoras?.nombre || '',
    nombre_empresa: empresa?.nombre || '',
    cif_empresa: empresa?.cif || '',
    direccion_empresa: empresa?.direccion ? `${empresa.direccion}, ${empresa.codigo_postal || ''} ${empresa.municipio || ''}`.trim() : '',
    representante_legal: empresa?.representante_legal || '',
    municipio: empresa?.municipio || '',
    fecha_generacion: formatearFecha(hoy),
    num_consumidores: (participes || []).filter(p => p.active !== false).length,
  }
}

// Genera el PDF colectivo con tabla de consumidores
function generarPDFColectivo(contenidoPlantilla, instalacion, empresa, participes, version = 1) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const marginLeft = 15
  const marginRight = 15
  const marginTop = 20
  const pageWidth = 210
  const maxWidth = pageWidth - marginLeft - marginRight
  const pageHeight = 297
  const bottomMargin = 20
  let y = marginTop

  const checkPage = (espacio = 6) => {
    if (y + espacio > pageHeight - bottomMargin) { doc.addPage(); y = marginTop }
  }

  // Reemplazar variables de instalación/empresa (sin tabla aún)
  const datos = construirDatosColectivo(instalacion, empresa, participes)
  const partes = contenidoPlantilla.split('{{tabla_consumidores}}')
  const bloqueAntes = reemplazarVariables(partes[0] || '', datos)
  const bloqueDespues = reemplazarVariables(partes[1] || '', datos)

  // Helper: renderizar un bloque de texto
  function renderTexto(texto) {
    const lineas = texto.split('\n')
    lineas.forEach(linea => {
      // Título principal (primera línea en mayúsculas)
      if (linea === linea.toUpperCase() && linea.trim().length > 5 && y === marginTop) {
        checkPage(10)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        const wraps = doc.splitTextToSize(linea, maxWidth)
        wraps.forEach(w => { checkPage(); doc.text(w, pageWidth / 2, y, { align: 'center' }); y += 7 })
        y += 3
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        return
      }
      // Sección en negrita (ACUERDOS, REUNIDOS, etc.)
      if (/^(ACUERDOS|REUNIDOS|EXPONEN|ACUERDAN|AUTORIZACIÓN)/.test(linea.trim())) {
        checkPage(8)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(linea.trim(), marginLeft, y)
        y += 7
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9.5)
        return
      }
      // Línea vacía
      if (linea.trim() === '') { y += 3; return }
      // Texto normal
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9.5)
      const wraps = doc.splitTextToSize(linea, maxWidth)
      wraps.forEach(w => { checkPage(); doc.text(w, marginLeft, y); y += 5.5 })
    })
  }

  // Renderizar bloque antes de la tabla
  renderTexto(bloqueAntes)

  // Renderizar tabla de consumidores
  const activos = (participes || [])
    .filter(p => p.active !== false)

  if (activos.length > 0) {
    checkPage(12)
    // Cabecera de tabla
    const colX = { nombre: marginLeft, nif: marginLeft + 62, cups: marginLeft + 90, coef: marginLeft + 140, firma: marginLeft + 156 }
    const rowH = 8
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setFillColor(240, 240, 240)
    doc.rect(marginLeft, y - 4, maxWidth, rowH, 'F')
    doc.text('CONSUMIDOR ASOCIADO', colX.nombre, y)
    doc.text('NIF', colX.nif, y)
    doc.text('CUPS', colX.cups, y)
    doc.text('Coef.', colX.coef, y)
    doc.text('FIRMA', colX.firma, y)
    y += rowH - 1
    doc.setDrawColor(180, 180, 180)
    doc.line(marginLeft, y, marginLeft + maxWidth, y)
    y += 2

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)

    activos.forEach((p, idx) => {
      checkPage(rowH + 2)
      const client = p.clients || p
      const nombre = [client.nombre, client.apellidos].filter(Boolean).join(' ') || ''
      const nif = client.dni || client.nif || ''
      const cups = client.cups || ''
      const coef = parseFloat(p.coeficiente_reparto || 0).toFixed(6)

      if (idx % 2 === 0) {
        doc.setFillColor(250, 250, 250)
        doc.rect(marginLeft, y - 5, maxWidth, rowH, 'F')
      }
      // Nombre puede ser largo, recortar
      const nombreCorto = doc.splitTextToSize(nombre, 58)[0]
      doc.text(nombreCorto, colX.nombre, y)
      doc.text(nif, colX.nif, y)
      doc.text(cups, colX.cups, y)
      doc.text(coef, colX.coef, y)
      // Línea firma
      doc.setDrawColor(180, 180, 180)
      doc.line(colX.firma, y + 1, colX.firma + 34, y + 1)
      y += rowH - 1
    })

    // Línea final tabla
    doc.setDrawColor(180, 180, 180)
    doc.line(marginLeft, y, marginLeft + maxWidth, y)
    y += 6
  }

  // Renderizar bloque después de la tabla
  if (bloqueDespues.trim()) renderTexto(bloqueDespues)

  // Pie de página
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(7.5)
    doc.setTextColor(150, 150, 150)
    doc.text(`Acuerdo de Reparto v${version} — ${instalacion?.nombre_instalacion || ''} — Pág. ${i}/${totalPages}`, pageWidth / 2, pageHeight - 8, { align: 'center' })
    doc.setTextColor(30, 30, 30)
  }

  return doc
}

// Genera y descarga el PDF del Acuerdo de Reparto Colectivo
export function generarPDFAcuerdoRepartoColectivo(instalacion, empresa, participes, template, version = 1) {
  if (!template?.contenido) throw new Error('No hay plantilla de Acuerdo de Reparto Colectivo configurada')
  const pdf = generarPDFColectivo(template.contenido, instalacion, empresa, participes, version)
  const nombre = `Acuerdo_Reparto_v${version}_${(instalacion?.nombre_instalacion || 'instalacion').replace(/\s+/g, '_')}_${new Date().getFullYear()}.pdf`
  pdf.save(nombre)
}

// Genera un solo documento y lo descarga directamente
export function descargarDocumento(participe, instalacion, empresa, template, tipo) {
  const datos = construirDatos(participe, instalacion, empresa)
  const contenido = reemplazarVariables(template.contenido, datos)
  const pdf = generarPDF(contenido, TIPO_LABELS[tipo])
  const client = participe.clients || participe
  const nombre = `${TIPO_LABELS[tipo]}_${(client?.apellidos || '').replace(/\s/g, '_')}_${(client?.nombre || '').replace(/\s/g, '_')}.pdf`
  pdf.save(nombre)
}
