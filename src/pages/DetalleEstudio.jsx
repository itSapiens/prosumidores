import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'

const STATUS_LABELS = {
  uploaded:   { label: 'Subido',      color: 'pill-gray' },
  validated:  { label: 'Validado',    color: 'pill-amber' },
  calculated: { label: 'Calculado',   color: 'pill-blue' },
  sent:       { label: 'Enviado',     color: 'pill-green' },
  reserved:   { label: 'Reservado',   color: 'pill-blue' },
  contracted: { label: 'Contratado',  color: 'pill-green' },
}

const RES_STATUS = {
  pending_payment: { label: 'Pendiente de pago', color: 'pill-amber' },
  paid:            { label: 'Pagado',             color: 'pill-green' },
  confirmed:       { label: 'Confirmado',         color: 'pill-blue' },
  released:        { label: 'Liberado',           color: 'pill-gray' },
  cancelled:       { label: 'Cancelado',          color: 'pill-gray' },
}

const PAY_STATUS = {
  pending:     { label: 'Pendiente',      color: 'pill-amber' },
  signal_paid: { label: 'Reserva pagada', color: 'pill-blue'  },
  paid:        { label: 'Pago completo',  color: 'pill-green' },
  failed:      { label: 'Fallido',        color: 'pill-gray'  },
}

function Pill({ status, map }) {
  const s = map[status] || { label: status || '—', color: 'pill-gray' }
  return <span className={`pill ${s.color}`}><span className="pill-dot" />{s.label}</span>
}

function DataRow({ label, value, mono }) {
  return (
    <>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 500, paddingTop: 6 }}>{label}</div>
      <div style={{ paddingTop: 6, fontFamily: mono ? 'var(--font-mono)' : undefined, fontSize: mono ? 12 : undefined }}>
        {value ?? <span className="text-muted">—</span>}
      </div>
    </>
  )
}

