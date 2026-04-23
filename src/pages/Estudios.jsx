import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const STATUS_LABELS = {
  uploaded:   { label: 'Subido',      color: 'pill-gray' },
  validated:  { label: 'Validado',    color: 'pill-amber' },
  calculated: { label: 'Calculado',   color: 'pill-blue' },
  sent:       { label: 'Enviado',     color: 'pill-green' },
  reserved:   { label: 'Reservado',   color: 'pill-blue' },
  contracted: { label: 'Contratado',  color: 'pill-green' },
}

export default function Estudios() {
  const navigate = useNavigate()
  const [estudios, setEstudios]             = useState([])
  const [instalaciones, setInstalaciones]   = useState([])
  const [loading, setLoading]               = useState(true)
  const [filtroNombre, setFiltroNombre]     = useState('')
  const [filtroEstado, setFiltroEstado]     = useState('')
  const [filtroInstalacion, setFiltroInstalacion] = useState('')

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    setLoading(true)
    const [{ data, error }, { data: insts }] = await Promise.all([
      supabase
        .from('studies')
        .select('id, status, email_status, created_at, customer, calculation, selected_installation_id, selected_installation_snapshot, assigned_kwp')
        .order('created_at', { ascending: false }),
      supabase
        .from('installations')
        .select('id, nombre_instalacion')
        .order('nombre_instalacion')
    ])
    if (error) console.error('studies error:', error.message)
    setEstudios(data || [])
    setInstalaciones(insts || [])
    setLoading(false)
  }

  const filtrados = estudios.filter(e => {
    const nombre = `${e.customer?.nombre || ''} ${e.customer?.apellidos || ''}`.toLowerCase()
    const email  = (e.customer?.email || '').toLowerCase()
    const cups   = (e.customer?.cups  || '').toLowerCase()
    const q = filtroNombre.toLowerCase()
    const matchQ = nombre.includes(q) || email.includes(q) || cups.includes(q)
    const matchE = !filtroEstado || e.status === filtroEstado
    const matchI = !filtroInstalacion || e.selected_installation_id === filtroInstalacion
    return matchQ && matchE && matchI
  })

  const estadoPill = status => {
    const s = STATUS_LABELS[status] || { label: status || '—', color: 'pill-gray' }
    return <span className={`pill ${s.color}`}><span className="pill-dot" />{s.label}</span>
  }

  const potenciaRecomendada = e => {
    const v = e.calculation?.recommendedPowerKwp
    return v != null ? `${Number(v).toFixed(2)} kWp` : null
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Estudios</div>
          <div className="page-sub">{estudios.length} estudios en total</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex-row mb-16">
        <input
          type="text"
          className="form-input"
          style={{ maxWidth: 320 }}
          placeholder="Buscar nombre, email, CUPS..."
          value={filtroNombre}
          onChange={e => setFiltroNombre(e.target.value)}
        />
        <select
          className="form-select"
          style={{ maxWidth: 180 }}
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          className="form-select"
          style={{ maxWidth: 220 }}
          value={filtroInstalacion}
          onChange={e => setFiltroInstalacion(e.target.value)}
        >
          <option value="">Todas las instalaciones</option>
          {instalaciones.map(i => (
            <option key={i.id} value={i.id}>{i.nombre_instalacion}</option>
          ))}
        </select>
        {(filtroNombre || filtroEstado || filtroInstalacion) && (
          <button className="btn btn-ghost" onClick={() => { setFiltroNombre(''); setFiltroEstado(''); setFiltroInstalacion('') }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading"><div className="spinner" />Cargando...</div>
      ) : filtrados.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
          <div className="empty-title">No hay estudios</div>
          <div className="empty-sub">Los estudios aparecerán aquí cuando se generen desde la aplicación</div>
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
              {filtrados.map(e => {
                const c = e.customer || {}
                return (
                  <tr key={e.id} className="clickable" onClick={() => navigate(`/estudios/${e.id}`)}>
                    <td>
                      <div className="font-bold">
                        {c.nombre || c.apellidos
                          ? `${c.nombre || ''} ${c.apellidos || ''}`.trim()
                          : <span className="text-muted">Sin nombre</span>}
                      </div>
                      {c.email && <div className="td-muted">{c.email}</div>}
                    </td>
                    <td>
                      {c.cups
                        ? <span className="text-mono">{c.cups}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {potenciaRecomendada(e)
                        ? <span className="font-bold">{potenciaRecomendada(e)}</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {e.calculation?.annualSavingsService
                        ? <span className="font-bold">{Number(e.calculation.annualSavingsService).toLocaleString('es-ES')} €/año</span>
                        : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {e.selected_installation_snapshot?.nombre_instalacion
                        ? e.selected_installation_snapshot.nombre_instalacion
                        : <span className="text-muted">Sin asignar</span>}
                    </td>
                    <td>{estadoPill(e.status)}</td>
                    <td>
                      <div className="td-muted">
                        {new Date(e.created_at).toLocaleDateString('es-ES')}
                      </div>
                    </td>
                    <td onClick={ev => ev.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => navigate(`/estudios/${e.id}`)}>Ver</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
