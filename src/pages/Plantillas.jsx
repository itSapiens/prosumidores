import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

const TIPOS = [
  { id: 'acuerdo_reparto', label: 'Acuerdo de reparto' },
  { id: 'autorizacion_gestor', label: 'Autorización de gestor' },
  { id: 'mandamiento_sepa', label: 'Mandamiento SEPA' },
  { id: 'acuerdo_reparto_colectivo', label: 'Acuerdo reparto colectivo' },
]

const VARIABLES_POR_TIPO = {
  acuerdo_reparto: [
    '{{nombre_participe}}', '{{apellidos_participe}}', '{{dni_participe}}',
    '{{cups_consumo}}', '{{iban_participe}}', '{{bic_participe}}',
    '{{direccion_participe}}', '{{coeficiente}}', '{{cups_generador}}',
    '{{direccion_instalacion}}', '{{potencia_kwp}}', '{{tipo_reparto}}',
    '{{nombre_distribuidora}}', '{{nombre_empresa}}', '{{cif_empresa}}',
    '{{direccion_empresa}}', '{{representante_legal}}', '{{creditor_id_sepa}}',
    '{{municipio}}', '{{fecha_generacion}}', '{{rum}}',
  ],
  autorizacion_gestor: [
    '{{nombre_participe}}', '{{apellidos_participe}}', '{{dni_participe}}',
    '{{cups_consumo}}', '{{cups_generador}}', '{{direccion_instalacion}}',
    '{{nombre_empresa}}', '{{cif_empresa}}', '{{representante_legal}}',
    '{{municipio}}', '{{fecha_generacion}}',
  ],
  mandamiento_sepa: [
    '{{nombre_participe}}', '{{apellidos_participe}}', '{{dni_participe}}',
    '{{iban_participe}}', '{{bic_participe}}', '{{direccion_participe}}',
    '{{nombre_empresa}}', '{{cif_empresa}}', '{{creditor_id_sepa}}',
    '{{municipio}}', '{{fecha_generacion}}', '{{rum}}',
  ],
  acuerdo_reparto_colectivo: [
    '{{cau}}', '{{nombre_instalacion}}', '{{potencia_kwp}}', '{{tipo_reparto}}',
    '{{nombre_distribuidora}}', '{{nombre_empresa}}', '{{cif_empresa}}',
    '{{direccion_empresa}}', '{{representante_legal}}', '{{municipio}}',
    '{{fecha_generacion}}', '{{num_consumidores}}', '{{tabla_consumidores}}',
  ],
}
// Compatibilidad: VARIABLES sigue disponible para tipos sin entrada específica
const VARIABLES = VARIABLES_POR_TIPO.acuerdo_reparto

