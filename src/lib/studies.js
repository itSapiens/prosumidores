import { supabase } from './supabase.js'

export const STUDY_STATUS_LABELS = {
  uploaded:   { label: 'Subido',      color: 'pill-gray' },
  validated:  { label: 'Validado',    color: 'pill-amber' },
  calculated: { label: 'Calculado',   color: 'pill-blue' },
  sent:       { label: 'Enviado',     color: 'pill-green' },
  reserved:   { label: 'Reservado',   color: 'pill-blue' },
  contracted: { label: 'Contratado',  color: 'pill-green' },
  rejected:   { label: 'Rechazado',   color: 'pill-red' },
  cancelled:  { label: 'Cancelado',   color: 'pill-gray' },
}

export const RESERVATION_STATUS_LABELS = {
  pending_payment: { label: 'Pendiente de pago', color: 'pill-amber' },
  paid:            { label: 'Pagado',            color: 'pill-green' },
  confirmed:       { label: 'Confirmado',        color: 'pill-blue' },
  released:        { label: 'Liberado',          color: 'pill-gray' },
  cancelled:       { label: 'Cancelado',         color: 'pill-gray' },
  rejected:        { label: 'Rechazado',         color: 'pill-red' },
}

export const PAYMENT_STATUS_LABELS = {
  pending:     { label: 'Pendiente',      color: 'pill-amber' },
  signal_paid: { label: 'Reserva pagada', color: 'pill-blue' },
  paid:        { label: 'Pago completo',  color: 'pill-green' },
  failed:      { label: 'Fallido',        color: 'pill-red' },
  refunded:    { label: 'Devuelto',       color: 'pill-gray' },
}

const STUDY_SELECT = '*'

