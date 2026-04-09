import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

export default function Dashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState({ instalaciones: 0, participes: 0, docs_total: 0, docs_firmados: 0, listos: 0 })
  const [recientes, setRecientes] = useState([])
  const [tareas, setTareas] = useState([])

  useEffect(() => {
    cargarDatos()
  }, [])

  async function cargarDatos() {
    setLoading(true)
    try {
      // Métricas
      const [{ count: instCount }, { count: partCount }, { data: docs }] = await Promise.all([
        supabase.from('installations').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('participes').select('*', { count: 'exact', head: true }).eq('active', true),
        supabase.from('documents').select('estado'),
      ])

      const docsTotal = docs?.length || 0
      const docsFirmados = docs?.filter(d => d.estado === 'firmado').length || 0

      // Instalaciones recientes con partícipes y distribuidora
      const { data: inst } = await supabase
        .from('installations')
        .select('id, nombre_instalacion, distribuidora_id, distribuidoras(nombre), potencia_instalada_kwp')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(5)

      // Para cada instalación calcular progreso
      const conProgreso = await Promise.all((inst || []).map(async i => {
        const { count: total } = await supabase
          .from('participes').select('*', { count: 'exact', head: true })
          .eq('installation_id', i.id).eq('active', true)

        const { count: firmados } = await supabase
          .from('documents').select('*', { count: 'exact', head: true })
          .eq('installation_id', i.id).eq('estado', 'firmado')

        const pct = total > 0 ? Math.round((firmados / (total * 3)) * 100) : 0
        return { ...i, total_participes: total, docs_firmados: firmados, pct }
      }))

      // Tareas: instalaciones con documentos pendientes
      const tareasFiltradas = conProgreso
        .filter(i => i.pct < 100 && i.total_participes > 0)
        .map(i => ({
          id: i.id,
          nombre: i.nombre_instalacion,
          pendientes: i.total_participes * 3 - i.docs_firmados,
          pct: i.pct,
          tipo: i.pct === 0 ? 'sin_empezar' : i.pct >= 80 ? 'casi_listo' : 'en_curso',
        }))
        .slice(0, 4)

      setMetrics({
        instalaciones: instCount || 0,
        participes: partCount || 0,
        docs_total: docsTotal,
        docs_firmados: docsFirmados,
        pct_firmados: docsTotal > 0 ? Math.round((docsFirmados / docsTotal) * 100) : 0,
        listos: conProgreso.filter(i => i.pct === 100).length,
      })
      setRecientes(conProgreso)
      setTareas(tareasFiltradas)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>

  return (
    <div>
      {/* Métricas */}
      <div className="metrics-grid">
        <div className="metric-card">
          <div className="metric-val">{metrics.instalaciones}</div>
          <div className="metric-label">Instalaciones activas</div>
        </div>
        <div className="metric-card">
          <div className="metric-val">{metrics.participes}</div>
          <div className="metric-label">Partícipes totales</div>
        </div>
        <div className="metric-card">
          <div className="metric-val">{metrics.pct_firmados ?? 0}%</div>
          <div className="metric-label">Documentos firmados</div>
          <div className="metric-delta delta-warn">
            {metrics.docs_total - metrics.docs_firmados} pendientes
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-val">{metrics.listos}</div>
          <div className="metric-label">Listas para distribuidora</div>
          <div className="metric-delta delta-up">Expediente completo</div>
        </div>
      </div>

      <div className="two-col">
        {/* Tareas pendientes */}
        <div>
          <div className="section-header mb-8">
            <span className="section-title">Tareas pendientes</span>
            {tareas.filter(t => t.tipo !== 'casi_listo').length > 0 && (
              <span className="pill pill-red">{tareas.filter(t => t.tipo !== 'casi_listo').length} urgentes</span>
            )}
          </div>
          <div className="card card-sm" style={{ padding: '0 16px' }}>
            {tareas.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-title">Todo al día</div>
                <div className="empty-sub">No hay tareas pendientes urgentes</div>
              </div>
            ) : tareas.map(t => (
              <div key={t.id} className="task-item">
                <div className="task-icon" style={{
                  background: t.tipo === 'sin_empezar' ? '#FCEBEB' : t.tipo === 'casi_listo' ? '#E1F5EE' : '#FAEEDA'
                }}>
                  {t.tipo === 'sin_empezar' ? '!' : t.tipo === 'casi_listo' ? '✓' : '⏱'}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="task-title">{t.nombre}</div>
                  <div className="task-sub">{t.pendientes} documentos pendientes de firma</div>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => navigate(`/proyectos/${t.id}`)}>Ver</button>
              </div>
            ))}
          </div>
        </div>

        {/* Instalaciones recientes */}
        <div>
          <div className="section-header mb-8">
            <span className="section-title">Instalaciones recientes</span>
            <button className="btn btn-sm btn-ghost" onClick={() => navigate('/proyectos')}>Ver todas →</button>
          </div>
          <div className="table-wrap">
            {recientes.length === 0 ? (
              <div className="empty-state">
                <div className="empty-title">Sin instalaciones</div>
                <div className="empty-sub">Crea la primera instalación</div>
                <button className="btn btn-primary" onClick={() => navigate('/proyectos/nuevo')}>+ Nueva instalación</button>
              </div>
            ) : (
              <table>
                <tbody>
                  {recientes.map(i => (
                    <tr key={i.id} className="clickable" onClick={() => navigate(`/proyectos/${i.id}`)}>
                      <td>
                        <div className="font-bold">{i.nombre_instalacion}</div>
                        <div className="td-muted">{i.distribuidoras?.nombre} · {i.total_participes} partícipes</div>
                      </td>
                      <td>
                        <div className="progress-bar">
                          <div className={`progress-fill ${i.pct < 50 ? 'progress-fill-danger' : i.pct < 100 ? 'progress-fill-amber' : ''}`}
                            style={{ width: i.pct + '%' }} />
                        </div>
                        <div className="text-sm text-muted" style={{ marginTop: 2 }}>{i.pct}%</div>
                      </td>
                      <td>
                        {i.pct === 100
                          ? <span className="pill pill-blue"><span className="pill-dot" />Listo</span>
                          : i.pct > 0
                            ? <span className="pill pill-amber"><span className="pill-dot" />En curso</span>
                            : <span className="pill pill-gray"><span className="pill-dot" />Sin empezar</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