const CONTENIDO_DEFAULT_COLECTIVO = [
  'ACUERDO DE REPARTO DE ENERGÍA DE UN AUTOCONSUMO COLECTIVO',
  '',
  'Los consumidores asociados firmantes de este documento formamos parte de un autoconsumo colectivo según lo previsto en el Real Decreto 244/2019, de 5 de abril, por el que se regulan las condiciones administrativas, técnicas y económicas del autoconsumo de energía eléctrica, identificado por:',
  '',
  'CÓDIGO DE AUTOCONSUMO (CAU): {{cau}}',
  '',
  'Inscrito bajo la modalidad de autoconsumo colectivo:',
  '[X] CON excedentes ACOGIDA a compensación',
  '',
  'Con productor y titular de la instalación de autoconsumo:',
  '[X] Nombre/razón social: {{nombre_empresa}}',
  '    REPR: {{representante_legal}}',
  '    NIF: {{cif_empresa}}',
  '    Dirección: {{direccion_empresa}}',
  '    Municipio: {{municipio}}',
  '    Coeficiente: 1',
  '',
  'ACUERDOS',
  '',
  'Los consumidores asociados y el productor acordamos que:',
  '',
  '[X] SI nos acogemos voluntariamente al mecanismo de compensación simplificada entre los déficits de sus consumos y la totalidad de los excedentes de sus instalaciones de generación asociadas, según lo dispuesto en el RD 244/2019, de 5 de abril.',
  '',
  'Con ello, los consumidores asociados solicitamos la aplicación del mecanismo de compensación simplificada de los excedentes de la instalación de autoconsumo a cada uno de nosotros de forma individual, que se hará efectiva según los plazos contemplados en la normativa vigente (1).',
  '',
  'Igualmente, los consumidores asociados acordamos que el reparto de energía se realizará según los coeficientes de reparto β pactados entre nosotros y que se reflejan en el fichero *.txt que se adjunta a este acuerdo en formato digital.',
  '',
  'La duración mínima de este acuerdo de reparto es de un año desde la fecha de su firma, prorrogable anualmente de forma automática. Si alguna de las partes decidiera modificar el presente acuerdo de reparto, deberá realizarlo según los plazos contemplados en la normativa vigente.',
  '',
  'Queda prohibido el tratamiento de los datos personales de los firmantes de este documento con fines distintos de aquellos para los que hayan sido recogidos inicialmente, y no podrán utilizarse para ningún otro fin distinto de la aplicación de los coeficientes de reparto a los integrantes del autoconsumo colectivo.',
  '',
  'En {{municipio}} a {{fecha_generacion}}.',
  '',
  'Firma del productor y titular del autoconsumo colectivo:',
  '{{nombre_empresa}} / REPR: {{representante_legal}}',
  '',
  '(1) Orden TED/1247/2021 de 15 de noviembre, por la que se modifica, para la implementación de coeficientes de reparto variables en autoconsumo colectivo, el anexo I del Real Decreto 244/2019, de 5 de abril, por el que se regulan las condiciones administrativas, técnicas y económicas del autoconsumo de energía eléctrica.',
  '',
  'Firma de los consumidores asociados al autoconsumo colectivo:',
  '',
  '{{tabla_consumidores}}',
].join('\n')

