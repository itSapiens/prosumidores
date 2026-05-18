import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { getInstallationPosition, InstallationsMap } from '../components/InstallationMap.jsx'

function formatCoord(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(6) : '—'
}

export default function MapaInstalaciones() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [installations, setInstallations] = useState([])
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    cargarInstalaciones()
  }, [])

  async function cargarInstalaciones() {
    setLoading(true)
    setError('')
    const { data, error: queryError } = await supabase
      .from('installations')
      .select('*, distribuidoras(id, nombre), empresas(id, nombre)')
      .eq('active', true)
      .order('nombre_instalacion')

    if (queryError) {
      console.error('map installations error:', queryError)
      setError('No se pudieron cargar las instalaciones.')
    }

    setInstallations(data || [])
    setLoading(false)
  }

  const withCoords = useMemo(() => {
    return installations.filter(installation => getInstallationPosition(installation))
  }, [installations])

  const withoutCoords = installations.length - withCoords.length

  return (
    <div className="map-page">
      <div className="page-header">
        <div>
          <div className="page-title">Mapa de instalaciones</div>
          <div className="page-sub">
            {withCoords.length} instalaciones geolocalizadas
            {withoutCoords > 0 ? ` · ${withoutCoords} sin coordenadas` : ''}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/proyectos/nuevo')}>
          + Nueva instalación
        </button>
      </div>

      {error && (
        <div className="alert alert-danger">
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7"/><text x="7.5" y="12" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
          {error}
        </div>
      )}

      <div className="map-shell">
        {loading ? (
          <div className="loading"><div className="spinner" />Cargando mapa...</div>
        ) : withCoords.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No hay instalaciones con coordenadas</div>
            <div className="empty-sub">Añade latitud y longitud en los datos de una instalación para verla aquí.</div>
          </div>
        ) : (
          <InstallationsMap installations={withCoords} selectedId={selected?.id} onSelect={setSelected} />
        )}
      </div>

      {selected && (
        <>
          <button className="drawer-backdrop map-drawer-backdrop" onClick={() => setSelected(null)} aria-label="Cerrar detalle" />
          <aside className="map-detail-drawer">
            <div className="drawer-header">
              <div>
                <div className="drawer-title">{selected.nombre_instalacion}</div>
                <div className="drawer-subtitle">Radio operativo mostrado: 5 km</div>
              </div>
              <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 16, lineHeight: 1 }} onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>

            <div className="drawer-body">
              <div className="card card-sm mb-16">
                <div className="study-section-label">Ubicación</div>
                <div className="detail-grid">
                  <div className="detail-row">
                    <div className="detail-row-label">Dirección</div>
                    <div className="detail-row-value">{selected.direccion || '—'}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-row-label">Municipio</div>
                    <div className="detail-row-value">{selected.municipio || '—'}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-row-label">Coordenadas</div>
                    <div className="detail-row-value text-mono">{formatCoord(selected.lat)}, {formatCoord(selected.lng)}</div>
                  </div>
                </div>
              </div>

              <div className="card card-sm mb-16">
                <div className="study-section-label">Instalación</div>
                <div className="detail-grid">
                  <div className="detail-row">
                    <div className="detail-row-label">Empresa</div>
                    <div className="detail-row-value">{selected.empresas?.nombre || '—'}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-row-label">Distribuidora</div>
                    <div className="detail-row-value">{selected.distribuidoras?.nombre || '—'}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-row-label">Potencia</div>
                    <div className="detail-row-value">{selected.potencia_instalada_kwp ? `${selected.potencia_instalada_kwp} kWp` : '—'}</div>
                  </div>
                  <div className="detail-row">
                    <div className="detail-row-label">CAU</div>
                    <div className="detail-row-value text-mono">{selected.cups_generador || '—'}</div>
                  </div>
                </div>
              </div>

              <div className="flex-row" style={{ justifyContent: 'flex-end' }}>
                <button className="btn" onClick={() => navigate(`/proyectos/${selected.id}/datos`)}>
                  Datos
                </button>
                <button className="btn btn-primary" onClick={() => navigate(`/proyectos/${selected.id}`)}>
                  Abrir instalación
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
