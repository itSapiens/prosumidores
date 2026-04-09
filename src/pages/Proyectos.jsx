import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function Proyectos() {
  const navigate = useNavigate()
  const [instalaciones, setInstalaciones] = useState([])
  const [distribuidoras, setDistribuidoras] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroDist, setFiltroDist] = useState('')

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setLoading(true)
    const [{ data: inst, error: errInst }, { data: dists, error: errDists }] = await Promise.all([
      supabase.from('installations')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false }),
      supabase.from('distribuidoras').select('*').order('nombre')
    ])
    if (errInst) console.error('installations error:', errInst?.message)
    if (errDists) console.error('distribuidoras error:', errDists?.message)

    // Enriquecer con conteo de partícipes y documentos
    const enriquecidas = await Promise.all((inst || []).map(async i => {
      const { count: partCount } = await supabase
        .from('participes').select('*', { count: 'exact', head: true })
        .eq('installation_id', i.id).eq('active', true)

      const { count: firmados } = await supabase
        .from('documents').select('*', { count: 'exact', head: true })
        .eq('installation_id', i.id).eq('estado', 'firmado')

      const totalDocs = (partCount || 0) * 3
      const pct = totalDocs > 0 ? Math.round(((firmados || 0) / totalDocs) * 100) : 0

      return { ...i, total_participes: partCount || 0, docs_firmados: firmados || 0, pct }
    }))

    setInstalaciones(enriquecidas)
    setDistribuidoras(dists || [])
    setLoading(false)
  }

  const filtradas = instalaciones.filter(i => {
    const matchNombre = i.nombre_instalacion?.toLowerCase().includes(filtroNombre.toLowerCase()) ||
      i.cups_generador?.toLowerCase().includes(filtroNombre.toLowerCase())
    const matchDist = !filtroDist || i.distribuidora_id === filtroDist
    return matchNombre && matchDist
  })

  const estadoPill = (pct, participes) => {
    if (participes === 0) return <span className="pill pill-gray"><span className="pill-dot" />Sin partícipes</span>
    if (pct === 100) return <span className="pill pill-blue"><span className="pill-dot" />Listo</span>
    if (pct >= 80) return <span className="pill pill-green"><span className="pill-dot" />Casi listo</span>
    if (pct > 0) return <span className="pill pill-amber"><span className="pill-dot" />En curso</span>
    return <span className="pill pill-gray"><span className="pill-dot" />Sin empezar</span>
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Instalaciones</div>
          <div className="page-sub">{instalaciones.length} instalaciones activas</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/proyectos/nuevo')}>
          + Nueva instalación
        </button>
      </div>

      {/* Filtros */}
      <div className="flex-row mb-16">
        <input
          type="text"
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="Buscar nombre, CUPS..."
          value={filtroNombre}
          onChange={e => setFiltroNombre(e.target.value)}
        />
        <select
          className="form-select"
          style={{ maxWidth: 200 }}
          value={filtroDist}
          onChange={e => setFiltroDist(e.target.value)}
        >
          <option value="">Todas las distribuidoras</option>
          {distribuidoras.map(d => (
            <option key={d.id} value={d.id}>{d.nombre}</option>
          ))}
        </select>
        {(filtroNombre || filtroDist) && (
          <button className="btn btn-ghost" onClick={() => { setFiltroNombre(''); setFiltroDist('') }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Cargando...</div>
      ) : filtradas.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"/></svg>
          </div>
          <div className="empty-title">No hay instalaciones</div>
          <div className="empty-sub">Crea tu primera instalación de autoconsumo colectivo</div>
          <button className="btn btn-primary" onClick={() => navigate('/proyectos/nuevo')}>+ Nueva instalación</button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Instalación</th>
                <th>Distribuidora</th>
                <th>Potencia</th>
                <th>Partícipes</th>
                <th>Progreso docs.</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.map(i => (
                <tr key={i.id} className="clickable" onClick={() => navigate(`/proyectos/${i.id}`)}>
                  <td>
                    <div className="font-bold">{i.nombre_instalacion}</div>
                    {i.cups_generador && (
                      <div className="td-muted text-mono">{i.cups_generador}</div>
                    )}
                  </td>
                  <td>{distribuidoras.find(d => d.id === i.distribuidora_id)?.nombre || <span className="text-muted">—</span>}</td>
                  <td>{i.potencia_instalada_kwp ? `${i.potencia_instalada_kwp} kWp` : '—'}</td>
                  <td>{i.total_participes}</td>
                  <td>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${i.pct < 50 ? 'progress-fill-danger' : i.pct < 100 ? 'progress-fill-amber' : ''}`}
                        style={{ width: i.pct + '%' }}
                      />
                    </div>
                    <div className="text-sm text-muted" style={{ marginTop: 2 }}>
                      {i.docs_firmados}/{i.total_participes * 3}
                    </div>
                  </td>
                  <td>{estadoPill(i.pct, i.total_participes)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="actions-cell">
                      <button className="btn btn-sm" onClick={() => navigate(`/proyectos/${i.id}`)}>Ver</button>
                      <button className="btn btn-sm" onClick={() => navigate(`/proyectos/${i.id}/editar`)}>Editar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