export default function Plantillas() {
  const [distribuidoras, setDistribuidoras] = useState([])
  const [distSeleccionada, setDistSeleccionada] = useState(null)
  const [tipoActivo, setTipoActivo] = useState('acuerdo_reparto')
  const [templates, setTemplates] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.from('distribuidoras').select('*').order('nombre').then(({ data, error }) => {
      if (error) console.error('distribuidoras:', error)
      const lista = data || []
      setDistribuidoras(lista)
      if (lista.length > 0) setDistSeleccionada(lista[0])
    })
  }, [])

  useEffect(() => {
    if (distSeleccionada) cargarTemplates(distSeleccionada.id)
  }, [distSeleccionada])

  async function cargarTemplates(distribuidoraId) {
    setLoading(true)
    const { data } = await supabase
      .from('document_templates')
      .select('*')
      .eq('distribuidora_id', distribuidoraId)

    const mapa = {}
    ;(data || []).forEach(t => { mapa[t.tipo] = t })
    setTemplates(mapa)
    setLoading(false)
  }

  function handleCambioContenido(contenido) {
    setTemplates(prev => ({
      ...prev,
      [tipoActivo]: {
        ...(prev[tipoActivo] || { tipo: tipoActivo, distribuidora_id: distSeleccionada?.id }),
        contenido
      }
    }))
    setGuardado(false)
  }

  function insertarVariable(variable) {
    const textarea = document.getElementById('template-editor')
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = templates[tipoActivo]?.contenido || ''
    const nuevo = current.slice(0, start) + variable + current.slice(end)
    handleCambioContenido(nuevo)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 0)
  }

  async function handleGuardar() {
    if (!distSeleccionada) return
    setGuardando(true)

    const tipo = tipoActivo
    const template = templates[tipo]
    if (!template) { setGuardando(false); return }

    const payload = {
      distribuidora_id: distSeleccionada.id,
      tipo,
      contenido: template.contenido || '',
      active: true,
    }

    let error
    if (template.id) {
      ;({ error } = await supabase.from('document_templates').update({ contenido: template.contenido }).eq('id', template.id))
    } else {
      let data
      ;({ data, error } = await supabase.from('document_templates').insert(payload).select().single())
      if (!error && data) {
        setTemplates(prev => ({ ...prev, [tipo]: data }))
      }
    }

    setGuardando(false)
    if (!error) { setGuardado(true); setTimeout(() => setGuardado(false), 2500) }
    else alert('Error al guardar: ' + error.message)
  }

  const templateActual = templates[tipoActivo]
  const variablesActivas = VARIABLES_POR_TIPO[tipoActivo] || VARIABLES

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Gestión de plantillas</div>
          <div className="page-sub">Edita el contenido de los documentos por distribuidora</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 20 }}>
        {/* Lista distribuidoras */}
        <div>
          <div className="section-title mb-8">Distribuidora</div>
          <div className="template-sidebar">
            {distribuidoras.map(d => (
              <div
                key={d.id}
                className={`template-sidebar-item ${distSeleccionada?.id === d.id ? 'active' : ''}`}
                onClick={() => setDistSeleccionada(d)}
              >
                {d.nombre}
              </div>
            ))}
          </div>
        </div>

        {/* Editor */}
        <div>
          {!distSeleccionada ? (
            <div className="empty-state">
              <div className="empty-title">Selecciona una distribuidora</div>
            </div>
          ) : (
            <>
              {/* Tabs de tipo */}
              <div className="flex-between mb-8">
                <div className="template-tabs" style={{ borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', display: 'inline-flex' }}>
                  {TIPOS.map(t => (
                    <button
                      key={t.id}
                      className={`template-tab ${tipoActivo === t.id ? 'active' : ''}`}
                      onClick={() => setTipoActivo(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="flex-row gap-8">
                  {guardado && <span className="pill pill-green">✓ Guardado</span>}
                  <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
                    {guardando ? 'Guardando...' : 'Guardar plantilla'}
                  </button>
                </div>
              </div>

              {/* Variables disponibles */}
              <div className="card mb-8" style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div className="text-sm text-muted">
                    Variables disponibles — haz clic para insertar en la posición del cursor:
                  </div>
                  {tipoActivo === 'acuerdo_reparto_colectivo' && !templateActual?.contenido && (
                    <button className="btn btn-sm" style={{ fontSize: 11 }}
                      onClick={() => handleCambioContenido(CONTENIDO_DEFAULT_COLECTIVO)}>
                      Cargar plantilla por defecto
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {variablesActivas.map(v => (
                    <span key={v} className="var-chip"
                      style={v === '{{tabla_consumidores}}' ? { background: 'var(--primary)', color: '#fff' } : {}}
                      onClick={() => insertarVariable(v)}>{v}</span>
                  ))}
                </div>
                {tipoActivo === 'acuerdo_reparto_colectivo' && (
                  <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                    <strong>{'{{tabla_consumidores}}'}</strong> — se sustituye por la tabla con todos los partícipes de la instalación (nombre, NIF, CUPS, coeficiente, firma).
                  </div>
                )}
              </div>

              {/* Editor de texto */}
              {loading ? (
                <div className="loading"><div className="spinner" />Cargando plantilla...</div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '8px 14px', background: 'var(--surface-alt)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-secondary)' }}>
                    {distSeleccionada.nombre} — {TIPOS.find(t => t.id === tipoActivo)?.label}
                    {templateActual?.id && <span style={{ marginLeft: 8, color: 'var(--text-muted)' }}>· Guardada en base de datos</span>}
                    {!templateActual?.id && <span style={{ marginLeft: 8, color: 'var(--warning-text)' }}>· Sin guardar</span>}
                  </div>
                  <textarea
                    id="template-editor"
                    className="form-textarea"
                    style={{
                      border: 'none', borderRadius: 0, padding: '14px',
                      minHeight: 480, fontFamily: 'monospace', fontSize: 13,
                      lineHeight: 1.7, resize: 'vertical'
                    }}
                    value={templateActual?.contenido || ''}
                    onChange={e => handleCambioContenido(e.target.value)}
                    placeholder="Escribe el contenido de la plantilla aquí. Usa {{variable}} para insertar datos dinámicos..."
                    spellCheck={false}
                  />
                </div>
              )}

              <div className="card" style={{ marginTop: 12, padding: '10px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>Tip:</strong> Los saltos de línea se respetan en el PDF.
                Usa doble salto para separar párrafos. Las variables en <code style={{ background: 'var(--bg)', padding: '1px 4px', borderRadius: 3 }}>{'{{mayúsculas}}'}</code> se respetan tal cual.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
