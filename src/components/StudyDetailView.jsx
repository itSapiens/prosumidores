import { useEffect, useMemo, useState } from 'react'
import {
  CONTRACT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  PROPOSAL_MODE_LABELS,
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

function RelatedStudiesPanel({ study, relatedStudies = [], onOpenStudy }) {
  const others = relatedStudies
    .filter(item => item?.id && item.id !== study?.id)
    .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))

  return (
    <div className="card card-sm">
      <div className="card-title mb-8">
        Estudios relacionados
        <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
          ({others.length})
        </span>
      </div>
      {others.length === 0 ? (
        <div className="text-muted" style={{ padding: '4px 0' }}>
          No hay otros estudios vinculados a este cliente.
        </div>
      ) : (
        <div className="related-study-list">
          {others.map((item, index) => {
            const cups = getStudyCups(item)
            const power = getStudyRecommendedPower(item)
            const date = item.created_at ? new Date(item.created_at).toLocaleString('es-ES', {
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }) : 'Sin fecha'

            return (
              <button
                key={item.id}
                className="related-study-item"
                onClick={() => onOpenStudy?.(item.id)}
              >
                <div>
                  <div className="related-study-title">Estudio {String(index + 1).padStart(2, '0')} · {date}</div>
                  <div className="related-study-meta">
                    {cups ? <span className="text-mono">{cups}</span> : <span>Sin CUPS</span>}
                    {power != null && <span>{formatNumber(power, { maximumFractionDigits: 2 })} kWp</span>}
                  </div>
                </div>
                <span className="related-study-action">Abrir</span>
              </button>
            )
          })}
        </div>
      )}
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
      setLoading(seedDocuments.some(doc => !doc.url && doc.bucket))

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
  contract = null,
  installation = null,
  compact = false,
  relatedStudies = [],
  onOpenInstallation,
  onOpenFullPage,
  onOpenStudy,
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
  const installationName = getStudyAssignedInstallationName(study, installation, reservations, contract)
  const mainReservation = reservations[0] || null
  const assignedInstallationId = study.selected_installation_id
    || mainReservation?.installation_id
    || contract?.installation_id
    || installation?.id
  const signedAt = contract?.signed_at || contract?.confirmed_at
  const hasSignedContract = ['signed', 'confirmed'].includes(String(contract?.status || '').toLowerCase()) || Boolean(signedAt)

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

  const estadoComercialPanel = (
    <div className="card card-sm">
      <div className="card-title mb-8">Estado comercial</div>
      <div className="detail-grid">
        <DetailRow
          label="Firma contrato"
          value={contract
            ? <Pill status={hasSignedContract ? 'signed' : contract.status} map={CONTRACT_STATUS_LABELS} />
            : <span className="text-muted">Sin contrato</span>}
        />
        <DetailRow
          label="Modalidad seleccionada"
          value={contract?.proposal_mode
            ? <Pill status={contract.proposal_mode} map={PROPOSAL_MODE_LABELS} />
            : null}
        />
        <DetailRow
          label="Pago"
          value={mainReservation?.payment_status
            ? <Pill status={mainReservation.payment_status} map={PAYMENT_STATUS_LABELS} />
            : null}
        />
        <DetailRow
          label="Reserva"
          value={mainReservation?.reservation_status
            ? <Pill status={mainReservation.reservation_status} map={RESERVATION_STATUS_LABELS} />
            : null}
        />
        <DetailRow label="Nº contrato" value={contract?.contract_number || null} mono />
        <DetailRow label="Fecha firma" value={signedAt ? new Date(signedAt).toLocaleDateString('es-ES') : null} />
        <DetailRow
          label="kWp reservados"
          value={mainReservation?.reserved_kwp != null ? `${formatNumber(mainReservation.reserved_kwp)} kWp` : null}
        />
        <DetailRow
          label="Plazo pago"
          value={mainReservation?.payment_deadline_at ? new Date(mainReservation.payment_deadline_at).toLocaleDateString('es-ES') : null}
        />
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
            {installationName || 'No se ha podido resolver la instalación vinculada.'}
          </div>
        </div>
        {assignedInstallationId && onOpenInstallation && (
          <button className="btn btn-sm" onClick={() => onOpenInstallation(assignedInstallationId)}>
            Ver instalación
          </button>
        )}
      </div>
      <div className="detail-grid">
        <DetailRow label="Nombre" value={installationName} />
        <DetailRow
          label="Potencia instalada"
          value={
            (study.selected_installation_snapshot?.potencia_instalada_kwp ?? installation?.potencia_instalada_kwp) != null
              ? `${formatNumber(study.selected_installation_snapshot?.potencia_instalada_kwp ?? installation?.potencia_instalada_kwp)} kWp`
              : null
          }
        />
        <DetailRow label="Distribuidora" value={installation?.distribuidoras?.nombre || null} />
        <DetailRow label="Dirección" value={study.selected_installation_snapshot?.direccion || installation?.direccion || null} />
        <DetailRow label="Municipio" value={installation?.municipio || null} />
        <DetailRow label="CAU generación" value={installation?.cups_generador || null} mono />
        <DetailRow label="kWp asignados" value={(study.assigned_kwp ?? mainReservation?.reserved_kwp) != null ? `${formatNumber(study.assigned_kwp ?? mainReservation?.reserved_kwp)} kWp` : null} />
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

  const relatedStudiesPanel = (
    <RelatedStudiesPanel
      study={study}
      relatedStudies={relatedStudies}
      onOpenStudy={onOpenStudy}
    />
  )

  if (compact) {
    const compactPanels = {
      preview: <PreviewPanel study={study} compact />,
      estado: estadoComercialPanel,
      cliente: clientePanel,
      factura: facturaPanel,
      calculo: calculoPanel,
      instalacion: instalacionPanel,
      reservas: reservasPanel,
      relacionados: relatedStudiesPanel,
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
            { id: 'estado', label: 'Estado' },
            { id: 'cliente', label: 'Cliente' },
            { id: 'factura', label: 'Factura' },
            { id: 'calculo', label: 'Cálculo' },
            { id: 'instalacion', label: 'Instalación' },
            { id: 'reservas', label: 'Reservas' },
            { id: 'relacionados', label: 'Relacionados' },
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
          {estadoComercialPanel}
          {instalacionPanel}
        </div>

        <div className="two-col mb-16">
          {clientePanel}
          {facturaPanel}
        </div>

        <div className="mb-16">{calculoPanel}</div>

        {reservasPanel}

        <div className="mt-16">{relatedStudiesPanel}</div>
      </div>

      <div className="study-detail-side">
        <PreviewPanel study={study} />
      </div>
    </div>
  )
}
