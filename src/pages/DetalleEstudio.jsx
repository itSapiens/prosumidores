import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StudyDetailView from '../components/StudyDetailView.jsx'
import { getStudyDetail, getStudyDisplayName, getStudyReservations } from '../lib/studies.js'

export default function DetalleEstudio() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [study, setStudy] = useState(null)
  const [reservations, setReservations] = useState([])

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    setLoading(true)
    setError('')

    const [studyResult, reservationsResult] = await Promise.all([
      getStudyDetail(id),
      getStudyReservations(id),
    ])

    if (studyResult.error) {
      console.error('study error:', studyResult.error.message || studyResult.error)
      setError('No se pudo cargar el estudio desde Supabase.')
    }

    if (reservationsResult.error) {
      console.error('study reservations error:', reservationsResult.error.message || reservationsResult.error)
      setError(prev => prev || 'No se pudieron cargar las reservas del estudio.')
    }

    setStudy(studyResult.data || null)
    setReservations(reservationsResult.data || [])
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>

  if (!study) {
    return (
      <div className="empty-state">
        <div className="empty-title">Estudio no encontrado</div>
        <div className="empty-sub">Puede que la policy o la RPC no esté devolviendo esta fila todavía.</div>
        <button className="btn" onClick={() => navigate('/estudios')}>← Volver</button>
      </div>
    )
  }

  return (
    <div>
      <div className="breadcrumb mb-16">
        <a className="breadcrumb-link" onClick={() => navigate('/estudios')}>Estudios</a>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-current">{getStudyDisplayName(study) || 'Estudio'}</span>
      </div>

      {error && (
        <div className="alert alert-warning">
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" /><text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
          {error}
        </div>
      )}

      <StudyDetailView
        study={study}
        reservations={reservations}
        onOpenInstallation={installationId => navigate(`/proyectos/${installationId}`)}
      />
    </div>
  )
}
