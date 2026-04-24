import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { generarYDescargarZIP, generarPDFAcuerdoRepartoColectivo } from '../utils/pdfGenerator.js'
import { mapSupabaseError } from '../lib/errors.js'

const TIPOS_DOC = [
  { id: 'autorizacion_gestor', label: 'Autorización de gestor', desc: 'Por partícipe · PDF individual' },
  { id: 'mandamiento_sepa', label: 'Mandamiento SEPA', desc: 'Por partícipe · PDF individual' },
]

export default function Documentos() {
  const navigate = useNavigate()
  const location = useLocation()
  const installationIdPresel = location.state?.installationId || ''

  const [instalaciones, setInstalaciones] = useState([])
  const [installationId, setInstallationId] = useState(installationIdPresel)
  const [instalacion, setInstalacion] = useState(null)
  const [participes, setParticipes] = useState([])
  const [templates, setTemplates] = useState([])
  const [empresa, setEmpresa] = useState(null)
  const [tiposSeleccionados, setTiposSeleccionados] = useState(['autorizacion_gestor', 'mandamiento_sepa'])
  const [generandoColectivo, setGenerandoColectivo] = useState(false)
  const [versionActiva, setVersionActiva] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [progreso, setProgreso] = useState(0)
  const [documentosExistentes, setDocumentosExistentes] = useState([])
  const [alertas, setAlertas] = useState([])

  useEffect(() => {
    supabase.from('installations').select('id, nombre_instalacion').eq('active', true)
      .then(({ data }) => setInstalaciones(data || []))
    supabase.from('empresa_config').select('*').limit(1).single()
      .then(({ data }) => setEmpresa(data))
  }, [])

  useEffect(() => {
    if (installationId) cargarInstalacion()
  }, [installationId])

  async function cargarInstalacion() {
    const [{ data: inst }, { data: docs }] = await Promise.all([
      supabase.from('installations')
        .select('*, distribuidoras(id, nombre, codigo)')
        .eq('id', installationId).single(),
      supabase.from('documents').select('*, clients(nombre, apellidos)')
        .eq('installation_id', installationId)
        .order('created_at', { ascending: false })
        .limit(20)
    ])

    setInstalacion(inst)
    setDocumentosExistentes(docs || [])

    // Cargar partícipes
    const { data: parts } = await supabase
      .from('participes')
      .select('*, clients(id, nombre, apellidos, dni, cups, iban, email, telefono, direccion_completa)')
      .eq('installation_id', installationId)
      .eq('active', true)

    setParticipes(parts || [])

    // Cargar versión activa del acuerdo de reparto
    const { data: versiones } = await supabase
      .from('acuerdo_versiones')
      .select('*')
      .eq('installation_id', installationId)
      .order('version', { ascending: false })
      .limit(1)
    setVersionActiva(versiones?.[0]?.estado === 'activo' ? versiones[0] : null)

    // Cargar templates
    if (inst?.distribuidoras?.id) {
      const { data: tmpl } = await supabase
        .from('document_templates')
        .select('*')
        .eq('distribuidora_id', inst.distribuidoras.id)
        .eq('active', true)
      setTemplates(tmpl || [])
    }

    // Validaciones
    const nuevasAlertas = []
    if (!inst?.distribuidoras) nuevasAlertas.push({ tipo: 'danger', msg: 'La instalación no tiene distribuidora asignada. Configúrala antes de generar documentos.' })
    if (!inst?.cups_generador) nuevasAlertas.push({ tipo: 'warning', msg: 'La instalación no tiene CAU generación. Aparecerá en blanco en los documentos.' })
    if (!empresa?.nombre || empresa?.nombre === 'Mi Empresa SL') nuevasAlertas.push({ tipo: 'warning', msg: 'Configura los datos de la empresa en Configuración antes de generar.' })

    const sepa = parts?.filter(p => !p.clients?.iban) || []
    if (sepa.length > 0) nuevasAlertas.push({ tipo: 'warning', msg: `${sepa.length} partícipes sin IBAN. Los mandatos SEPA se generarán con el campo en blanco.` })

    // Validación suma de coeficientes = 1.000000
    const suma = (parts || []).reduce((acc, p) => acc + parseFloat(p.coeficiente_reparto || 0), 0)
    if ((parts || []).length > 0 && Math.abs(suma - 1) >= 0.000001) {
      nuevasAlertas.push({
        tipo: 'danger',
        msg: `La suma de coeficientes es ${suma.toFixed(6)} (debe ser 1.000000). No se puede generar el Acuerdo de Reparto hasta completar el 100 % del reparto.`,
      })
    }

    setAlertas(nuevasAlertas)
  }

  // Helper: comprueba si la suma de coef es exactamente 1
  function repartoCompleto() {
    const suma = participes.reduce((acc, p) => acc + parseFloat(p.coeficiente_reparto || 0), 0)
    return participes.length > 0 && Math.abs(suma - 1) < 0.000001
  }

  function handleGenerarTxtReparto() {
    if (!installationId || !instalacion || participes.length === 0) {
      alert('Selecciona una instalación con partícipes')
      return
    }
    if (!instalacion.cups_generador) {
      alert('La instalación no tiene CAU generación configurado')
      return
    }

    const año = new Date().getFullYear()
    const lineas = participes
      .filter(p => p.clients?.cups)
      .map(p => {
        const coef = parseFloat(p.coeficiente_reparto || 0)
          .toFixed(6)
          .replace('.', ',')
        return `${p.clients.cups};${coef}`
      })

    if (lineas.length === 0) {
      alert('Ningún partícipe tiene CUPS de consumo registrado')
      return
    }

    const contenido = lineas.join('\n')
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${instalacion.cups_generador}_${año}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function toggleTipo(tipo) {
    setTiposSeleccionados(prev =>
      prev.includes(tipo) ? prev.filter(t => t !== tipo) : [...prev, tipo]
    )
  }

  async function handleGenerar() {
    if (!installationId || !instalacion || participes.length === 0) {
      alert('Selecciona una instalación con partícipes')
      return
    }
    if (tiposSeleccionados.length === 0) {
      alert('Selecciona al menos un tipo de documento')
      return
    }
    if (templates.length === 0) {
      alert('No hay plantillas configuradas para esta distribuidora. Ve a Plantillas para configurarlas.')
      return
    }

    setGenerando(true)
    setProgreso(0)

    try {
      await generarYDescargarZIP(participes, instalacion, empresa, templates, tiposSeleccionados, setProgreso)

      // Registrar en base de datos
      const inserts = []
      for (const p of participes) {
        for (const tipo of tiposSeleccionados) {
          inserts.push({
            installation_id: installationId,
            client_id: p.client_id,
            tipo,
            estado: 'generado',
          })
        }
      }
      await supabase.from('documents').upsert(inserts, {
        onConflict: 'installation_id,client_id,tipo',
        ignoreDuplicates: false
      })

      await cargarInstalacion()
    } catch (e) {
      alert('Error al generar documentos: ' + e.message)
    } finally {
      setGenerando(false)
      setProgreso(0)
    }
  }

  async function handleDescargarPDFColectivo() {
    if (!installationId || !instalacion || participes.length === 0) {
      alert('Selecciona una instalación con partícipes')
      return
    }
    if (!repartoCompleto()) {
      const suma = participes.reduce((acc, p) => acc + parseFloat(p.coeficiente_reparto || 0), 0)
      alert(`No se puede generar el Acuerdo de Reparto: la suma de coeficientes es ${suma.toFixed(6)} y debe ser exactamente 1.000000.`)
      return
    }
    const templateColectivo = templates.find(t => t.tipo === 'acuerdo_reparto_colectivo')
    if (!templateColectivo) {
      alert('No hay plantilla de "Acuerdo reparto colectivo" configurada para esta distribuidora. Ve a Plantillas para crearla.')
      return
    }
    setGenerandoColectivo(true)
    // Obtener o crear versión activa
    let version = versionActiva
    try {
      if (!version) {
        // Buscar la última versión para saber el número
        const { data: ultimas } = await supabase
          .from('acuerdo_versiones')
          .select('version')
          .eq('installation_id', installationId)
          .order('version', { ascending: false })
          .limit(1)
        const siguienteNum = ultimas?.[0] ? ultimas[0].version + 1 : 1
        const { data: nueva } = await supabase
          .from('acuerdo_versiones')
          .insert({ installation_id: installationId, version: siguienteNum, estado: 'activo' })
          .select().single()
        version = nueva
        setVersionActiva(nueva)
      }
    } catch (e) {
      console.error('Error creando versión:', e)
    }

    const vNum = version?.version || 1

    try {
      generarPDFAcuerdoRepartoColectivo(instalacion, empresa, participes, templateColectivo, vNum)
    } catch (e) {
      alert('Error al generar PDF: ' + e.message)
      setGenerandoColectivo(false)
      return
    }

    try {
      for (const p of participes) {
        const { data: existing } = await supabase.from('documents')
          .select('id')
          .eq('installation_id', installationId)
          .eq('client_id', p.client_id)
          .eq('tipo', 'acuerdo_reparto')
          .eq('version_acuerdo', vNum)
          .maybeSingle()
        if (existing) {
          await supabase.from('documents').update({ estado: 'generado' }).eq('id', existing.id)
        } else {
          await supabase.from('documents').insert({
            installation_id: installationId,
            client_id: p.client_id,
            tipo: 'acuerdo_reparto',
            estado: 'generado',
            version_acuerdo: vNum,
          })
        }
      }
      await cargarInstalacion()
    } catch (e) {
      console.error('Error registrando estado:', e)
      alert('PDF generado pero error al guardar estado: ' + mapSupabaseError(e))
    } finally {
      setGenerandoColectivo(false)
    }
  }

  const totalDocs = participes.length * tiposSeleccionados.length

  const estadoPill = (estado) => {
    if (estado === 'firmado') return <span className="pill pill-green">Firmado</span>
    if (estado === 'enviado') return <span className="pill pill-blue">Enviado</span>
    return <span className="pill pill-amber">Generado</span>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Generar documentos</div>
          <div className="page-sub">Generación en lote de los 3 tipos de documento</div>
        </div>
      </div>

      {/* Alertas */}
      {alertas.map((a, i) => (
        <div key={i} className={`alert alert-${a.tipo}`}>
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7"/><text x="7.5" y="12" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
          {a.msg}
        </div>
      ))}

      <div className="two-col">
        <div>
          {/* Selección instalación */}
          <div className="card mb-16">
            <div className="form-section-title">Instalación</div>
            <select className="form-select" value={installationId} onChange={e => setInstallationId(e.target.value)}>
              <option value="">Seleccionar instalación...</option>
              {instalaciones.map(i => (
                <option key={i.id} value={i.id}>{i.nombre_instalacion}</option>
              ))}
            </select>
            {instalacion && (
              <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
                {instalacion.distribuidoras?.nombre || 'Sin distribuidora'} · {participes.length} partícipes
                {!instalacion.distribuidoras && (
                  <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }}
                    onClick={() => navigate(`/proyectos/${installationId}/editar`)}>
                    Configurar →
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tipos de documento */}
          <div className="card mb-16">
            <div className="form-section-title">Tipos de documento</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Acuerdo de reparto colectivo — documento único para distribuidora */}
              {(() => {
                const sumaCoef = participes.reduce((acc, p) => acc + parseFloat(p.coeficiente_reparto || 0), 0)
                const completo = participes.length > 0 && Math.abs(sumaCoef - 1) < 0.000001
                return (
                  <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: 'var(--bg-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>
                          Acuerdo de reparto
                          {versionActiva && <span className="pill pill-blue" style={{ marginLeft: 8, fontSize: 11 }}>v{versionActiva.version} activa</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Todos los partícipes · PDF único para distribuidora
                        </div>
                        {participes.length > 0 && (
                          <div style={{
                            fontSize: 11, marginTop: 4,
                            color: completo ? '#1A7A6E' : '#BA7517',
                            fontWeight: 600,
                          }}>
                            {completo
                              ? `✓ Reparto completo (${sumaCoef.toFixed(6)})`
                              : `⚠ Reparto: ${sumaCoef.toFixed(6)} / 1.000000 — falta ${(1 - sumaCoef).toFixed(6)}`}
                          </div>
                        )}
                      </div>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleDescargarPDFColectivo}
                        disabled={generandoColectivo || !installationId || participes.length === 0 || !completo}
                        style={{ whiteSpace: 'nowrap' }}
                        title={!completo ? 'La suma de coeficientes debe ser 1.000000 para generar el acuerdo' : ''}
                      >
                        {generandoColectivo ? 'Generando...' : `Generar PDF (${participes.length})`}
                      </button>
                    </div>
                  </div>
                )
              })()}

              {/* Fichero TXT de coeficientes para distribuidora */}
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px', background: 'var(--bg-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>Fichero de coeficientes (.txt)</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                      Formato CUPS;coeficiente · {instalacion?.cups_generador ? `${instalacion.cups_generador}_${new Date().getFullYear()}.txt` : 'CUPS_generador_año.txt'}
                    </div>
                  </div>
                  <button
                    className="btn btn-sm"
                    onClick={handleGenerarTxtReparto}
                    disabled={!installationId || participes.length === 0}
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    Descargar TXT
                  </button>
                </div>
              </div>

              {/* Documentos individuales */}
              {TIPOS_DOC.map(t => (
                <label key={t.id}
                  className={`doc-type-card ${tiposSeleccionados.includes(t.id) ? 'selected' : ''}`}
                  style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={tiposSeleccionados.includes(t.id)}
                    onChange={() => toggleTipo(t.id)} style={{ accentColor: 'var(--primary)', marginTop: 2 }} />
                  <div>
                    <div className="doc-type-name">{t.label}</div>
                    <div className="doc-type-count">
                      {participes.length} documentos · {t.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Generar */}
          <div className="card">
            <div className="flex-between mb-8">
              <span className="section-title">Resumen</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.7 }}>
              Se generarán <strong style={{ color: 'var(--text-primary)' }}>{totalDocs} documentos PDF</strong>
              {' '}para <strong style={{ color: 'var(--text-primary)' }}>{participes.length} partícipes</strong>
              {' '}y se descargarán como un fichero ZIP.
            </div>

            {generando && (
              <div style={{ marginBottom: 12 }}>
                <div className="flex-between mb-4" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  <span>Generando PDFs...</span><span>{progreso}%</span>
                </div>
                <div className="progress-bar" style={{ width: '100%', height: 8 }}>
                  <div className="progress-fill" style={{ width: progreso + '%' }} />
                </div>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleGenerar}
              disabled={generando || !installationId || participes.length === 0 || tiposSeleccionados.length === 0}
            >
              {generando ? `Generando... ${progreso}%` : `Generar y descargar ZIP (${totalDocs} docs)`}
            </button>

          </div>
        </div>

        {/* Historial */}
        <div>
          <div className="section-title mb-8">Documentos generados anteriormente</div>
          {documentosExistentes.length === 0 ? (
            <div className="card">
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-title">Sin historial</div>
                <div className="empty-sub">Los documentos generados aparecerán aquí</div>
              </div>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Documento</th><th>Partícipe</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {documentosExistentes.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontSize: 12 }}>
                        {{ acuerdo_reparto: 'Acuerdo reparto', autorizacion_gestor: 'Autorización gestor', mandamiento_sepa: 'Mandato SEPA' }[d.tipo]}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {d.clients?.nombre} {d.clients?.apellidos}
                      </td>
                      <td>{estadoPill(d.estado)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