function isPresent(value) {
  return value !== null && value !== undefined && value !== ''
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function pick(...values) {
  for (const value of values) {
    if (isPresent(value)) return value
  }
  return null
}

function normalizeText(value) {
  if (!isPresent(value)) return null
  const text = String(value).trim()
  return text || null
}

function maybeNumber(value) {
  if (!isPresent(value)) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function getFileExtension(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const clean = text.split('?')[0].split('#')[0]
  const part = clean.split('.').pop()
  return part && part !== clean ? part.toLowerCase() : ''
}

function guessMimeType(path, fallback) {
  const explicit = normalizeText(fallback)
  if (explicit) return explicit

  const extension = getFileExtension(path)
  if (extension === 'pdf') return 'application/pdf'
  if (['jpg', 'jpeg'].includes(extension)) return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  return null
}

function getGooglePreviewUrl(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    const parts = parsed.pathname.split('/').filter(Boolean)
    const fileId = parts[2] || parsed.searchParams.get('id')

    if (!fileId) return null

    if (host === 'drive.google.com') {
      return `https://drive.google.com/file/d/${fileId}/preview`
    }
    if (host === 'docs.google.com') {
      const kind = parts[0]
      if (['document', 'spreadsheets', 'presentation'].includes(kind)) {
        return `https://docs.google.com/${kind}/d/${fileId}/preview`
      }
    }
  } catch {
    return null
  }

  return null
}

function getPreviewUrl(url, mimeType) {
  if (!normalizeText(url)) return null

  const googlePreview = getGooglePreviewUrl(url)
  if (googlePreview) return googlePreview

  if ((mimeType || '').toLowerCase().includes('pdf')) return `${url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`
  if (/\.pdf($|[?#])/i.test(url)) return `${url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`

  return null
}

function getFileLabel(url, fallback) {
  if (fallback) return fallback

  try {
    const parsed = new URL(url)
    const name = parsed.pathname.split('/').filter(Boolean).pop()
    return name ? decodeURIComponent(name) : 'Documento'
  } catch {
    return 'Documento'
  }
}

function getPathLabel(path, fallback) {
  const explicit = normalizeText(fallback)
  if (explicit) return explicit
  const text = normalizeText(path)
  if (!text) return 'Documento'
  const parts = text.split('/').filter(Boolean)
  return decodeURIComponent(parts[parts.length - 1] || 'Documento')
}

function getParentFolder(path) {
  const text = normalizeText(path)
  if (!text) return null
  const parts = text.split('/').filter(Boolean)
  if (parts.length <= 1) return null
  return parts.slice(0, -1).join('/')
}

function getStudyStorageFolder(study, source) {
  return normalizeText(
    pick(
      study?.supabase_folder_path,
      source.supabase_folder_path,
      source.folder_path,
      getParentFolder(study?.factura_supabase_path),
      getParentFolder(study?.propuesta_supabase_path)
    )
  )
}

function getStorageRootFolder(study, source) {
  const folder = getStudyStorageFolder(study, source)
  if (folder) {
    const first = folder.split('/').filter(Boolean)[0]
    if (first) return first
  }
  return 'clients'
}

function slugify(value) {
  const text = normalizeText(value)
  if (!text) return ''
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getFolderCandidateSlugs(study) {
  const customer = getStudyCustomer(study)
  const displayName = getStudyDisplayName(study)
  const email = getStudyEmail(study)
  const dni = getStudyDni(study)
  const phone = getStudyPhone(study)
  const localEmail = normalizeText(email)?.split('@')[0] || null

  return [
    slugify(displayName),
    slugify(customer.nombre_completo),
    slugify(customer.nombreCompleto),
    slugify(localEmail),
    slugify([displayName, dni].filter(Boolean).join('-')),
    slugify([displayName, phone].filter(Boolean).join('-')),
  ].filter(Boolean)
}

function getDocumentSearchTokens(key) {
  if (key === 'invoice') return ['factura', 'invoice', 'recibo']
  if (key === 'proposal') return ['propuesta', 'proposal', 'estudio']
  if (key === 'contract') return ['contrato-firmado', 'contrato', 'contract', 'signed']
  return []
}

async function resolveStorageDocument(document, folderPath) {
  if (!document.bucket) return { ...document, error: 'Bucket de almacenamiento no disponible.' }

  const signExactPath = async path => {
    const { data, error } = await supabase
      .storage
      .from(document.bucket)
      .createSignedUrl(path, 60 * 60)

    if (error) return { data: null, error }
    return { data, error: null }
  }

  if (document.path) {
    const exact = await signExactPath(document.path)
    if (!exact.error) {
      return {
        ...document,
        url: exact.data?.signedUrl || null,
        previewUrl: getPreviewUrl(exact.data?.signedUrl, document.mimeType),
      }
    }
  }

  const folder = normalizeText(folderPath || getParentFolder(document.path))
  if (!folder) {
    return { ...document, error: 'No se encontró la carpeta del cliente en Supabase Storage.' }
  }

  const { data: entries, error: listError } = await supabase
    .storage
    .from(document.bucket)
    .list(folder, { limit: 50 })

  if (listError) {
    return { ...document, error: listError.message || 'No se pudo listar la carpeta del cliente.' }
  }

  const tokens = getDocumentSearchTokens(document.key)
  const candidate = (entries || []).find(entry => {
    const name = (entry.name || '').toLowerCase()
    return tokens.some(token => name.includes(token))
  }) || (entries || []).find(entry => entry.name && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(getFileExtension(entry.name)))

  if (!candidate?.name) {
    return { ...document, error: 'No se encontró ningún archivo compatible en la carpeta del cliente.' }
  }

  const resolvedPath = `${folder}/${candidate.name}`
  const signed = await signExactPath(resolvedPath)
  if (signed.error) {
    return { ...document, error: signed.error.message || 'No se pudo firmar el archivo encontrado en la carpeta.' }
  }

  return {
    ...document,
    path: resolvedPath,
    filename: candidate.name,
    mimeType: guessMimeType(candidate.name, document.mimeType),
    url: signed.data?.signedUrl || null,
    previewUrl: getPreviewUrl(signed.data?.signedUrl, guessMimeType(candidate.name, document.mimeType)),
  }
}

async function discoverStudyStorageFolder(study, source, bucket) {
  const rootFolder = getStorageRootFolder(study, source)
  const slugCandidates = getFolderCandidateSlugs(study)
  if (!bucket || slugCandidates.length === 0) return null

  const { data: entries, error } = await supabase
    .storage
    .from(bucket)
    .list(rootFolder, { limit: 1000 })

  if (error) return null

  const folders = (entries || []).map(entry => entry.name).filter(Boolean)
  const match = folders.find(name => {
    const normalized = slugify(name)
    return slugCandidates.some(candidate => normalized === candidate || normalized.startsWith(`${candidate}-`))
  })

  return match ? `${rootFolder}/${match}` : null
}

function buildDocuments(study, contract = null) {
  const source = asObject(study?.source_file)
  const contractData = asObject(contract || study?.contract || study?.contracts)
  const documents = []
  const seen = new Set()

  const addDocument = ({ key, label, url, bucket, path, mimeType, filename }) => {
    const cleanUrl = normalizeText(url)
    const cleanBucket = normalizeText(bucket)
    const cleanPath = normalizeText(path)
    const uniqueId = cleanUrl || `${cleanBucket || ''}:${cleanPath || ''}`
    if (!uniqueId || seen.has(uniqueId)) return
    seen.add(uniqueId)

    documents.push({
      key,
      label,
      url: cleanUrl,
      bucket: cleanBucket,
      path: cleanPath,
      filename: cleanUrl ? getFileLabel(cleanUrl, filename) : getPathLabel(cleanPath, filename),
      mimeType: guessMimeType(cleanPath || cleanUrl, mimeType),
      previewUrl: cleanUrl ? getPreviewUrl(cleanUrl, mimeType) : null,
    })
  }

  const defaultBucket = pick(
    study?.documentos_supabase_bucket,
    study?.supabase_bucket,
    source.documentos_supabase_bucket,
    source.supabase_bucket,
    source.bucket
  )

  addDocument({
    key: 'proposal',
    label: 'Propuesta',
    url: pick(source.proposal_drive_url, source.proposal_url, source.proposalUrl),
    bucket: pick(source.propuesta_supabase_bucket, source.proposal_supabase_bucket, defaultBucket),
    path: pick(
      study?.propuesta_supabase_path,
      source.propuesta_supabase_path,
      source.proposal_supabase_path,
      source.propuesta_path,
      source.proposal_path
    ),
    mimeType: pick(source.proposal_mime_type, source.proposalMimeType, source.proposal_type),
    filename: pick(source.proposal_filename, source.proposalFilename, source.proposal_name),
  })

  addDocument({
    key: 'invoice',
    label: 'Factura',
    url: pick(source.invoice_drive_url, source.invoice_url, source.invoiceUrl, source.drive_url, source.url),
    bucket: pick(source.factura_supabase_bucket, source.invoice_supabase_bucket, defaultBucket),
    path: pick(
      study?.factura_supabase_path,
      source.factura_supabase_path,
      source.invoice_supabase_path,
      source.factura_path,
      source.invoice_path
    ),
    mimeType: pick(source.invoice_mime_type, source.invoiceMimeType, source.mime_type, source.mimetype),
    filename: pick(source.invoice_filename, source.invoiceFilename, source.original_filename, source.name),
  })

  addDocument({
    key: 'contract',
    label: 'Contrato firmado',
    url: pick(
      contractData.contract_drive_url,
      contractData.drive_url,
      source.contract_drive_url,
      source.contract_url,
      source.signed_contract_url
    ),
    bucket: pick(
      contractData.contract_supabase_bucket,
      contractData.supabase_bucket,
      source.contract_supabase_bucket,
      defaultBucket
    ),
    path: pick(
      contractData.contract_supabase_path,
      source.contract_supabase_path,
      source.signed_contract_supabase_path,
      contractData.contract_path,
      source.contract_path
    ),
    mimeType: pick(source.contract_mime_type, source.contractMimeType, contractData.mime_type),
    filename: pick(
      source.contract_filename,
      source.contractFilename,
      contractData.contract_filename,
      contractData.contract_number,
      'contrato-firmado.pdf'
    ),
  })

  return documents
}

async function queryRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  return { data, error }
}

function isMissingRpcError(error) {
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return error?.code === 'PGRST202'
    || message.includes('could not find the function')
    || message.includes('function') && message.includes('schema cache')
}

async function queryStudiesDirect() {
  const { data, error } = await supabase
    .from('studies')
    .select(STUDY_SELECT)
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function listStudies() {
  const directResult = await queryStudiesDirect()
  if (!directResult.error && (directResult.data || []).length > 0) {
    return { data: directResult.data || [], error: null, source: 'direct' }
  }

  const rpcResult = await queryRpc('get_studies_overview')
  if (!rpcResult.error) {
    return {
      data: rpcResult.data || [],
      error: null,
      source: 'rpc',
      warnings: (directResult.data || []).length === 0 ? ['fallback_rpc_used'] : [],
    }
  }

  if (!directResult.error) {
    const warnings = []
    if (isMissingRpcError(rpcResult.error)) warnings.push('missing_studies_rpc')
    if ((directResult.data || []).length === 0) warnings.push('direct_query_returned_empty')
    return { data: directResult.data || [], error: null, source: 'direct', rpcError: rpcResult.error, warnings }
  }

  return { data: [], error: directResult.error || rpcResult.error, source: 'error', rpcError: rpcResult.error }
}

export async function getStudyDetail(id) {
  const { data, error } = await supabase
    .from('studies')
    .select(STUDY_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (!error) {
    return { data, error: null, source: 'direct' }
  }

  const rpcResult = await queryRpc('get_study_detail', { p_study_id: id })
  if (!rpcResult.error) {
    return { data: rpcResult.data?.[0] || null, error: null, source: 'rpc' }
  }

  return { data: null, error: error || rpcResult.error, source: 'error', rpcError: rpcResult.error }
}

export async function getStudyReservations(id) {
  const { data, error } = await supabase
    .from('installation_reservations')
    .select('*')
    .eq('study_id', id)
    .order('created_at', { ascending: false })

  if (!error) {
    return { data: data || [], error: null, source: 'direct' }
  }

  const rpcResult = await queryRpc('get_study_reservations', { p_study_id: id })
  if (!rpcResult.error) {
    return { data: rpcResult.data || [], error: null, source: 'rpc' }
  }

  return { data: [], error: error || rpcResult.error, source: 'error', rpcError: rpcResult.error }
}

export async function getStudyContract(id) {
  if (!id) return { data: null, error: null, source: 'empty' }

  const { data, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('study_id', id)
    .maybeSingle()

  if (!error) {
    return { data: data || null, error: null, source: 'direct' }
  }

  const rpcResult = await queryRpc('get_study_contract', { p_study_id: id })
  if (!rpcResult.error) {
    const contract = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data
    return { data: contract || null, error: null, source: 'rpc' }
  }

  if (isMissingRpcError(rpcResult.error)) {
    return { data: null, error, source: 'direct', rpcError: rpcResult.error }
  }

  return { data: null, error: error || rpcResult.error, source: 'error', rpcError: rpcResult.error }
}

export function getStudyCustomer(study) {
  return asObject(study?.customer)
}

export function getStudyLocation(study) {
  return asObject(study?.location)
}

export function getStudyInvoice(study) {
  return asObject(study?.invoice_data)
}

export function getStudyCalculation(study) {
  return asObject(study?.calculation)
}

export function getStudyDisplayName(study) {
  const customer = getStudyCustomer(study)
  const fullName = normalizeText(
    pick(
      customer.full_name,
      customer.fullName,
      customer.nombre_completo,
      customer.nombreCompleto,
      customer.name
    )
  )

  if (fullName) return fullName

  const firstName = normalizeText(pick(customer.nombre, customer.first_name, customer.firstName))
  const lastName = normalizeText(pick(customer.apellidos, customer.last_name, customer.lastName, customer.surnames))
  const combined = [firstName, lastName].filter(Boolean).join(' ')

  return combined || null
}

export function getStudyEmail(study) {
  const customer = getStudyCustomer(study)
  return normalizeText(pick(customer.email, customer.mail))
}

export function getStudyPhone(study) {
  const customer = getStudyCustomer(study)
  return normalizeText(pick(customer.telefono, customer.phone, customer.movil, customer.mobile))
}

export function getStudyDni(study) {
  const customer = getStudyCustomer(study)
  return normalizeText(pick(customer.dni, customer.nif, customer.cif, customer.document_id))
}

export function getStudyCups(study) {
  const customer = getStudyCustomer(study)
  return normalizeText(pick(customer.cups, customer.cups_consumo, customer.cupsConsumo))
}

export function getStudyIban(study) {
  const customer = getStudyCustomer(study)
  return normalizeText(pick(customer.iban, customer.IBAN))
}

export function getStudyAddress(study) {
  const customer = getStudyCustomer(study)
  const location = getStudyLocation(study)
  return normalizeText(
    pick(
      customer.direccion_completa,
      customer.direccionCompleta,
      customer.address,
      location.direccion_completa,
      location.address
    )
  )
}

export function getStudyPostalCode(study) {
  const customer = getStudyCustomer(study)
  const location = getStudyLocation(study)
  return normalizeText(pick(customer.codigo_postal, customer.postal_code, location.codigo_postal, location.postal_code))
}

export function getStudyCity(study) {
  const customer = getStudyCustomer(study)
  const location = getStudyLocation(study)
  return normalizeText(pick(customer.poblacion, customer.city, location.poblacion, location.city))
}

export function getStudyCountry(study) {
  const customer = getStudyCustomer(study)
  const location = getStudyLocation(study)
  return normalizeText(pick(customer.pais, customer.country, location.pais, location.country))
}

export function getStudyInvoiceType(study) {
  const customer = getStudyCustomer(study)
  const invoice = getStudyInvoice(study)
  return normalizeText(pick(invoice.type, invoice.tipoFactura, invoice.tariff_type, customer.tipo_factura))
}

export function getStudyAverageConsumption(study) {
  const customer = getStudyCustomer(study)
  const invoice = getStudyInvoice(study)
  return maybeNumber(
    pick(
      customer.consumo_medio_mensual_kwh,
      invoice.averageMonthlyConsumptionKwh,
      invoice.consumoMedioMensual
    )
  )
}

export function getStudyRealConsumption(study) {
  const customer = getStudyCustomer(study)
  const invoice = getStudyInvoice(study)
  return maybeNumber(
    pick(
      customer.consumo_mensual_real_kwh,
      invoice.consumptionKwh,
      invoice.consumoMensualReal
    )
  )
}

export function getStudyPeriodPrice(study, period) {
  const customer = getStudyCustomer(study)
  const invoice = getStudyInvoice(study)
  return maybeNumber(
    pick(
      customer[`precio_${period.toLowerCase()}_eur_kwh`],
      invoice.periodPricesEurPerKwh?.[period]
    )
  )
}

export function getStudyRecommendedPower(study) {
  return maybeNumber(pick(getStudyCalculation(study).recommendedPowerKwp, study?.assigned_kwp))
}

export function getStudyAnnualSavings(study) {
  return maybeNumber(getStudyCalculation(study).annualSavingsService)
}

export function getStudyMonthlySavings(study) {
  return maybeNumber(getStudyCalculation(study).monthlySavingsService)
}

export function getStudyViabilityScore(study) {
  return maybeNumber(getStudyCalculation(study).viabilityScore)
}

export function getStudyAssignedInstallationName(study) {
  const snapshot = asObject(study?.selected_installation_snapshot)
  return normalizeText(pick(snapshot.nombre_instalacion, snapshot.name))
}

export function getStudyDocuments(study) {
  return buildDocuments(study)
}

export async function resolveStudyDocuments(study) {
  const source = asObject(study?.source_file)
  const contractResult = await getStudyContract(study?.id)
  const contract = contractResult.data
  const documents = buildDocuments(study, contract)
  const exactFolderPath = getStudyStorageFolder(study, {
    ...source,
    supabase_folder_path: pick(contract?.supabase_folder_path, source.supabase_folder_path),
  })

  return Promise.all(documents.map(async document => {
    if (document.url) return document
    let resolved = await resolveStorageDocument(document, exactFolderPath)

    const lowerError = String(resolved.error || '').toLowerCase()
    if (resolved.error && (
      lowerError.includes('no se encontró')
      || lowerError.includes('object not found')
      || lowerError.includes('bucket')
    )) {
      const discoveredFolder = await discoverStudyStorageFolder(study, source, document.bucket)
      if (discoveredFolder && discoveredFolder !== exactFolderPath) {
        resolved = await resolveStorageDocument(document, discoveredFolder)
      }
    }

    if (resolved.error) {
      console.error(`storage signed url error (${document.key}):`, resolved.error)
    }
    return resolved
  }))
}

export function formatNumber(value, options = {}) {
  const number = maybeNumber(value)
  if (number === null) return null
  return new Intl.NumberFormat('es-ES', options).format(number)
}
