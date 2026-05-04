import { useEffect, useMemo, useState } from 'react'
import {
  PAYMENT_STATUS_LABELS,
  RESERVATION_STATUS_LABELS,
  STUDY_STATUS_LABELS,
  formatNumber,
  getStudyAddress,
  getStudyAnnualSavings,
  getStudyAssignedInstallationName,
  getStudyAverageConsumption,
  getStudyCalculation,
  getStudyCity,
  getStudyCountry,
  getStudyCups,
  getStudyDisplayName,
  getStudyDni,
  getStudyDocuments,
  getStudyEmail,
  getStudyIban,
  getStudyInvoiceType,
  getStudyMonthlySavings,
  getStudyPeriodPrice,
  getStudyPhone,
  getStudyPostalCode,
  getStudyRealConsumption,
  getStudyRecommendedPower,
  getStudyViabilityScore,
  resolveStudyDocuments,
} from '../lib/studies.js'

function Pill({ status, map }) {
  const meta = map[status] || { label: status || '—', color: 'pill-gray' }
  return <span className={`pill ${meta.color}`}><span className="pill-dot" />{meta.label}</span>
}

function DetailRow({ label, value, mono }) {
  return (
    <div className="detail-row">
      <div className="detail-row-label">{label}</div>
      <div className={`detail-row-value ${mono ? 'text-mono' : ''}`}>
        {value ?? <span className="text-muted">—</span>}
      </div>
    </div>
  )
}

function Metric({ value, label, tone = 'default' }) {
  return (
    <div className={`study-kpi-card ${tone !== 'default' ? `study-kpi-${tone}` : ''}`}>
      <div className="study-kpi-value">{value}</div>
      <div className="study-kpi-label">{label}</div>
    </div>
  )
}

