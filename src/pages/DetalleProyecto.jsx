import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { descargarDocumento } from '../utils/pdfGenerator.js'
import { mapSupabaseError } from '../lib/errors.js'

const ORIENT_LABEL = { sur:'Sur', sureste:'Sureste', suroeste:'Suroeste', este:'Este', oeste:'Oeste' }

export default function DetalleProyecto() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [instalacion, setInstalacion] = useState(null)
  const [participes, setParticipes] = useState([])
  const [empresa, setEmpresa] = useState(null)
  const [templates, setTemplates] = useState([])
  const [sumaCoef, setSumaCoef] = useState(0)
  const [panelParticipe, setPanelParticipe] = useState(null) // partícipe abierto en panel
  const [panelTab, setPanelTab] = useState('datos')
  const [reservas, setReservas] = useState([])
  const [seleccionados, setSeleccionados] = useState(new Set())
  const [bulkTipo, setBulkTipo] = useState('acuerdo_reparto')
  const [bulkEstado, setBulkEstado] = useState('firmado')
  const [aplicandoBulk, setAplicandoBulk] = useState(false)
  const [versionActiva, setVersionActiva] = useState(null)
  const [versionesHistorial, setVersionesHistorial] = useState([])
  const [cerrandoVersion, setCerrandoVersion] = useState(false)
  const [versionDetalle, setVersionDetalle] = useState(null) // versión abierta en modal de consulta

  useEffect(() => { cargarDatos() }, [id])

  // Cerrar panel con Escape
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setPanelParticipe(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function cargarDatos() {
    setLoading(true)
    const [{ data: inst }, { data: emp }] = await Promise.all([
      supabase.from('installations')
        .select('*, distribuidoras(id, nombre, codigo)')
        .eq('id', id).single(),
      supabase.from('empresa_config').select('*').limit(1).single(),
    ])
    setInstalacion(inst)
    setEmpresa(emp)
    await refrescarReservas()
    if (inst?.distribuidoras?.id) {
      const { data: tmpl } = await supabase.from('document_templates')
        .select('*').eq('distribuidora_id', inst.distribuidoras.id)
      setTemplates(tmpl || [])
    }
    const version = await cargarVersiones()
    await cargarParticipes(version)
    setLoading(false)
  }

  async function cargarVersiones() {
    const { data } = await supabase
      .from('acuerdo_versiones')
      .select('*')
      .eq('installation_id', id)
      .order('version', { ascending: true })
    const activa = data?.find(v => v.estado === 'activo') || null
    const historial = data?.filter(v => v.estado === 'cerrado') || []
    setVersionActiva(activa)
    setVersionesHistorial(historial)
    return activa
  }

  async function cargarParticipes(version) {
    const versionNum = (version ?? versionActiva)?.version || 1
    const { data } = await supabase
      .from('participes')
      .select(`*, clients(id, nombre, apellidos, dni, cups, iban, email, telefono,
        direccion_completa, codigo_postal, poblacion, provincia, tipo_factura,
        consumo_mensual_real_kwh, consumo_medio_mensual_kwh,
        precio_p1_eur_kwh, precio_p2_eur_kwh, precio_p3_eur_kwh,
        precio_p4_eur_kwh, precio_p5_eur_kwh, precio_p6_eur_kwh)`)
      .eq('installation_id', id)
      .eq('active', true)
      .order('created_at', { ascending: true })

    const conDocs = await Promise.all((data || []).map(async p => {
      const { data: docs } = await supabase.from('documents')
        .select('tipo, estado, version_acuerdo')
        .eq('installation_id', id)
        .eq('client_id', p.client_id)
      const estadoDoc = tipo => {
        if (tipo === 'acuerdo_reparto') {
          return docs?.find(d => d.tipo === tipo && d.version_acuerdo === versionNum)?.estado || null
        }
        return docs?.find(d => d.tipo === tipo)?.estado || null
      }
      return {
        ...p,
        doc_acuerdo: estadoDoc('acuerdo_reparto'),
        doc_autorizacion: estadoDoc('autorizacion_gestor'),
        doc_sepa: estadoDoc('mandamiento_sepa'),
      }
    }))
    setParticipes(conDocs)
    const suma = conDocs.reduce((acc, p) => acc + parseFloat(p.coeficiente_reparto || 0), 0)
    setSumaCoef(parseFloat(suma.toFixed(6)))
  }

  // Devuelve true si la versión activa tiene al menos un acuerdo firmado
  function versionActivaBloqueada() {
    if (!versionActiva) return false
    return participes.some(p => p.doc_acuerdo === 'firmado')
  }

  async function eliminarParticipe(participeId) {
    if (versionActivaBloqueada()) {
      alert(`No se pueden eliminar partícipes mientras haya acuerdos firmados en la v${versionActiva.version}. Cierra la versión actual y crea una nueva para hacer cambios.`)
      return
    }
    if (!confirm('¿Eliminar este partícipe de la instalación?')) return
    await supabase.from('participes').update({ active: false }).eq('id', participeId)
    if (panelParticipe?.id === participeId) setPanelParticipe(null)
    await cargarParticipes()
  }

  async function marcarFirmado(clientId, tipo) {
    await actualizarEstadoDoc(clientId, tipo, 'firmado')
  }

  async function escribirEstadoDoc(clientId, tipo, nuevoEstado) {
    const versionNum = tipo === 'acuerdo_reparto' ? (versionActiva?.version || 1) : null
    let query = supabase.from('documents').select('id')
      .eq('installation_id', id).eq('client_id', clientId).eq('tipo', tipo)
    if (versionNum) query = query.eq('version_acuerdo', versionNum)
    const { data: existing } = await query.maybeSingle()

    if (nuevoEstado === '') {
      if (existing) await supabase.from('documents').delete().eq('id', existing.id)
    } else if (existing) {
      await supabase.from('documents').update({
        estado: nuevoEstado,
        firmado_en: nuevoEstado === 'firmado' ? new Date().toISOString() : null
      }).eq('id', existing.id)
    } else {
      await supabase.from('documents').insert({
        installation_id: id, client_id: clientId, tipo, estado: nuevoEstado,
        firmado_en: nuevoEstado === 'firmado' ? new Date().toISOString() : null,
        ...(versionNum ? { version_acuerdo: versionNum } : {})
      })
    }
  }

  async function actualizarEstadoDoc(clientId, tipo, nuevoEstado) {
    await escribirEstadoDoc(clientId, tipo, nuevoEstado)
    await cargarParticipes()
    if (panelParticipe?.client_id === clientId) {
      setParticipes(prev => {
        const actualizado = prev.find(p => p.client_id === clientId)
        if (actualizado) setPanelParticipe(actualizado)
        return prev
      })
    }
  }

  async function cerrarVersion() {
    if (!versionActiva) return
    // Validaciones: suma coef = 1 Y todos los partícipes con acuerdo firmado
    const sumaOk = Math.abs(sumaCoef - 1) < 0.000001
    const firmadosAcuerdo = participes.filter(p => p.doc_acuerdo === 'firmado').length
    const todosFirmados = firmadosAcuerdo === participes.length && participes.length > 0
    if (!sumaOk) {
      alert(`No se puede cerrar: la suma de coeficientes es ${sumaCoef.toFixed(6)} y debe ser 1.000000.`)
      return
    }
    if (!todosFirmados) {
      alert(`No se puede cerrar: faltan ${participes.length - firmadosAcuerdo} acuerdos por firmar.`)
      return
    }
    if (!confirm(`¿Cerrar la versión ${versionActiva.version} del Acuerdo de Reparto? Se guardará una copia inmutable de los partícipes y coeficientes actuales. Para modificar algo tendrás que crear una nueva versión.`)) return
    setCerrandoVersion(true)
    // Capturar snapshot inmutable
    const snapshot = {
      fecha_cierre: new Date().toISOString(),
      instalacion: {
        nombre_instalacion: instalacion?.nombre_instalacion,
        cups_generador: instalacion?.cups_generador,
        potencia_instalada_kwp: instalacion?.potencia_instalada_kwp,
      },
      participes: participes.map(p => ({
        client_id: p.client_id,
        nombre: p.clients?.nombre || '',
        apellidos: p.clients?.apellidos || '',
        dni: p.clients?.dni || '',
        cups: p.clients?.cups || '',
        iban: p.clients?.iban || '',
        email: p.clients?.email || '',
        coeficiente_reparto: parseFloat(p.coeficiente_reparto) || 0,
        kwp_asignados: instalacion?.potencia_instalada_kwp
          ? parseFloat(((p.coeficiente_reparto || 0) * instalacion.potencia_instalada_kwp).toFixed(2))
          : null,
      })),
      suma_coeficientes: parseFloat(sumaCoef.toFixed(6)),
    }
    await supabase.from('acuerdo_versiones')
      .update({ estado: 'cerrado', fecha_cierre: snapshot.fecha_cierre, snapshot })
      .eq('id', versionActiva.id)
    await cargarVersiones()
    setCerrandoVersion(false)
  }

  async function nuevaVersion() {
    const siguienteNum = (versionActiva?.version || versionesHistorial.at(-1)?.version || 0) + 1
    if (!confirm(`¿Iniciar la versión ${siguienteNum} del Acuerdo de Reparto? A partir de ahora podrás modificar partícipes y coeficientes libremente hasta cerrar esta nueva versión.`)) return
    const { data: nueva } = await supabase.from('acuerdo_versiones')
      .insert({ installation_id: id, version: siguienteNum, estado: 'activo' })
      .select().single()
    setVersionActiva(nueva)
    await cargarParticipes(nueva)
  }

  async function aplicarBulk() {
    if (seleccionados.size === 0) return
    setAplicandoBulk(true)
    try {
      const clientIds = [...seleccionados]
      // Todas las escrituras en paralelo, un solo reload al final
      await Promise.all(clientIds.map(clientId => escribirEstadoDoc(clientId, bulkTipo, bulkEstado)))
      await cargarParticipes()
      setSeleccionados(new Set())
    } finally {
      setAplicandoBulk(false)
    }
  }

  async function añadirComoParticipe(reserva) {
    if (!reserva.client_id) {
      alert('Esta reserva no tiene un cliente vinculado en la tabla clients.')
      return
    }
    if (versionActivaBloqueada()) {
      alert(`No se pueden añadir partícipes mientras haya acuerdos firmados en la v${versionActiva.version}. Cierra la versión actual y crea una nueva para hacer cambios.`)
      return
    }
    // Calcular coeficiente de reparto (decimal 0–1, 6 decimales)
    // coef = kWp reservados / potencia instalada total
    const coef = instalacion?.potencia_instalada_kwp
      ? parseFloat((reserva.reserved_kwp / instalacion.potencia_instalada_kwp).toFixed(6))
      : 0

    // Buscar registro existente (activo o inactivo) para evitar violación de unique constraint
    const { data: existente } = await supabase
      .from('participes')
      .select('id, active')
      .eq('installation_id', id)
      .eq('client_id', reserva.client_id)
      .maybeSingle()

    let error
    if (existente) {
      if (existente.active) {
        alert('Este cliente ya es partícipe activo de esta instalación.')
        return
      }
      // Reactivar registro inactivo
      ;({ error } = await supabase
        .from('participes')
        .update({ active: true, coeficiente_reparto: coef })
        .eq('id', existente.id))
    } else {
      // Crear nuevo
      ;({ error } = await supabase.from('participes').insert({
        installation_id: id,
        client_id: reserva.client_id,
        coeficiente_reparto: coef,
        active: true,
      }))
    }

    if (error) {
      alert(mapSupabaseError(error, { entidad: 'partícipe' }))
      return
    }
    await cargarParticipes()
    await refrescarReservas()
  }

  async function refrescarReservas() {
    // 1) Cargar reservas base (sin JOINs que puedan fallar por RLS)
    const { data: res, error } = await supabase
      .from('installation_reservations')
      .select('*')
      .eq('installation_id', id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error cargando reservas:', error.message)
      setReservas([])
      return
    }

    const reservasBase = res || []
    if (reservasBase.length === 0) {
      setReservas([])
      return
    }

    // 2) Enriquecer con studies y clients en paralelo (si falla un JOIN, las reservas se muestran igual)
    const studyIds = [...new Set(reservasBase.map(r => r.study_id).filter(Boolean))]
    const clientIds = [...new Set(reservasBase.map(r => r.client_id).filter(Boolean))]

    const [studiesRes, clientsRes] = await Promise.all([
      studyIds.length
        ? supabase.from('studies').select('id, status, customer').in('id', studyIds)
        : Promise.resolve({ data: [] }),
      clientIds.length
        ? supabase.from('clients').select('id, nombre, apellidos, email, dni').in('id', clientIds)
        : Promise.resolve({ data: [] }),
    ])

    if (studiesRes.error) console.error('Error cargando studies:', studiesRes.error.message)
    if (clientsRes.error) console.error('Error cargando clients:', clientsRes.error.message)

    const studiesMap = Object.fromEntries((studiesRes.data || []).map(s => [s.id, s]))
    const clientsMap = Object.fromEntries((clientsRes.data || []).map(c => [c.id, c]))

    const enriquecidas = reservasBase.map(r => ({
      ...r,
      studies: r.study_id ? studiesMap[r.study_id] || null : null,
      clients: r.client_id ? clientsMap[r.client_id] || null : null,
    }))

    setReservas(enriquecidas)
  }

  async function actualizarPagoReserva(reservaId, nuevoEstado) {
    const { error } = await supabase
      .from('installation_reservations')
      .update({ payment_status: nuevoEstado })
      .eq('id', reservaId)
    if (error) { console.error(error); return }
    await refrescarReservas()
  }

  function abrirPanel(participe) {
    setPanelParticipe(participe)
    setPanelTab('datos')
  }

  const docPill = (estado, size = 11) => {
    if (!estado) return <span className="pill pill-gray" style={{ fontSize: size }}>—</span>
    if (estado === 'firmado') return <span className="pill pill-green" style={{ fontSize: size }}>Firmado</span>
    if (estado === 'enviado') return <span className="pill pill-blue" style={{ fontSize: size }}>Enviado</span>
    return <span className="pill pill-amber" style={{ fontSize: size }}>Generado</span>
  }

  const fmt = v => v ? parseFloat(v).toLocaleString('es-ES', { minimumFractionDigits: 6 }) : '—'
  const fmtDate = d => d ? new Date(d).toLocaleDateString('es-ES') : null

  const totalDocs = participes.length * 3
  const firmados = participes.filter(p => p.doc_acuerdo === 'firmado').length
    + participes.filter(p => p.doc_autorizacion === 'firmado').length
    + participes.filter(p => p.doc_sepa === 'firmado').length
  const pctGlobal = totalDocs > 0 ? Math.round((firmados / totalDocs) * 100) : 0

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>
  if (!instalacion) return <div className="loading">Instalación no encontrada</div>

  const c = panelParticipe?.clients

  return (
    <div style={{ display: 'flex', gap: 0, position: 'relative', minHeight: 600 }}>
      {/* Contenido principal */}
      <div style={{ flex: 1, minWidth: 0, transition: 'margin-right .25s', marginRight: panelParticipe ? 400 : 0 }}>
        <div className="breadcrumb mb-16">
          <a className="breadcrumb-link" onClick={() => navigate('/proyectos')}>Instalaciones</a>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-current">{instalacion.nombre_instalacion}</span>
        </div>

        <div className="flex-between mb-24">
          <div>
            <div className="page-title">{instalacion.nombre_instalacion}</div>
            <div className="page-sub">
              {instalacion.distribuidoras?.nombre || 'Sin distribuidora'} ·{' '}
              {instalacion.tipo_reparto === 'dinamico' ? 'Reparto dinámico' : 'Reparto fijo'}
              {instalacion.orientacion && ` · ${ORIENT_LABEL[instalacion.orientacion] || instalacion.orientacion}`}
              {instalacion.inclinacion != null && ` · ${instalacion.inclinacion}°`}
            </div>
          </div>
          <div className="flex-row gap-8">
            <button className="btn" onClick={() => navigate('/importar', { state: { installationId: id } })}>Importar partícipes</button>
            <button className="btn btn-primary" onClick={() => navigate('/documentos', { state: { installationId: id } })}>Generar documentos</button>
            <button className="btn btn-ghost" onClick={() => navigate(`/proyectos/${id}/datos`)}>Datos</button>
          </div>
        </div>

        {/* Métricas */}
        <div className="metrics-grid mb-24">
          <div className="metric-card">
            <div className="metric-val">{participes.length}</div>
            <div className="metric-label">Partícipes</div>
          </div>
          <div className="metric-card">
            <div className="metric-val">{firmados}</div>
            <div className="metric-label">Docs. firmados</div>
            <div className="metric-delta delta-warn">{totalDocs - firmados} pendientes</div>
          </div>
          <div className="metric-card">
            <div className="metric-val" style={{ color: Math.abs(sumaCoef - 1) < 0.000001 ? '#54D9C7' : '#E24B4A' }}>
              {sumaCoef.toFixed(6)}
            </div>
            <div className="metric-label">Suma coeficientes</div>
            <div className="metric-delta" style={{ color: Math.abs(sumaCoef - 1) < 0.000001 ? '#1A7A6E' : '#A32D2D' }}>
              {Math.abs(sumaCoef - 1) < 0.000001 ? 'Correcto (1.000000)' : `Diferencia: ${(1 - sumaCoef).toFixed(6)}`}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-val">{pctGlobal}%</div>
            <div className="metric-label">Progreso global</div>
            <div className="progress-bar" style={{ marginTop: 6 }}>
              <div className={`progress-fill${pctGlobal < 50 ? ' progress-fill-danger' : pctGlobal < 100 ? ' progress-fill-amber' : ''}`}
                style={{ width: pctGlobal + '%' }} />
            </div>
          </div>
        </div>

        {/* Ficha instalación */}
        <div className="two-col mb-24">
          <div className="card card-sm">
            <div className="card-title mb-8">Datos de la instalación</div>
            <div className="form-grid" style={{ gap: 10 }}>
              {[
                ['CAU generación', instalacion.cups_generador, true],
                ['Distribuidora', instalacion.distribuidoras?.nombre],
                ['Potencia pico', instalacion.potencia_instalada_kwp ? `${instalacion.potencia_instalada_kwp} kWp` : '—'],
                ['Potencia nominal', instalacion.potencia_nominal_kw ? `${instalacion.potencia_nominal_kw} kW` : '—'],
                ['Inclinación', instalacion.inclinacion != null ? `${instalacion.inclinacion}°` : '—'],
                ['Orientación', ORIENT_LABEL[instalacion.orientacion] || '—'],
                ['Fecha prevista', fmtDate(instalacion.fecha_activacion) || '—'],
                ['Fecha real activación', fmtDate(instalacion.fecha_activacion_real)
                  ? <span style={{ color: '#54D9C7', fontWeight: 600 }}>{fmtDate(instalacion.fecha_activacion_real)}</span>
                  : <span style={{ color: '#BA7517' }}>Pendiente</span>],
              ].map(([label, val, mono]) => (
                <div key={label}>
                  <div className="form-label">{label}</div>
                  <div style={{ fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit' }}>{val || '—'}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card card-sm">
            <div className="card-title mb-8">Estado de documentación</div>
            {[
              ['Acuerdos de reparto', 'doc_acuerdo'],
              ['Autorizaciones de gestor', 'doc_autorizacion'],
              ['Mandamientos SEPA', 'doc_sepa'],
            ].map(([label, campo]) => {
              const count = participes.filter(p => p[campo] === 'firmado').length
              const pct = participes.length > 0 ? Math.round((count / participes.length) * 100) : 0
              return (
                <div key={label} className="task-item" style={{ paddingTop: 8, paddingBottom: 8 }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                    background: pct === 100 ? '#54D9C7' : pct > 0 ? '#BA7517' : '#E24B4A'
                  }} />
                  <div style={{ flex: 1 }}>
                    <div className="task-title" style={{ fontSize: 13 }}>{label}</div>
                    <div className="task-sub">{count}/{participes.length} firmados</div>
                  </div>
                  <span className={`pill ${pct === 100 ? 'pill-green' : pct > 0 ? 'pill-amber' : 'pill-gray'}`}>{pct}%</span>
                </div>
              )
            })}

            {/* Card: Acuerdo de reparto — gestión de versiones */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
              {(() => {
                const firmadosAcuerdo = participes.filter(p => p.doc_acuerdo === 'firmado').length
                const sumaOk = Math.abs(sumaCoef - 1) < 0.000001
                const todosFirmados = firmadosAcuerdo === participes.length && participes.length > 0
                const sigNum = (versionesHistorial.at(-1)?.version || 0) + 1

                // CASO 1: Versión activa
                if (versionActiva) {
                  return (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-dark, #000054)', marginBottom: 6 }}>
                        Acuerdo v{versionActiva.version}
                        <span className="pill pill-blue" style={{ marginLeft: 6, fontSize: 10 }}>activo</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        Desde {new Date(versionActiva.fecha_inicio).toLocaleDateString('es-ES')}
                      </div>

                      {/* Condiciones */}
                      <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: sumaOk ? '#1A7A6E' : '#BA7517', fontWeight: 700 }}>
                            {sumaOk ? '✓' : '○'}
                          </span>
                          <span>Reparto: {sumaCoef.toFixed(6)} / 1.000000</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: todosFirmados ? '#1A7A6E' : '#BA7517', fontWeight: 700 }}>
                            {todosFirmados ? '✓' : '○'}
                          </span>
                          <span>Firmados: {firmadosAcuerdo}/{participes.length}</span>
                        </div>
                      </div>

                      {sumaOk && todosFirmados ? (
                        <button
                          className="btn btn-sm btn-primary"
                          style={{ width: '100%' }}
                          onClick={cerrarVersion}
                          disabled={cerrandoVersion}
                        >
                          {cerrandoVersion ? 'Cerrando...' : `Cerrar Acuerdo v${versionActiva.version}`}
                        </button>
                      ) : (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                          {!sumaOk && 'Completa el reparto al 100% '}
                          {!sumaOk && !todosFirmados && 'y '}
                          {!todosFirmados && 'recoge todas las firmas '}
                          para cerrar la versión.
                        </div>
                      )}
                    </div>
                  )
                }

                // CASO 2: No hay versión activa, pero hay historial (última cerrada)
                if (versionesHistorial.length > 0) {
                  const ultima = versionesHistorial.at(-1)
                  return (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-dark, #000054)', marginBottom: 6 }}>
                        Acuerdo v{ultima.version}
                        <span className="pill pill-green" style={{ marginLeft: 6, fontSize: 10 }}>cerrada</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10 }}>
                        Cerrada el {new Date(ultima.fecha_cierre).toLocaleDateString('es-ES')}
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        style={{ width: '100%' }}
                        onClick={nuevaVersion}
                      >
                        + Generar nuevo acuerdo (v{sigNum})
                      </button>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6, fontStyle: 'italic' }}>
                        Al generar v{sigNum} podrás volver a modificar partícipes y coeficientes.
                      </div>
                    </div>
                  )
                }

                // CASO 3: Sin versión activa y sin historial → esperando primer cierre
                return (
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary-dark, #000054)', marginBottom: 6 }}>
                      Acuerdo de reparto
                    </div>
                    <div style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: sumaOk ? '#1A7A6E' : '#BA7517', fontWeight: 700 }}>
                          {sumaOk ? '✓' : '○'}
                        </span>
                        <span>Reparto: {sumaCoef.toFixed(6)} / 1.000000</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, fontStyle: 'italic' }}>
                        {sumaOk
                          ? 'Genera el PDF del acuerdo en Documentos para iniciar v1.'
                          : 'Añade partícipes hasta sumar 1.000000 para poder generar el acuerdo.'}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>

        {/* Tabla partícipes */}
        <div className="section-header mb-8">
          <span className="section-title">Partícipes ({participes.length}) — haz clic para ver el detalle</span>
          <div className="flex-row gap-8">
            {Math.abs(sumaCoef - 1) > 0.000001 && participes.length > 0 && (
              <span className="pill pill-red">⚠ Coeficientes no suman 1.000000</span>
            )}
            <button className="btn btn-sm" onClick={() => navigate('/importar', { state: { installationId: id } })}>
              + Importar desde Excel
            </button>
          </div>
        </div>

        {participes.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">Sin partícipes</div>
            <div className="empty-sub">Importa partícipes desde Excel para continuar</div>
            <button className="btn btn-primary" onClick={() => navigate('/importar', { state: { installationId: id } })}>
              Importar partícipes
            </button>
          </div>
        ) : (
          <>
          {/* Barra de acción masiva */}
          {seleccionados.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--primary-light)', borderRadius: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{seleccionados.size} seleccionados</span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>→ Cambiar estado de</span>
              <select value={bulkTipo} onChange={e => setBulkTipo(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <option value="acuerdo_reparto">Acuerdo de reparto</option>
                <option value="autorizacion_gestor">Autorización de gestor</option>
                <option value="mandamiento_sepa">Mandamiento SEPA</option>
              </select>
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>a</span>
              <select value={bulkEstado} onChange={e => setBulkEstado(e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <option value="">— Sin estado</option>
                <option value="generado">Generado</option>
                <option value="enviado">Enviado</option>
                <option value="firmado">Firmado</option>
              </select>
              <button className="btn btn-primary btn-sm" onClick={aplicarBulk} disabled={aplicandoBulk}>
                {aplicandoBulk ? 'Aplicando...' : 'Aplicar'}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setSeleccionados(new Set())}>Cancelar</button>
            </div>
          )}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox"
                      checked={seleccionados.size === participes.length && participes.length > 0}
                      onChange={e => setSeleccionados(e.target.checked ? new Set(participes.map(p => p.client_id)) : new Set())}
                    />
                  </th>
                  <th style={{ width: '22%' }}>Nombre</th>
                  <th>NIF</th>
                  <th style={{ width: '22%' }}>CUPS consumo</th>
                  <th>kWp</th>
                  <th>Coef.</th>
                  <th>Acuerdo</th>
                  <th>Gestor</th>
                  <th>SEPA</th>
                  <th>Acc.</th>
                </tr>
              </thead>
              <tbody>
                {participes.map(p => {
                  const cl = p.clients
                  const isSelected = panelParticipe?.id === p.id
                  const isChecked = seleccionados.has(p.client_id)
                  return (
                    <tr key={p.id}
                      className="clickable"
                      style={{ background: isChecked ? 'var(--primary-light)' : isSelected ? 'var(--primary-light)' : undefined }}
                      onClick={() => abrirPanel(p)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={isChecked}
                          onChange={e => {
                            const next = new Set(seleccionados)
                            e.target.checked ? next.add(p.client_id) : next.delete(p.client_id)
                            setSeleccionados(next)
                          }} />
                      </td>
                      <td>
                        <div className="font-bold">{cl?.nombre} {cl?.apellidos}</div>
                        {cl?.email && <div className="td-muted">{cl.email}</div>}
                      </td>
                      <td className="text-mono">{cl?.dni}</td>
                      <td className="text-mono" style={{ fontSize: 11 }}>{cl?.cups || '—'}</td>
                      <td className="font-bold">
                        {instalacion?.potencia_instalada_kwp
                          ? `${(parseFloat(p.coeficiente_reparto || 0) * instalacion.potencia_instalada_kwp).toFixed(2)} kWp`
                          : '—'}
                      </td>
                      <td className="font-bold">{parseFloat(p.coeficiente_reparto).toFixed(6)}</td>
                      {[
                        [p.doc_acuerdo, 'acuerdo_reparto'],
                        [p.doc_autorizacion, 'autorizacion_gestor'],
                        [p.doc_sepa, 'mandamiento_sepa'],
                      ].map(([estado, tipo]) => (
                        <td key={tipo} onClick={e => e.stopPropagation()}>
                          <select
                            value={estado || ''}
                            onChange={e => actualizarEstadoDoc(p.client_id, tipo, e.target.value)}
                            style={{
                              fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid var(--border)',
                              background: estado === 'firmado' ? '#d1fae5' : estado === 'enviado' ? '#dbeafe' : estado === 'generado' ? '#fef3c7' : 'var(--bg)',
                              color: estado === 'firmado' ? '#065f46' : estado === 'enviado' ? '#1e40af' : estado === 'generado' ? '#92400e' : 'var(--text-secondary)',
                              cursor: 'pointer', fontWeight: 600
                            }}>
                            <option value="">—</option>
                            <option value="generado">Generado</option>
                            <option value="enviado">Enviado</option>
                            <option value="firmado">Firmado</option>
                          </select>
                        </td>
                      ))}
                      <td onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm btn-ghost" onClick={() => eliminarParticipe(p.id)}>✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          </>
        )}

        {/* Reservas de esta instalación */}
        <div className="section-header mb-8" style={{ marginTop: 32 }}>
          <span className="section-title">
            Reservas ({reservas.length})
            {reservas.length > 0 && (
              <span style={{ marginLeft: 8, fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
                · {reservas.reduce((s, r) => s + (r.reserved_kwp || 0), 0).toFixed(1)} kWp reservados
              </span>
            )}
          </span>
          <button className="btn btn-sm" onClick={() => navigate(`/estudios`)}>Ver estudios</button>
        </div>

        {reservas.length === 0 ? (
          <div style={{ padding: '20px 0', color: 'var(--text-muted)', fontSize: 13 }}>
            No hay reservas vinculadas a esta instalación
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>kWp reservados</th>
                  <th>Estado reserva</th>
                  <th>Pago</th>
                  <th>Plazo pago</th>
                  <th>Partícipe</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map(r => {
                  // Nombre: preferir clients (tabla real) sobre studies.customer (JSON snapshot)
                  const cl   = r.clients || {}
                  const cust = r.studies?.customer || {}
                  const nombre = cl.nombre || cust.nombre || ''
                  const apellidos = cl.apellidos || cust.apellidos || ''
                  const email = cl.email || cust.email || ''

                  const rsLabel = {
                    pending_payment: ['Pendiente pago', 'pill-amber'],
                    paid:            ['Pagado',          'pill-green'],
                    confirmed:       ['Confirmado',      'pill-blue'],
                    released:        ['Liberado',        'pill-gray'],
                    cancelled:       ['Cancelado',       'pill-gray'],
                  }[r.reservation_status] || [r.reservation_status || '—', 'pill-gray']
                  const PAY_OPTS = [
                    { value: 'pending',      label: 'Pendiente',       color: 'pill-amber' },
                    { value: 'signal_paid',  label: 'Reserva pagada',  color: 'pill-blue'  },
                    { value: 'paid',         label: 'Pago completo',   color: 'pill-green' },
                  ]
                  const payOpt = PAY_OPTS.find(o => o.value === r.payment_status) || PAY_OPTS[0]

                  // ¿Ya es partícipe activo?
                  const esParticipe = r.client_id
                    ? participes.some(p => p.client_id === r.client_id)
                    : false

                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="font-bold">
                          {nombre || apellidos
                            ? `${nombre} ${apellidos}`.trim()
                            : <span className="text-muted">Sin nombre</span>}
                        </div>
                        {email && <div className="td-muted">{email}</div>}
                      </td>
                      <td className="font-bold">{r.reserved_kwp} kWp</td>
                      <td><span className={`pill ${rsLabel[1]}`}><span className="pill-dot" />{rsLabel[0]}</span></td>
                      <td onClick={e => e.stopPropagation()}>
                        <select
                          value={r.payment_status || 'pending'}
                          onChange={e => actualizarPagoReserva(r.id, e.target.value)}
                          className={`pill ${payOpt.color}`}
                          style={{
                            border: 'none', background: 'transparent', cursor: 'pointer',
                            fontSize: 11, fontWeight: 500, padding: '2px 4px',
                            appearance: 'auto', maxWidth: 130,
                          }}
                        >
                          {PAY_OPTS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </td>
                      <td>{r.payment_deadline_at ? new Date(r.payment_deadline_at).toLocaleDateString('es-ES') : '—'}</td>
                      <td>
                        {esParticipe
                          ? <span className="pill pill-green"><span className="pill-dot" />Sí</span>
                          : <span className="pill pill-gray"><span className="pill-dot" />No</span>}
                      </td>
                      <td>
                        <div className="actions-cell">
                          {!esParticipe && r.client_id && (
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => añadirComoParticipe(r)}
                              title={`Añadir con coef. ${instalacion?.potencia_instalada_kwp ? (r.reserved_kwp / instalacion.potencia_instalada_kwp).toFixed(6) : '?'}`}
                            >
                              + Partícipe
                            </button>
                          )}
                          {r.study_id && (
                            <button className="btn btn-sm" onClick={() => navigate(`/estudios/${r.study_id}`)}>
                              Ver estudio
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Historial de versiones del Acuerdo de Reparto */}
        {versionesHistorial.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div className="section-header mb-8">
              <span className="section-title">Historial de Acuerdos de Reparto</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Versión</th>
                    <th>Fecha inicio</th>
                    <th>Fecha cierre</th>
                    <th>Partícipes</th>
                    <th>Estado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {versionesHistorial.map(v => (
                    <tr key={v.id}>
                      <td className="font-bold">v{v.version}</td>
                      <td>{new Date(v.fecha_inicio).toLocaleDateString('es-ES')}</td>
                      <td>{v.fecha_cierre ? new Date(v.fecha_cierre).toLocaleDateString('es-ES') : '—'}</td>
                      <td>{v.snapshot?.participes?.length ?? '—'}</td>
                      <td><span className="pill pill-green">Cerrado</span></td>
                      <td>
                        <button
                          className="btn btn-sm"
                          onClick={() => setVersionDetalle(v)}
                          disabled={!v.snapshot}
                          title={!v.snapshot ? 'Esta versión se cerró antes de implementar el snapshot' : 'Ver partícipes y coeficientes'}
                        >
                          Ver detalle
                        </button>
                      </td>
                    </tr>
                  ))}
                  {versionActiva && (
                    <tr>
                      <td className="font-bold">v{versionActiva.version}</td>
                      <td>{new Date(versionActiva.fecha_inicio).toLocaleDateString('es-ES')}</td>
                      <td>—</td>
                      <td>{participes.length}</td>
                      <td><span className="pill pill-blue">Activo</span></td>
                      <td>—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Modal: detalle de snapshot de una versión cerrada */}
        {versionDetalle && (
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 100,
              background: 'rgba(0,0,84,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 24,
            }}
            onClick={() => setVersionDetalle(null)}
          >
            <div
              style={{
                background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
                maxWidth: 900, width: '100%', maxHeight: '85vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{
                padding: '16px 24px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary-dark, #000054)' }}>
                    Acuerdo de Reparto v{versionDetalle.version}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    {versionDetalle.snapshot?.instalacion?.nombre_instalacion}
                    {' · '}
                    Cerrada {new Date(versionDetalle.fecha_cierre).toLocaleDateString('es-ES')}
                    {versionDetalle.snapshot?.instalacion?.cups_generador &&
                      ` · CAU ${versionDetalle.snapshot.instalacion.cups_generador}`}
                  </div>
                </div>
                <button className="btn btn-ghost" onClick={() => setVersionDetalle(null)}>✕ Cerrar</button>
              </div>

              <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
                {versionDetalle.snapshot?.participes?.length > 0 ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Nombre</th>
                          <th>NIF</th>
                          <th>CUPS</th>
                          <th>kWp</th>
                          <th>Coef.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {versionDetalle.snapshot.participes.map((p, i) => (
                          <tr key={i}>
                            <td className="font-bold">
                              {p.nombre} {p.apellidos}
                              {p.email && <div className="td-muted">{p.email}</div>}
                            </td>
                            <td className="text-mono">{p.dni || '—'}</td>
                            <td className="text-mono" style={{ fontSize: 11 }}>{p.cups || '—'}</td>
                            <td className="font-bold">{p.kwp_asignados != null ? `${p.kwp_asignados} kWp` : '—'}</td>
                            <td className="font-bold">{parseFloat(p.coeficiente_reparto || 0).toFixed(6)}</td>
                          </tr>
                        ))}
                        <tr style={{ background: 'var(--surface-alt)', fontWeight: 700 }}>
                          <td colSpan={3} style={{ textAlign: 'right' }}>Total:</td>
                          <td>
                            {versionDetalle.snapshot.instalacion?.potencia_instalada_kwp != null
                              ? `${versionDetalle.snapshot.instalacion.potencia_instalada_kwp} kWp`
                              : '—'}
                          </td>
                          <td>{(versionDetalle.snapshot.suma_coeficientes ?? 0).toFixed(6)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-state">
                    <div className="empty-title">Sin snapshot disponible</div>
                    <div className="empty-sub">Esta versión se cerró antes de implementarse el sistema de snapshot inmutable.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Panel lateral deslizante del partícipe */}
      {panelParticipe && (
        <div style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: 390,
          background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', zIndex: 20,
          borderRadius: '0 0 var(--radius-lg) 0',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.06)'
        }}>
          {/* Cabecera del panel */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--info-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--info-text)', flexShrink: 0 }}>
              {(c?.nombre?.[0] || '') + (c?.apellidos?.[0] || '')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c?.nombre} {c?.apellidos}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                NIF: {c?.dni} · Coef: {parseFloat(panelParticipe.coeficiente_reparto).toFixed(6)}
              </div>
            </div>
            <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 16, lineHeight: 1 }}
              onClick={() => setPanelParticipe(null)}>✕</button>
          </div>

          {/* Tabs del panel */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {[['datos', 'Datos personales'], ['contrato', 'Contrato'], ['docs', 'Documentos']].map(([tab, label]) => (
              <button key={tab}
                onClick={() => setPanelTab(tab)}
                style={{
                  flex: 1, padding: '9px 6px', fontSize: 12, cursor: 'pointer',
                  color: panelTab === tab ? 'var(--primary-dark)' : 'var(--text-secondary)',
                  borderBottom: panelTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                  marginBottom: -1, background: 'none', border: 'none',
                  fontWeight: panelTab === tab ? 600 : 400,
                }}>
                {label}
              </button>
            ))}
          </div>

          {/* Cuerpo del panel */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>

            {panelTab === 'datos' && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '12px 0 6px' }}>Datos de contacto</div>
                {[
                  ['Email', c?.email],
                  ['Teléfono', c?.telefono],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 500 }}>{v || '—'}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '12px 0 6px' }}>Dirección</div>
                {[
                  ['Dirección', c?.direccion_completa],
                  ['Código postal', c?.codigo_postal],
                  ['Población', c?.poblacion],
                  ['Provincia', c?.provincia],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: 220 }}>{v || '—'}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '12px 0 6px' }}>Datos de suministro</div>
                {[
                  ['CUPS consumo', c?.cups, true],
                  ['Tipo de factura', c?.tipo_factura],
                  ['Consumo mensual real', c?.consumo_mensual_real_kwh ? `${c.consumo_mensual_real_kwh} kWh` : null],
                  ['Consumo medio mensual', c?.consumo_medio_mensual_kwh ? `${c.consumo_medio_mensual_kwh} kWh` : null],
                ].map(([k, v, mono]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 500, fontFamily: mono ? 'monospace' : 'inherit', fontSize: mono ? 11 : 12 }}>{v || '—'}</span>
                  </div>
                ))}
              </>
            )}

            {panelTab === 'contrato' && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '12px 0 6px' }}>Datos del contrato</div>
                {[
                  ['Coeficiente de reparto', parseFloat(panelParticipe.coeficiente_reparto).toFixed(6)],
                  ['IBAN', c?.iban || <span style={{ color: '#A32D2D' }}>Sin IBAN registrado</span>],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                    <span style={{ fontWeight: 500, fontFamily: k === 'IBAN' ? 'monospace' : 'inherit', fontSize: k === 'IBAN' ? 11 : 12 }}>{v}</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '12px 0 6px' }}>Precios por período</div>
                {[
                  ['P1', c?.precio_p1_eur_kwh], ['P2', c?.precio_p2_eur_kwh], ['P3', c?.precio_p3_eur_kwh],
                  ['P4', c?.precio_p4_eur_kwh], ['P5', c?.precio_p5_eur_kwh], ['P6', c?.precio_p6_eur_kwh],
                ].filter(([, v]) => v != null).map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Precio {k}</span>
                    <span style={{ fontWeight: 500 }}>{fmt(v)} €/kWh</span>
                  </div>
                ))}
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '12px 0 6px' }}>Tarifa</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Tipo de factura</span>
                  <span style={{ fontWeight: 500 }}>{c?.tipo_factura || '—'}</span>
                </div>
              </>
            )}

            {panelTab === 'docs' && (
              <>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)', padding: '12px 0 6px' }}>Estado de documentos</div>
                {[
                  ['Acuerdo de reparto', 'doc_acuerdo', 'acuerdo_reparto', 'Firma del partícipe'],
                  ['Autorización de gestor', 'doc_autorizacion', 'autorizacion_gestor', 'Delegación ante distribuidora'],
                  ['Mandamiento SEPA', 'doc_sepa', 'mandamiento_sepa', 'Domiciliación bancaria'],
                ].map(([label, campo, tipo, desc]) => (
                  <div key={tipo} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{desc}</div>
                    </div>
                    <div className="flex-row gap-4">
                      {docPill(panelParticipe[campo], 11)}
                      <button className="btn btn-sm" onClick={async () => {
                        const t = templates.find(t => t.tipo === tipo)
                        if (t && empresa) {
                          descargarDocumento(panelParticipe, instalacion, empresa, t, tipo)
                          await actualizarEstadoDoc(panelParticipe.client_id, tipo, 'generado')
                        } else alert('Configura la empresa y las plantillas primero')
                      }}>PDF</button>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn" style={{ justifyContent: 'center' }}
                    onClick={() => marcarFirmado(panelParticipe.client_id, 'acuerdo_reparto')
                      .then(() => marcarFirmado(panelParticipe.client_id, 'autorizacion_gestor'))
                      .then(() => marcarFirmado(panelParticipe.client_id, 'mandamiento_sepa'))}>
                    Marcar todos como firmados
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
