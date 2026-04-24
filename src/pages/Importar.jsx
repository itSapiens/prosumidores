import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { parsearExcel, generarPlantillaExcel, exportarErroresExcel } from '../utils/excelParser.js'

export default function Importar() {
  const navigate = useNavigate()
  const location = useLocation()
  const installationIdPresel = location.state?.installationId || ''

  const [step, setStep] = useState(1) // 1=subir, 2=validar, 3=importar
  const [dragOver, setDragOver] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [instalaciones, setInstalaciones] = useState([])
  const [installationId, setInstallationId] = useState(installationIdPresel)
  const [importando, setImportando] = useState(false)
  const [importados, setImportados] = useState(0)
  const [error, setError] = useState('')
  const inputRef = useRef()

  useEffect(() => {
    let cancelado = false
    supabase
      .from('installations')
      .select('id, nombre_instalacion')
      .eq('active', true)
      .then(({ data }) => {
        if (!cancelado) setInstalaciones(data || [])
      })
    return () => { cancelado = true }
  }, [])

  const procesarArchivo = useCallback(async (file) => {
    if (!file) return
    setError('')
    try {
      const res = await parsearExcel(file)
      setResultado(res)
      setStep(2)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) procesarArchivo(file)
  }, [procesarArchivo])

  async function handleImportar(soloValidos) {
    if (!installationId) { alert('Selecciona una instalación'); return }
    if (!resultado) return

    const filas = soloValidos ? resultado.filas.filter(f => f.valido) : resultado.filas
    if (filas.length === 0) { alert('No hay filas para importar'); return }

    setImportando(true)
    setImportados(0)
    let importadosCount = 0
    let erroresCount = 0

    for (const fila of filas) {
      if (!fila.valido && soloValidos) continue
      const d = fila.datos

      // Upsert cliente (por DNI)
      const clientPayload = {
        nombre: (d.nombre || '').trim(),
        apellidos: (d.apellidos || '').trim(),
        dni: (d.dni || '').trim().toUpperCase(),
        cups: d.cups || null,
        iban: d.iban || null,
        email: d.email || null,
        telefono: d.telefono ? d.telefono.toString() : null,
        direccion_completa: d.direccion_completa || null,
        codigo_postal: d.codigo_postal ? d.codigo_postal.toString() : null,
        poblacion: d.poblacion || null,
        provincia: d.provincia || null,
        tipo_factura: ['2TD', '3TD'].includes(d.tipo_factura) ? d.tipo_factura : '2TD',
      }

      const { data: client, error: clientError } = await supabase
        .from('clients')
        .upsert(clientPayload, { onConflict: 'dni' })
        .select('id').single()

      if (clientError || !client) {
        erroresCount++
        continue
      }

      // Upsert partícipe
      const coef = parseFloat(d.coeficiente_reparto) || 0
      const { error: partError } = await supabase
        .from('participes')
        .upsert({
          installation_id: installationId,
          client_id: client.id,
          coeficiente_reparto: coef,
          active: true,
        }, { onConflict: 'installation_id,client_id' })

      if (!partError) importadosCount++
      else erroresCount++

      setImportados(prev => prev + 1)
    }

    setImportando(false)
    setStep(3)
    setImportados(importadosCount)

    if (installationId && importadosCount > 0) {
      setTimeout(() => navigate(`/proyectos/${installationId}`), 1500)
    }
  }

  // PASO 1: Subir archivo
  if (step === 1) return (
    <div style={{ maxWidth: 600 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Importar partícipes</div>
          <div className="page-sub">Carga masiva desde Excel o CSV</div>
        </div>
        <button className="btn" onClick={generarPlantillaExcel}>Descargar plantilla Excel</button>
      </div>

      <div className="card mb-16">
        <div className="form-section-title">Instalación de destino</div>
        <select className="form-select" value={installationId} onChange={e => setInstallationId(e.target.value)}>
          <option value="">Seleccionar instalación...</option>
          {instalaciones.map(i => (
            <option key={i.id} value={i.id}>{i.nombre_instalacion}</option>
          ))}
        </select>
      </div>

      <div
        className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
        onDrop={handleDrop}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onClick={() => inputRef.current.click()}
      >
        <div className="upload-icon">
          <svg viewBox="0 0 20 20" fill="none" strokeWidth="1.5" strokeLinecap="round">
            <path d="M10 2v10M6 6l4-4 4 4" stroke="currentColor" />
            <path d="M3 14v2a1 1 0 001 1h12a1 1 0 001-1v-2" stroke="currentColor" />
          </svg>
        </div>
        <div className="upload-title">Arrastra tu archivo aquí o haz clic para seleccionarlo</div>
        <div className="upload-sub">Formatos: .xlsx, .xls, .csv · Máximo 5.000 filas</div>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={e => procesarArchivo(e.target.files[0])} />
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginTop: 16 }}>
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7"/><text x="7.5" y="12" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
          {error}
        </div>
      )}

      <div className="card mt-16" style={{ marginTop: 16 }}>
        <div className="card-title mb-8">Columnas reconocidas automáticamente</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {['nombre', 'apellidos', 'nif / dni', 'cups', 'iban', 'coeficiente / %', 'email', 'telefono', 'direccion', 'cp', 'poblacion', 'provincia'].map(c => (
            <span key={c} className="var-chip">{c}</span>
          ))}
        </div>
      </div>
    </div>
  )

  // PASO 2: Validación
  if (step === 2 && resultado) return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Resultado de validación</div>
          <div className="page-sub">{resultado.total} filas leídas</div>
        </div>
        <button className="btn btn-ghost" onClick={() => { setStep(1); setResultado(null) }}>← Subir otro archivo</button>
      </div>

      {/* Resumen */}
      <div className="flex-row mb-16 gap-8">
        <div className="metric-card" style={{ display: 'inline-flex', gap: 8, alignItems: 'center', padding: '10px 16px' }}>
          <span className="pill pill-green">{resultado.validos} correctos</span>
          {resultado.errores > 0 && <span className="pill pill-red">{resultado.errores} con errores</span>}
        </div>
      </div>

      {/* Validaciones globales */}
      <div className="card mb-16" style={{ padding: '0 16px' }}>
        <div className="validation-row">
          <svg className="v-icon" viewBox="0 0 16 16" fill="none" stroke={resultado.filas.every(f => f.datos.dni && !f.errores.some(e => e.includes('NIF'))) ? '#1A7A6E' : '#E24B4A'} strokeWidth="1.5"><path d="M3 8l3 3 7-7"/></svg>
          <span style={{ flex: 1 }}>Formato de NIF/CIF</span>
          <span className={resultado.filas.filter(f => !f.errores.some(e => e.includes('NIF'))).length === resultado.total ? 'v-ok' : 'v-err'}>
            {resultado.filas.filter(f => !f.errores.some(e => e.includes('NIF'))).length}/{resultado.total} válidos
          </span>
        </div>
        <div className="validation-row">
          <svg className="v-icon" viewBox="0 0 16 16" fill="none" stroke={resultado.filas.filter(f => f.datos.cups).every(f => !f.errores.some(e => e.includes('CUPS'))) ? '#1A7A6E' : '#E24B4A'} strokeWidth="1.5"><path d="M3 8l3 3 7-7"/></svg>
          <span style={{ flex: 1 }}>Formato de CUPS consumo</span>
          <span className={resultado.filas.filter(f => f.errores.some(e => e.includes('CUPS'))).length === 0 ? 'v-ok' : 'v-err'}>
            {resultado.filas.filter(f => !f.errores.some(e => e.includes('CUPS'))).length}/{resultado.total} válidos
          </span>
        </div>
        <div className="validation-row">
          <svg className="v-icon" viewBox="0 0 16 16" fill="none" stroke={resultado.filas.filter(f => f.datos.iban).every(f => !f.errores.some(e => e.includes('IBAN'))) ? '#1A7A6E' : '#E24B4A'} strokeWidth="1.5"><path d="M3 8l3 3 7-7"/></svg>
          <span style={{ flex: 1 }}>Validación de IBAN</span>
          <span className={resultado.filas.filter(f => f.errores.some(e => e.includes('IBAN'))).length === 0 ? 'v-ok' : 'v-err'}>
            {resultado.filas.filter(f => f.datos.iban && !f.errores.some(e => e.includes('IBAN'))).length} válidos
            {resultado.filas.filter(f => f.errores.some(e => e.includes('IBAN'))).length > 0 &&
              ` · ${resultado.filas.filter(f => f.errores.some(e => e.includes('IBAN'))).length} inválidos`}
          </span>
        </div>
        <div className="validation-row">
          <svg className="v-icon" viewBox="0 0 16 16" fill="none" stroke={Math.abs(resultado.filas.reduce((a, f) => a + parseFloat(f.datos.coeficiente_reparto || 0), 0) - 1) < 0.000001 ? '#1A7A6E' : '#BA7517'} strokeWidth="1.5"><path d="M3 8l3 3 7-7"/></svg>
          <span style={{ flex: 1 }}>Suma de coeficientes de reparto</span>
          <span className={Math.abs(resultado.filas.reduce((a, f) => a + parseFloat(f.datos.coeficiente_reparto || 0), 0) - 1) < 0.000001 ? 'v-ok' : 'v-warn'}>
            {resultado.filas.reduce((a, f) => a + parseFloat(f.datos.coeficiente_reparto || 0), 0).toFixed(6)}
          </span>
        </div>
      </div>

      {/* Filas con error */}
      {resultado.errores > 0 && (
        <div className="mb-16">
          <div className="section-header mb-8">
            <span className="section-title">Filas con error</span>
            <button className="btn btn-sm" onClick={() => exportarErroresExcel(resultado.filas)}>
              Exportar errores Excel
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Fila</th><th>Nombre</th><th>NIF</th><th>Errores</th></tr>
              </thead>
              <tbody>
                {resultado.filas.filter(f => !f.valido).map(f => (
                  <tr key={f.fila}>
                    <td>{f.fila}</td>
                    <td>{f.datos.nombre} {f.datos.apellidos}</td>
                    <td className="text-mono">{f.datos.dni}</td>
                    <td style={{ color: 'var(--danger-text)', fontSize: 12 }}>{f.errores.join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex-row" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button className="btn" onClick={() => exportarErroresExcel(resultado.filas)} disabled={resultado.errores === 0}>
          Descargar errores
        </button>
        {resultado.errores > 0 && (
          <button className="btn" onClick={() => handleImportar(true)}>
            Importar solo los {resultado.validos} válidos
          </button>
        )}
        <button className="btn btn-primary" onClick={() => handleImportar(true)} disabled={importando || resultado.validos === 0}>
          {importando ? `Importando... ${importados}` : `Importar ${resultado.validos} partícipes`}
        </button>
      </div>
    </div>
  )

  // PASO 3: Completado
  if (step === 3) return (
    <div style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, background: '#E1F5EE', borderRadius: '50%', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#54D9C7" strokeWidth="2.5" strokeLinecap="round"><path d="M5 14l6 6 12-12"/></svg>
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Importación completada</div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>
        Se han importado <strong>{importados} partícipes</strong> correctamente.
      </div>
      <div className="flex-row" style={{ justifyContent: 'center', gap: 8 }}>
        <button className="btn" onClick={() => { setStep(1); setResultado(null) }}>Importar más</button>
        {installationId && (
          <button className="btn btn-primary" onClick={() => navigate(`/proyectos/${installationId}`)}>
            Ver instalación →
          </button>
        )}
      </div>
    </div>
  )
}