function SectionTabs({ value, onChange, items }) {
  return (
    <div className="study-section-tabs">
      {items.map(item => (
        <button
          key={item.id}
          className={`study-section-tab ${value === item.id ? 'active' : ''}`}
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

function PreviewPanel({ study, compact = false }) {
  const seedDocuments = useMemo(() => getStudyDocuments(study), [study])
  const [documents, setDocuments] = useState(seedDocuments)
  const [loading, setLoading] = useState(false)
  const [activeKey, setActiveKey] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadDocuments() {
      setDocuments(seedDocuments)
      setLoading(seedDocuments.some(doc => !doc.url && doc.bucket && doc.path))

      const resolved = await resolveStudyDocuments(study)
      if (!cancelled) {
        setDocuments(resolved)
        setLoading(false)
      }
    }

    loadDocuments()
    return () => { cancelled = true }
  }, [seedDocuments, study])

  useEffect(() => {
    setActiveKey('')
  }, [study?.id, documents])

  const activeDocument = documents.find(doc => doc.key === activeKey) || null
  const isImage = activeDocument?.mimeType?.startsWith('image/')

  return (
    <div className={`card card-sm ${compact ? 'study-preview-card-compact' : ''}`}>
      <div className="card-header">
        <div>
          <div className="card-title">Vista previa</div>
          <div className="page-sub">Factura y propuesta plegadas. Abre solo la que quieras consultar.</div>
        </div>
        {activeDocument?.url && (
          <a href={activeDocument.url} target="_blank" rel="noopener noreferrer" className="btn btn-sm">
            Abrir original
          </a>
        )}
      </div>

      <div className={`study-preview-content ${compact ? 'compact' : ''}`}>
        {documents.length === 0 ? (
          <div className="empty-state" style={{ padding: 24 }}>
            <div className="empty-title">Sin documentos vinculados</div>
            <div className="empty-sub">Este estudio no trae URLs ni `bucket/path` de factura o propuesta para previsualizar.</div>
          </div>
        ) : !activeDocument ? (
          <div className="study-doc-list">
            {documents.map(doc => (
              <div key={doc.key} className="study-doc-card">
                <div className="study-doc-card-main">
                  <div className="study-doc-card-title">{doc.label}</div>
                  <div className="study-doc-card-sub">{doc.filename || doc.label}</div>
                  <div className="study-doc-card-meta">
                    {doc.mimeType || 'Documento'}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => setActiveKey(doc.key)}>
                  Ver
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="study-doc-viewer-bar">
              <button className="btn btn-sm btn-ghost" onClick={() => setActiveKey('')}>
                ← Volver
              </button>
              <div className="study-doc-viewer-meta">
                <div className="study-doc-card-title">{activeDocument.label}</div>
                <div className="study-doc-card-sub">{activeDocument.filename || activeDocument.label}</div>
              </div>
            </div>

            <div className="study-doc-meta">
              <span>{activeDocument?.filename || activeDocument?.label}</span>
              {activeDocument?.mimeType && <span className="text-muted">{activeDocument.mimeType}</span>}
            </div>

            {loading ? (
              <div className={`loading ${compact ? 'study-preview-loading-compact' : ''}`} style={{ minHeight: 220 }}><div className="spinner" />Cargando archivo desde Supabase Storage...</div>
            ) : activeDocument?.previewUrl && isImage ? (
              <div className={`study-preview-image-wrap ${compact ? 'compact' : ''}`}>
                <img
                  src={activeDocument.previewUrl}
                  alt={activeDocument.filename || activeDocument.label}
                  className="study-preview-image"
                />
              </div>
            ) : activeDocument?.previewUrl ? (
              <iframe
                title={`preview-${activeDocument.key}`}
                src={activeDocument.previewUrl}
                className={`study-preview-frame ${compact ? 'compact' : ''}`}
              />
            ) : activeDocument?.url ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-title">Archivo localizado</div>
                <div className="empty-sub">El documento existe pero su formato no permite preview embebida en el navegador.</div>
              </div>
            ) : (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="empty-title">Preview no disponible</div>
                <div className="empty-sub">
                  {activeDocument?.error || 'No se pudo resolver la URL firmada del archivo en Supabase Storage.'}
                </div>
                {(activeDocument?.bucket || activeDocument?.path) && (
                  <div className="text-muted text-sm" style={{ marginTop: 12 }}>
                    {activeDocument?.bucket ? `Bucket: ${activeDocument.bucket}` : 'Bucket sin definir'}
                    {activeDocument?.path ? ` · Path: ${activeDocument.path}` : ''}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function StudyDetailView({
  study,
  reservations = [],
  compact = false,
  onOpenInstallation,
  onOpenFullPage,
}) {
  const [compactTab, setCompactTab] = useState('preview')
  const calc = getStudyCalculation(study)
  const displayName = getStudyDisplayName(study) || 'Estudio sin nombre'
  const email = getStudyEmail(study)
  const phone = getStudyPhone(study)
  const cups = getStudyCups(study)
  const address = getStudyAddress(study)
  const postalCode = getStudyPostalCode(study)
  const city = getStudyCity(study)
  const country = getStudyCountry(study)
  const invoiceType = getStudyInvoiceType(study)
  const realConsumption = getStudyRealConsumption(study)
  const averageConsumption = getStudyAverageConsumption(study)
  const recommendedPower = getStudyRecommendedPower(study)
  const annualSavings = getStudyAnnualSavings(study)
  const monthlySavings = getStudyMonthlySavings(study)
  const viabilityScore = getStudyViabilityScore(study)
  const installationName = getStudyAssignedInstallationName(study)

  useEffect(() => {
    setCompactTab('preview')
  }, [study?.id])

  const clientePanel = (
    <div className="card card-sm">
      <div className="card-title mb-8">Datos del cliente</div>
      <div className="detail-grid">
        <DetailRow label="Nombre" value={displayName} />
        <DetailRow label="DNI/NIF" value={getStudyDni(study)} mono />
        <DetailRow label="Email" value={email} />
        <DetailRow label="Telefono" value={phone} />
        <DetailRow label="CUPS" value={cups} mono />
        <DetailRow label="IBAN" value={getStudyIban(study)} mono />
        <DetailRow label="Direccion" value={address} />
        <DetailRow label="C.P." value={postalCode} />
        <DetailRow label="Poblacion" value={city} />
        <DetailRow label="Pais" value={country} />
      </div>
    </div>
  )

  const facturaPanel = (
    <div className="card card-sm">
      <div className="card-title mb-8">Datos de factura</div>
      <div className="detail-grid">
        <DetailRow label="Tipo tarifa" value={invoiceType} />
        <DetailRow label="Consumo real" value={realConsumption != null ? `${formatNumber(realConsumption)} kWh` : null} />
        <DetailRow label="Consumo medio" value={averageConsumption != null ? `${formatNumber(averageConsumption)} kWh/mes` : null} />
        {['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(period => {
          const price = getStudyPeriodPrice(study, period)
          return (
            <DetailRow
              key={period}
              label={`${period} (EUR/kWh)`}
              value={price != null ? formatNumber(price, { minimumFractionDigits: 3, maximumFractionDigits: 6 }) : null}
            />
          )
        })}
      </div>
    </div>
  )

  const calculoPanel = (
    <div className="card card-sm">
      <div className="card-title mb-12">Cálculo energético</div>
      {Object.keys(calc).length === 0 ? (
        <div className="text-muted">Este estudio no trae cálculo detallado.</div>
      ) : (
        <div className={`three-col ${compact ? 'study-compact-stack' : ''}`}>
          <div>
            <div className="study-section-label">Producción</div>
            <div className="detail-grid">
              <DetailRow
                label="Producción anual"
                value={calc.estimatedAnnualProductionKwh != null ? `${formatNumber(calc.estimatedAnnualProductionKwh)} kWh` : null}
              />
              <DetailRow
                label="Autoconsumo"
                value={calc.selfConsumptionRatio != null ? `${formatNumber(calc.selfConsumptionRatio * 100, { maximumFractionDigits: 0 })}%` : null}
              />
              <DetailRow
                label="Horas equivalentes"
                value={
                  calc.estimatedAnnualProductionKwh != null && recommendedPower
                    ? `${formatNumber(calc.estimatedAnnualProductionKwh / recommendedPower, { maximumFractionDigits: 0 })} h`
                    : null
                }
              />
            </div>
          </div>

          <div>
            <div className="study-section-label">Ahorro</div>
            <div className="detail-grid">
              <DetailRow label="Diario" value={calc.dailySavingsService != null ? `${formatNumber(calc.dailySavingsService)} EUR/dia` : null} />
              <DetailRow label="Mensual" value={monthlySavings != null ? `${formatNumber(monthlySavings)} EUR/mes` : null} />
              <DetailRow label="Anual" value={annualSavings != null ? `${formatNumber(annualSavings)} EUR/anio` : null} />
              <DetailRow
                label="25 anios"
                value={calc.annualSavings25YearsService != null ? `${formatNumber(calc.annualSavings25YearsService)} EUR` : null}
              />
            </div>
          </div>

          <div>
            <div className="study-section-label">Economía</div>
            <div className="detail-grid">
              <DetailRow label="Coste servicio" value={calc.serviceCost != null ? `${formatNumber(calc.serviceCost)} EUR/kWh` : null} />
              <DetailRow label="Coste inversion" value={calc.investmentCost != null ? `${formatNumber(calc.investmentCost)} EUR/kWh` : null} />
              <DetailRow
                label="Precio pond. red"
                value={calc.weightedEnergyPriceKwh != null ? `${formatNumber(calc.weightedEnergyPriceKwh)} EUR/kWh` : null}
              />
              <DetailRow label="Payback" value={calc.paybackYears != null ? `${formatNumber(calc.paybackYears)} anios` : null} />
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const instalacionPanel = (
    <div className="card card-sm">
      <div className="card-header">
        <div>
          <div className="card-title">Instalación asignada</div>
          <div className="page-sub">
            {installationName || 'Este estudio aun no se ha vinculado a una instalación concreta.'}
          </div>
        </div>
        {study.selected_installation_id && onOpenInstallation && (
          <button className="btn btn-sm" onClick={() => onOpenInstallation(study.selected_installation_id)}>
            Ver instalación
          </button>
        )}
      </div>
      <div className="detail-grid">
        <DetailRow label="Nombre" value={installationName} />
        <DetailRow
          label="Potencia snapshot"
          value={
            study.selected_installation_snapshot?.potencia_instalada_kwp != null
              ? `${formatNumber(study.selected_installation_snapshot.potencia_instalada_kwp)} kWp`
              : null
          }
        />
        <DetailRow label="Dirección" value={study.selected_installation_snapshot?.direccion || null} />
        <DetailRow label="kWp asignados" value={study.assigned_kwp != null ? `${formatNumber(study.assigned_kwp)} kWp` : null} />
      </div>
    </div>
  )

  const reservasPanel = (
    <div className="card card-sm">
      <div className="card-title mb-8">
        Reservas
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
          ({reservations.length})
        </span>
      </div>
      {reservations.length === 0 ? (
        <div className="text-muted" style={{ padding: '4px 0' }}>No hay reservas vinculadas a este estudio.</div>
      ) : (
        <div className="table-wrap study-reservations-wrap" style={{ marginTop: 8 }}>
          <table>
            <thead>
              <tr>
                <th>kWp</th>
                <th>Reserva</th>
                <th>Pago</th>
                <th>Plazo</th>
                <th>Confirmado</th>
                <th>Creado</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map(reservation => (
                <tr key={reservation.id}>
                  <td className="font-bold">{reservation.reserved_kwp != null ? `${formatNumber(reservation.reserved_kwp)} kWp` : '—'}</td>
                  <td><Pill status={reservation.reservation_status} map={RESERVATION_STATUS_LABELS} /></td>
                  <td><Pill status={reservation.payment_status} map={PAYMENT_STATUS_LABELS} /></td>
                  <td>{reservation.payment_deadline_at ? new Date(reservation.payment_deadline_at).toLocaleDateString('es-ES') : '—'}</td>
                  <td>{reservation.confirmed_at ? new Date(reservation.confirmed_at).toLocaleDateString('es-ES') : '—'}</td>
                  <td>{(reservation.reserved_at || reservation.created_at) ? new Date(reservation.reserved_at || reservation.created_at).toLocaleDateString('es-ES') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )

  if (compact) {
    const compactPanels = {
      preview: <PreviewPanel study={study} compact />,
      cliente: clientePanel,
      factura: facturaPanel,
      calculo: calculoPanel,
      instalacion: instalacionPanel,
      reservas: reservasPanel,
    }

    return (
      <div className="study-compact-layout">
        <div className="card card-sm">
          <div className="card-header">
            <div>
              <div className="page-title" style={{ fontSize: 18 }}>{displayName}</div>
              <div className="page-sub study-header-meta">
                <Pill status={study.status} map={STUDY_STATUS_LABELS} />
                {email && <span>{email}</span>}
                {phone && <span>{phone}</span>}
                {study.created_at && <span>{new Date(study.created_at).toLocaleDateString('es-ES')}</span>}
              </div>
            </div>
            {onOpenFullPage && (
              <button className="btn btn-sm" onClick={onOpenFullPage}>
                Abrir ficha completa
              </button>
            )}
          </div>

          <div className="study-kpi-grid compact">
            <Metric
              value={recommendedPower != null ? `${formatNumber(recommendedPower, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWp` : '—'}
              label="Potencia recomendada"
              tone="primary"
            />
            <Metric value={annualSavings != null ? `${formatNumber(annualSavings)} €` : '—'} label="Ahorro anual" />
            <Metric value={monthlySavings != null ? `${formatNumber(monthlySavings)} €` : '—'} label="Ahorro mensual" />
            <Metric value={viabilityScore != null ? formatNumber(viabilityScore, { maximumFractionDigits: 0 }) : '—'} label="Score de viabilidad" />
          </div>
        </div>

        <SectionTabs
          value={compactTab}
          onChange={setCompactTab}
          items={[
            { id: 'preview', label: 'Preview' },
            { id: 'cliente', label: 'Cliente' },
            { id: 'factura', label: 'Factura' },
            { id: 'calculo', label: 'Cálculo' },
            { id: 'instalacion', label: 'Instalación' },
            { id: 'reservas', label: 'Reservas' },
          ]}
        />

        <div className={`study-compact-panel ${compactTab === 'preview' ? 'preview-mode' : ''}`}>
          {compactPanels[compactTab]}
        </div>
      </div>
    )
  }

  return (
    <div className={`study-detail-layout ${compact ? 'compact' : ''}`}>
      <div className="study-detail-main">
        <div className="card card-sm" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div>
              <div className="page-title" style={{ fontSize: compact ? 18 : 20 }}>{displayName}</div>
              <div className="page-sub study-header-meta">
                <Pill status={study.status} map={STUDY_STATUS_LABELS} />
                {email && <span>{email}</span>}
                {phone && <span>{phone}</span>}
                {study.created_at && <span>{new Date(study.created_at).toLocaleDateString('es-ES')}</span>}
              </div>
            </div>
            {onOpenFullPage && (
              <button className="btn btn-sm" onClick={onOpenFullPage}>
                Abrir ficha completa
              </button>
            )}
          </div>

          <div className="study-kpi-grid">
            <Metric
              value={recommendedPower != null ? `${formatNumber(recommendedPower, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kWp` : '—'}
              label="Potencia recomendada"
              tone="primary"
            />
            <Metric
              value={annualSavings != null ? `${formatNumber(annualSavings)} €` : '—'}
              label="Ahorro anual"
            />
            <Metric
              value={monthlySavings != null ? `${formatNumber(monthlySavings)} €` : '—'}
              label="Ahorro mensual"
            />
            <Metric
              value={viabilityScore != null ? formatNumber(viabilityScore, { maximumFractionDigits: 0 }) : '—'}
              label="Score de viabilidad"
            />
          </div>
        </div>

        <div className="two-col mb-16">
          {clientePanel}
          {facturaPanel}
        </div>

        <div className="mb-16">{calculoPanel}</div>

        <div className="mb-16">{instalacionPanel}</div>

        {reservasPanel}
      </div>

      <div className="study-detail-side">
        <PreviewPanel study={study} />
      </div>
    </div>
  )
}
