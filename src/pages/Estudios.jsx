import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import StudyDetailView from '../components/StudyDetailView.jsx'
import {
  STUDY_STATUS_LABELS,
  formatNumber,
  getStudyAnnualSavings,
  getStudyAssignedInstallationName,
  getStudyCups,
  getStudyDisplayName,
  getStudyDocuments,
  getStudyEmail,
  getStudyRecommendedPower,
  getStudyDetail,
  getStudyReservations,
  listStudies,
} from '../lib/studies.js'

function StatusPill({ status }) {
  const meta = STUDY_STATUS_LABELS[status] || { label: status || '—', color: 'pill-gray' }
  return <span className={`pill ${meta.color}`}><span className="pill-dot" />{meta.label}</span>
}

function SummaryCard({ value, label, tone = 'default' }) {
  return (
    <div className={`study-kpi-card ${tone !== 'default' ? `study-kpi-${tone}` : ''}`}>
      <div className="study-kpi-value">{value}</div>
      <div className="study-kpi-label">{label}</div>
    </div>
  )
}

export default function Estudios() {
  const navigate = useNavigate()
  const [estudios, setEstudios] = useState([])
  const [instalaciones, setInstalaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingDrawer, setLoadingDrawer] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [drawerError, setDrawerError] = useState('')
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroInstalacion, setFiltroInstalacion] = useState('')
  const [selectedStudyId, setSelectedStudyId] = useState(null)
  const [selectedStudy, setSelectedStudy] = useState(null)
  const [selectedReservations, setSelectedReservations] = useState([])

  useEffect(() => { cargarDatos() }, [])

  useEffect(() => {
    const handler = event => {
      if (event.key === 'Escape') cerrarDrawer()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  async function cargarDatos() {
    setLoading(true)
    setError('')
    setWarning('')

    const [studiesResult, installationsResult] = await Promise.all([
      listStudies(),
      supabase.from('installations').select('id, nombre_instalacion').order('nombre_instalacion'),
    ])

    if (studiesResult.error) {
      console.error('studies error:', studiesResult.error.message || studiesResult.error)
      setError('No se pudieron cargar los estudios. Revisa las policies/RPC de Supabase o vuelve a intentarlo.')
    }

    if (!studiesResult.error && studiesResult.warnings?.includes('missing_studies_rpc') && (studiesResult.data || []).length === 0) {
      setWarning('La tabla no devuelve filas visibles y la RPC de compatibilidad `get_studies_overview` no está desplegada en este entorno. Si en Supabase ves registros, el siguiente paso es aplicar la migración SQL pendiente.')
    }

    if (installationsResult.error) {
      console.error('installations error:', installationsResult.error.message || installationsResult.error)
    }

    setEstudios(studiesResult.data || [])
    setInstalaciones(installationsResult.data || [])
    setLoading(false)
  }

  async function abrirDrawer(study) {
    setSelectedStudyId(study.id)
    setSelectedStudy(study)
    setSelectedReservations([])
    setDrawerError('')
    setLoadingDrawer(true)

    const [detailResult, reservationsResult] = await Promise.all([
      getStudyDetail(study.id),
      getStudyReservations(study.id),
    ])

    if (detailResult.error) {
      console.error('study detail error:', detailResult.error.message || detailResult.error)
      setDrawerError('No se pudo cargar el detalle completo del estudio.')
    } else {
      setSelectedStudy(detailResult.data || study)
    }

    if (reservationsResult.error) {
      console.error('study reservations error:', reservationsResult.error.message || reservationsResult.error)
      setDrawerError(prev => prev || 'No se pudieron cargar las reservas vinculadas.')
    }

    setSelectedReservations(reservationsResult.data || [])
    setLoadingDrawer(false)
  }

  function cerrarDrawer() {
    setSelectedStudyId(null)
    setSelectedStudy(null)
    setSelectedReservations([])
    setDrawerError('')
  }

  const filtrados = useMemo(() => {
    const query = filtroNombre.trim().toLowerCase()

    return estudios.filter(study => {
      const nombre = (getStudyDisplayName(study) || '').toLowerCase()
      const email = (getStudyEmail(study) || '').toLowerCase()
      const cups = (getStudyCups(study) || '').toLowerCase()
      const instalacion = (getStudyAssignedInstallationName(study) || '').toLowerCase()
      const matchQuery = !query || nombre.includes(query) || email.includes(query) || cups.includes(query) || instalacion.includes(query)
      const matchEstado = !filtroEstado || study.status === filtroEstado
      const matchInstalacion = !filtroInstalacion || study.selected_installation_id === filtroInstalacion
      return matchQuery && matchEstado && matchInstalacion
    })
  }, [estudios, filtroEstado, filtroInstalacion, filtroNombre])

  const metrics = useMemo(() => {
    const totalPotencia = estudios.reduce((acc, study) => acc + (getStudyRecommendedPower(study) || 0), 0)
    return {
      total: estudios.length,
      asignados: estudios.filter(study => study.selected_installation_id).length,
      conPreview: estudios.filter(study => getStudyDocuments(study).length > 0).length,
      potencia: totalPotencia,
    }
  }, [estudios])

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      <div className={`drawer-page-shift ${selectedStudyId ? 'has-drawer' : ''}`}>
        <div className="page-header">
          <div>
            <div className="page-title">Estudios</div>
            <div className="page-sub">{estudios.length} estudios en total</div>
          </div>
        </div>

        <div className="study-kpi-grid mb-16">
          <SummaryCard value={metrics.total} label="Estudios cargados" tone="primary" />
          <SummaryCard value={metrics.asignados} label="Con instalación asignada" />
          <SummaryCard value={metrics.conPreview} label="Con preview listo" />
          <SummaryCard value={`${formatNumber(metrics.potencia, { maximumFractionDigits: 2 }) || '0'} kWp`} label="Potencia recomendada acumulada" />
        </div>

        <div className="flex-row mb-16">
          <input
            type="text"
            className="form-input"
            style={{ maxWidth: 320 }}
            placeholder="Buscar nombre, email, CUPS..."
            value={filtroNombre}
            onChange={event => setFiltroNombre(event.target.value)}
          />
          <select
            className="form-select"
            style={{ maxWidth: 180 }}
            value={filtroEstado}
            onChange={event => setFiltroEstado(event.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(STUDY_STATUS_LABELS).map(([value, meta]) => (
              <option key={value} value={value}>{meta.label}</option>
            ))}
          </select>
          <select
            className="form-select"
            style={{ maxWidth: 220 }}
            value={filtroInstalacion}
            onChange={event => setFiltroInstalacion(event.target.value)}
          >
            <option value="">Todas las instalaciones</option>
            {instalaciones.map(installation => (
              <option key={installation.id} value={installation.id}>{installation.nombre_instalacion}</option>
            ))}
          </select>
          {(filtroNombre || filtroEstado || filtroInstalacion) && (
            <button className="btn btn-ghost" onClick={() => { setFiltroNombre(''); setFiltroEstado(''); setFiltroInstalacion('') }}>
              Limpiar filtros
            </button>
          )}
        </div>

        {error && (
          <div className="alert alert-warning">
            <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" /><text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
            {error}
          </div>
        )}

        {warning && (
          <div className="alert alert-info">
            <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" /><text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="10">i</text></svg>
            {warning}
          </div>
        )}

        {loading ? (
          <div className="loading"><div className="spinner" />Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="empty-title">No hay estudios visibles</div>
            <div className="empty-sub">En cuanto Supabase responda con datos, aparecerán aquí y se podrán abrir en preview lateral.</div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>Cliente</th>
                  <th>CUPS consumo</th>
                  <th>Potencia recomendada</th>
                  <th>Ahorro anual est.</th>
                  <th>Instalación asignada</th>
                  <th>Estado</th>
                  <th>Fecha</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(study => {
                  const nombre = getStudyDisplayName(study)
                  const email = getStudyEmail(study)
                  const cups = getStudyCups(study)
                  const power = getStudyRecommendedPower(study)
                  const annualSavings = getStudyAnnualSavings(study)
                  const installationName = getStudyAssignedInstallationName(study)

                  return (
                    <tr key={study.id} className="clickable" onClick={() => abrirDrawer(study)}>
                      <td>
                        <div className="font-bold">
                          {nombre || <span className="text-muted">Sin nombre</span>}
                        </div>
                        {email && <div className="td-muted">{email}</div>}
                      </td>
                      <td>
                        {cups ? <span className="text-mono">{cups}</span> : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {power != null ? <span className="font-bold">{formatNumber(power, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWp</span> : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {annualSavings != null ? <span className="font-bold">{formatNumber(annualSavings)} €/año</span> : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {installationName || <span className="text-muted">Sin asignar</span>}
                      </td>
                      <td><StatusPill status={study.status} /></td>
                      <td>
                        <div className="td-muted">
                          {study.created_at ? new Date(study.created_at).toLocaleDateString('es-ES') : '—'}
                        </div>
                      </td>
                      <td onClick={event => event.stopPropagation()}>
                        <div className="actions-cell">
                          <button className="btn btn-sm" onClick={() => abrirDrawer(study)}>Preview</button>
                          <button className="btn btn-sm" onClick={() => navigate(`/estudios/${study.id}`)}>Ficha</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedStudyId && (
        <>
          <button className="drawer-backdrop" onClick={cerrarDrawer} aria-label="Cerrar detalle" />
          <aside className="drawer-panel">
            <div className="drawer-header">
              <div>
                <div className="drawer-title">Detalle del estudio</div>
                <div className="drawer-subtitle">Preview, datos completos y reservas en el mismo panel.</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 16, lineHeight: 1 }} onClick={cerrarDrawer}>
                ✕
              </button>
            </div>

            <div className="drawer-body compact">
              {loadingDrawer ? (
                <div className="loading"><div className="spinner" />Cargando detalle...</div>
              ) : !selectedStudy ? (
                <div className="empty-state" style={{ padding: 24 }}>
                  <div className="empty-title">No se pudo abrir el estudio</div>
                  <div className="empty-sub">Intenta volver a cargar la lista o abrir la ficha completa.</div>
                </div>
              ) : (
                <>
                  {drawerError && (
                    <div className="alert alert-warning">
                      <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" /><text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
                      {drawerError}
                    </div>
                  )}

                  <StudyDetailView
                    study={selectedStudy}
                    reservations={selectedReservations}
                    compact
                    onOpenInstallation={installationId => navigate(`/proyectos/${installationId}`)}
                    onOpenFullPage={() => navigate(`/estudios/${selectedStudy.id}`)}
                  />
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
