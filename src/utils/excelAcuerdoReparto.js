import * as XLSX from 'xlsx'

// Variables del documento:
//
//   INSTALACIÓN
//   - instalacion.cups_generador          → E7  (CAU)
//   - instalacion.modalidad               → B10/B11/B13/B15 (checkbox modalidad)
//
//   TITULAR DE LA INSTALACIÓN (productor)
//   - titular.nombre                      → H12, B26
//   - titular.nif                         → J15
//   - titular.nombre_rep                  → H12 (REPR: ...), B26 (REPR: ...)
//   - titular.nif_rep                     → H12 (...), B26 (...)
//   - titular.coeficiente                 → J14
//   - titular.direccion                   → J16
//   - titular.municipio                   → J17
//   - titular.provincia                   → J18
//   - titular.hay_productor               → G10 (vacío) / G11 ('X')
//
//   COMPENSACIÓN
//   - acoge_compensacion (bool)           → B21 ('X') / B22 ('')
//
//   FECHA Y LUGAR
//   - fecha.lugar                         → B24
//   - fecha.dia                           → B24
//   - fecha.mes                           → B24
//   - fecha.año                           → B24
//
//   CONSUMIDORES (filas 30–99, máx 70)
//   - participe.clients.nombre + apellidos → Ax
//   - participe.clients.dni                → Dx
//   - participe.clients.cups               → Ex
//   - participe.coeficiente_reparto        → Ix

export async function generarExcelAcuerdoReparto({ instalacion, participes, empresa, titular, fecha }) {
  // 1. Cargar el template desde public/
  const resp = await fetch('/plantilla_acuerdo_reparto.xlsx')
  if (!resp.ok) throw new Error('No se pudo cargar el template del acuerdo de reparto')
  const buffer = await resp.arrayBuffer()

  // 2. Parsear con SheetJS preservando fórmulas, estilos y celdas fusionadas
  const wb = XLSX.read(buffer, { type: 'array', cellStyles: true, cellNF: true })
  const ws = wb.Sheets['Acuerdo de reparto']

  // Helper: asignar valor a celda conservando el resto de propiedades del estilo
  function setVal(ref, value) {
    if (!ws[ref]) ws[ref] = {}
    ws[ref].v = value
    ws[ref].t = typeof value === 'number' ? 'n' : 's'
    delete ws[ref].f  // quitar fórmula si la hubiera
  }

  // ─── DATOS DE INSTALACIÓN ────────────────────────────────────────────────
  const cau = instalacion?.cups_generador || ''
  setVal('E7', cau)

  // Checkbox modalidad (solo una 'X')
  const mod = (instalacion?.modalidad || '').toLowerCase()
  setVal('B10', mod.includes('sin') && mod.includes('no') ? 'X' : '')
  setVal('B11', mod.includes('sin') && !mod.includes('no') ? 'X' : '')
  setVal('B13', (!mod.includes('sin') && !mod.includes('no')) || mod === 'ambas' || mod === 'inversion' || mod === 'servicio' ? 'X' : '')
  setVal('B15', mod.includes('con') && mod.includes('no') ? 'X' : '')

  // ─── TITULAR / PRODUCTOR ─────────────────────────────────────────────────
  const tNombre = titular?.nombre || empresa?.nombre || ''
  const tNif = titular?.nif || empresa?.cif || ''
  const tRep = titular?.nombre_rep || empresa?.representante_legal || ''
  const tNifRep = titular?.nif_rep || empresa?.nif_representante || ''
  const tCoef = titular?.coeficiente ?? 1
  const tDir = titular?.direccion || (empresa ? `${empresa.direccion || ''}, ${empresa.codigo_postal || ''} ${empresa.municipio || ''}`.trim().replace(/^,\s*/, '') : '')
  const tMunicipio = titular?.municipio || empresa?.municipio || ''
  const tProvincia = titular?.provincia || ''
  const hayProductor = titular?.hay_productor !== false

  setVal('G10', hayProductor ? '' : 'X')
  setVal('G11', hayProductor ? 'X' : '')
  setVal('H12', tRep ? `${tNombre}\nREPR: ${tRep} (${tNifRep})` : tNombre)
  setVal('J14', tCoef)
  setVal('J15', tNif)
  setVal('J16', tDir)
  setVal('J17', tMunicipio)
  setVal('J18', tProvincia)

  // ─── COMPENSACIÓN ────────────────────────────────────────────────────────
  const acoge = instalacion?.modalidad !== 'sin_excedentes'
  setVal('B21', acoge ? 'X' : '')
  setVal('B22', acoge ? '' : 'X')

  // ─── FECHA Y LUGAR ───────────────────────────────────────────────────────
  const lugar = fecha?.lugar || empresa?.municipio || ''
  const dia = fecha?.dia || new Date().getDate()
  const mes = fecha?.mes || new Date().toLocaleString('es-ES', { month: 'long' })
  const año = fecha?.año || new Date().getFullYear()
  setVal('B24', `En ${lugar} a ${dia} de ${mes} de ${año}.`)

  // Firma del productor
  setVal('B26', tRep ? `${tNombre} / REPR: ${tRep} (${tNifRep})` : tNombre)

  // ─── CONSUMIDORES (filas 30–99) ──────────────────────────────────────────
  const activos = (participes || [])
    .filter(p => p.active !== false)
    .sort((a, b) => (parseFloat(b.coeficiente_reparto) || 0) - (parseFloat(a.coeficiente_reparto) || 0))
    .slice(0, 70) // el template soporta hasta fila 99 (70 consumidores)

  activos.forEach((p, i) => {
    const row = 30 + i
    const client = p.clients || p
    const nombre = [client.nombre, client.apellidos].filter(Boolean).join(' ') || client.nombre_completo || ''
    const nif = client.dni || client.nif || ''
    const cups = client.cups || ''
    const coef = parseFloat(p.coeficiente_reparto || 0)

    setVal(`A${row}`, nombre)
    setVal(`D${row}`, nif)
    setVal(`E${row}`, cups)
    setVal(`I${row}`, coef)
    // J (FIRMA) se deja vacío para firma manual
    setVal(`J${row}`, '')
  })

  // Limpiar filas de consumidores que quedaron del template de ejemplo (si las hay)
  for (let row = 30 + activos.length; row <= 32; row++) {
    ['A', 'D', 'E', 'I', 'J'].forEach(col => {
      if (ws[`${col}${row}`]) ws[`${col}${row}`].v = ''
    })
  }

  // ─── DESCARGAR ───────────────────────────────────────────────────────────
  const nombreInstalacion = (instalacion?.nombre_instalacion || 'Instalacion').replace(/\s+/g, '_')
  const hoy = new Date()
  const fechaStr = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}${String(hoy.getDate()).padStart(2, '0')}`
  const nombreArchivo = `Acuerdo_Reparto_${nombreInstalacion}_${fechaStr}.xlsx`

  XLSX.writeFile(wb, nombreArchivo, { cellStyles: true })
}
