import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import StudyDetailView from '../components/StudyDetailView.jsx'
import { canCurrentUserDeleteStudies, deleteStudyAdmin, getStudyContract, getStudyDetail, getStudyDisplayName, getStudyInstallation, getStudyReservations, listRelatedStudies } from '../lib/studies.js'
import { mapSupabaseError } from '../lib/errors.js'

export default function DetalleEstudio() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [study, setStudy] = useState(null)
  const [reservations, setReservations] = useState([])
  const [contract, setContract] = useState(null)
  const [installation, setInstallation] = useState(null)
  const [relatedStudies, setRelatedStudies] = useState([])
  const [canDeleteStudies, setCanDeleteStudies] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    setLoading(true)
    setError('')

    const [studyResult, reservationsResult, contractResult, permissionResult] = await Promise.all([
      getStudyDetail(id),
      getStudyReservations(id),
      getStudyContract(id),
      canCurrentUserDeleteStudies(),
    ])

    if (studyResult.error) {
      console.error('study error:', studyResult.error.message || studyResult.error)
      setError('No se pudo cargar el estudio desde Supabase.')
    }

    if (reservationsResult.error) {
      console.error('study reservations error:', reservationsResult.error.message || reservationsResult.error)
      setError(prev => prev || 'No se pudieron cargar las reservas del estudio.')
    }

    if (contractResult.error) {
      console.error('study contract error:', contractResult.error.message || contractResult.error)
      setError(prev => prev || 'No se pudo cargar el contrato vinculado.')
    }

    if (permissionResult.error) {
      console.error('delete studies permission error:', permissionResult.error.message || permissionResult.error)
    }

    const nextStudy = studyResult.data || null
    const nextReservations = reservationsResult.data || []
    const nextContract = contractResult.data || null
    const [installationResult, relatedResult] = await Promise.all([
      getStudyInstallation(nextStudy, nextReservations, nextContract),
      listRelatedStudies(nextStudy),
    ])

    if (installationResult.error) {
      console.error('study installation error:', installationResult.error.message || installationResult.error)
      setError(prev => prev || 'No se pudo cargar la instalación vinculada.')
    }
    if (relatedResult.error) {
      console.error('related studies error:', relatedResult.error.message || relatedResult.error)
      setError(prev => prev || 'No se pudieron cargar los estudios relacionados.')
    }

    setStudy(nextStudy)
    setReservations(nextReservations)
    setContract(nextContract)
    setInstallation(installationResult.data || null)
    setRelatedStudies(relatedResult.data || [])
    setCanDeleteStudies(Boolean(permissionResult.data))
    setLoading(false)
  }

  async function eliminarEstudio() {
    const nombre = getStudyDisplayName(study) || 'este estudio'
    if (!confirm(`¿Eliminar definitivamente el estudio de ${nombre}? Esta acción quitará el estudio de la app y desvinculará sus reservas.`)) return

    setDeleting(true)
    const { error } = await deleteStudyAdmin(id)
    setDeleting(false)

    if (error) {
      alert(mapSupabaseError(error, { entidad: 'estudio' }))
      return
    }

    navigate('/estudios')
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

      {canDeleteStudies && (
        <div className="flex-between mb-16">
          <div />
          <button className="btn btn-danger" onClick={eliminarEstudio} disabled={deleting}>
            {deleting ? 'Eliminando...' : 'Eliminar estudio'}
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-warning">
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" /><text x="8" y="11.5" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
          {error}
        </div>
      )}

      <StudyDetailView
        study={study}
        reservations={reservations}
        contract={contract}
        installation={installation}
        relatedStudies={relatedStudies}
        onOpenInstallation={installationId => navigate(`/proyectos/${installationId}`)}
        onOpenStudy={studyId => navigate(`/estudios/${studyId}`)}
      />
    </div>
  )
}