export default function DetalleEstudio() {
  const navigate    = useNavigate()
  const { id }      = useParams()
  const [loading, setLoading]   = useState(true)
  const [estudio, setEstudio]   = useState(null)
  const [reservas, setReservas] = useState([])

  useEffect(() => { cargarDatos() }, [id])

  async function cargarDatos() {
    setLoading(true)
    const [{ data: est, error }, { data: res }] = await Promise.all([
      supabase.from('studies').select('*').eq('id', id).single(),
      supabase.from('installation_reservations').select('*').eq('study_id', id).order('created_at', { ascending: false })
    ])
    if (error) console.error('study error:', error.message)
    setEstudio(est)
    setReservas(res || [])
    setLoading(false)
  }

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>
  if (!estudio) return (
    <div className="empty-state">
      <div className="empty-title">Estudio no encontrado</div>
      <button className="btn" onClick={() => navigate('/estudios')}>← Volver</button>
    </div>
  )

  const c    = estudio.customer || {}
  const calc = estudio.calculation || {}
  const snap = estudio.selected_installation_snapshot

  const consumoMensual = c.consumo_medio_mensual_kwh
    || estudio.invoice_data?.averageMonthlyConsumptionKwh
    || estudio.invoice_data?.consumoMedioMensual

  const consumoReal = c.consumo_mensual_real_kwh
    || estudio.invoice_data?.consumptionKwh
    || estudio.invoice_data?.consumoMensualReal

  const tipoFactura = estudio.invoice_data?.type
    || estudio.invoice_data?.tipoFactura
    || c.tipo_factura

  return (
    <div>
      {/* Header */}
      <div className="breadcrumb mb-16">
        <a className="breadcrumb-link" onClick={() => navigate('/estudios')}>Estudios</a>
        <span className="breadcrumb-sep">›</span>
        <span className="breadcrumb-current">
          {c.nombre || c.apellidos ? `${c.nombre || ''} ${c.apellidos || ''}`.trim() : 'Estudio'}
        </span>
      </div>

      <div className="flex-between mb-24">
        <div>
          <div className="page-title">
            {c.nombre || c.apellidos
              ? `${c.nombre || ''} ${c.apellidos || ''}`.trim()
              : 'Estudio sin nombre'}
          </div>
          <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Pill status={estudio.status} map={STATUS_LABELS} />
            {c.email && <span>{c.email}</span>}
            {c.telefono && <span>· {c.telefono}</span>}
          </div>
        </div>
      </div>

      {/* Métricas rápidas si hay cálculo */}
      {calc.annualSavingsService && (
        <div className="metrics-grid mb-24">
          <div className="metric-card">
            <div className="metric-val">{calc.recommendedPowerKwp} kWp</div>
            <div className="metric-label">Potencia recomendada</div>
          </div>
          <div className="metric-card">
            <div className="metric-val">{Number(calc.annualSavingsService).toLocaleString('es-ES')} €</div>
            <div className="metric-label">Ahorro anual (servicio)</div>
          </div>
          <div className="metric-card">
            <div className="metric-val">{Number(calc.monthlySavingsService).toLocaleString('es-ES')} €</div>
            <div className="metric-label">Ahorro mensual</div>
          </div>
          <div className="metric-card">
            <div className="metric-val">{calc.viabilityScore ?? '—'}</div>
            <div className="metric-label">Score viabilidad</div>
          </div>
        </div>
      )}

      {/* Datos cliente + Factura */}
      <div className="two-col mb-16">
        <div className="card card-sm">
          <div className="card-title mb-8">Datos del cliente</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', rowGap: 2 }}>
            <DataRow label="Nombre"    value={`${c.nombre || ''} ${c.apellidos || ''}`.trim() || null} />
            <DataRow label="DNI/NIF"   value={c.dni}   mono />
            <DataRow label="Email"     value={c.email} />
            <DataRow label="Teléfono"  value={c.telefono || c.phone} />
            <DataRow label="CUPS"      value={c.cups}  mono />
            <DataRow label="IBAN"      value={c.iban}  mono />
            <DataRow label="Dirección" value={c.direccion_completa || c.direccionCompleta} />
            <DataRow label="C.P."      value={c.codigo_postal} />
            <DataRow label="Población" value={c.poblacion} />
          </div>
        </div>

        <div className="card card-sm">
          <div className="card-title mb-8">Datos de factura</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', rowGap: 2 }}>
            <DataRow label="Tipo tarifa"    value={tipoFactura} />
            <DataRow label="Consumo real"   value={consumoReal   ? `${Math.round(consumoReal)} kWh` : null} />
            <DataRow label="Consumo medio"  value={consumoMensual ? `${Math.round(consumoMensual)} kWh/mes` : null} />
            <DataRow label="P1 (€/kWh)"    value={c.precio_p1_eur_kwh ?? estudio.invoice_data?.periodPricesEurPerKwh?.P1} />
            <DataRow label="P2 (€/kWh)"    value={c.precio_p2_eur_kwh ?? estudio.invoice_data?.periodPricesEurPerKwh?.P2} />
            <DataRow label="P3 (€/kWh)"    value={c.precio_p3_eur_kwh ?? estudio.invoice_data?.periodPricesEurPerKwh?.P3} />
            {(c.precio_p4_eur_kwh || estudio.invoice_data?.periodPricesEurPerKwh?.P4) && (
              <DataRow label="P4 (€/kWh)" value={c.precio_p4_eur_kwh} />
            )}
          </div>
          {estudio.source_file?.invoice_drive_url && (
            <div style={{ marginTop: 12 }}>
              <a
                href={estudio.source_file.invoice_drive_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm"
              >
                📄 Ver factura en Drive
              </a>
              {estudio.source_file.proposal_drive_url && (
                <a
                  href={estudio.source_file.proposal_drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm"
                  style={{ marginLeft: 8 }}
                >
                  📊 Ver propuesta en Drive
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cálculo detallado */}
      {calc.annualSavingsService && (
        <div className="card mb-16">
          <div className="card-title mb-12">Cálculo energético</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Producción</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 4 }}>
                <DataRow label="Prod. anual est."  value={calc.estimatedAnnualProductionKwh ? `${Number(calc.estimatedAnnualProductionKwh).toLocaleString('es-ES')} kWh` : null} />
                <DataRow label="% Autoconsumo"     value={calc.selfConsumptionRatio ? `${Math.round(calc.selfConsumptionRatio * 100)}%` : null} />
                <DataRow label="Horas equiv."      value={calc.estimatedAnnualProductionKwh && calc.recommendedPowerKwp ? `${Math.round(calc.estimatedAnnualProductionKwh / calc.recommendedPowerKwp)} h` : null} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Ahorro (servicio)</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 4 }}>
                <DataRow label="Diario"   value={calc.dailySavingsService   ? `${calc.dailySavingsService} €/día`  : null} />
                <DataRow label="Mensual"  value={calc.monthlySavingsService  ? `${calc.monthlySavingsService} €/mes` : null} />
                <DataRow label="Anual"    value={calc.annualSavingsService   ? `${Number(calc.annualSavingsService).toLocaleString('es-ES')} €/año` : null} />
                <DataRow label="25 años"  value={calc.annualSavings25YearsService ? `${Number(calc.annualSavings25YearsService).toLocaleString('es-ES')} €` : null} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Economía</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 4 }}>
                <DataRow label="Coste servicio"   value={calc.serviceCost    ? `${calc.serviceCost} €/kWh`    : null} />
                <DataRow label="Coste inversión"  value={calc.investmentCost ? `${calc.investmentCost} €/kWh` : null} />
                <DataRow label="Precio pond. red" value={calc.weightedEnergyPriceKwh ? `${calc.weightedEnergyPriceKwh} €/kWh` : null} />
                <DataRow label="Payback"          value={calc.paybackYears != null ? `${calc.paybackYears} años` : null} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instalación asignada */}
      <div className="card mb-16">
        <div className="card-title mb-8">Instalación asignada</div>
        {snap ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', rowGap: 2, flex: 1 }}>
              <DataRow label="Nombre"   value={snap.nombre_instalacion} />
              <DataRow label="Potencia" value={snap.potencia_instalada_kwp ? `${snap.potencia_instalada_kwp} kWp` : null} />
              <DataRow label="Dirección" value={snap.direccion} />
            </div>
            {estudio.selected_installation_id && (
              <button
                className="btn btn-sm"
                style={{ marginLeft: 16, flexShrink: 0 }}
                onClick={() => navigate(`/proyectos/${estudio.selected_installation_id}`)}
              >
                Ver instalación →
              </button>
            )}
          </div>
        ) : (
          <div className="text-muted" style={{ padding: '4px 0' }}>Sin instalación asignada</div>
        )}
      </div>

      {/* Reservas */}
      <div className="card">
        <div className="card-title mb-8">
          Reservas
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            ({reservas.length})
          </span>
        </div>
        {reservas.length === 0 ? (
          <div className="text-muted" style={{ padding: '4px 0' }}>No hay reservas vinculadas a este estudio</div>
        ) : (
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  <th>kWp reservados</th>
                  <th>Estado reserva</th>
                  <th>Pago</th>
                  <th>Plazo pago</th>
                  <th>Confirmado</th>
                  <th>Fecha reserva</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {reservas.map(r => (
                  <tr key={r.id}>
                    <td className="font-bold">{r.reserved_kwp} kWp</td>
                    <td><Pill status={r.reservation_status} map={RES_STATUS} /></td>
                    <td><Pill status={r.payment_status}     map={PAY_STATUS} /></td>
                    <td>{r.payment_deadline_at ? new Date(r.payment_deadline_at).toLocaleDateString('es-ES') : '—'}</td>
                    <td>{r.confirmed_at ? new Date(r.confirmed_at).toLocaleDateString('es-ES') : '—'}</td>
                    <td>{new Date(r.reserved_at).toLocaleDateString('es-ES')}</td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.notes || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
