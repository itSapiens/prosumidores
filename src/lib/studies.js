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

export const CONTRACT_STATUS_LABELS = {
  generated: { label: 'Generado',   color: 'pill-amber' },
  uploaded:  { label: 'Subido',     color: 'pill-blue' },
  signed:    { label: 'Firmado',    color: 'pill-green' },
  confirmed: { label: 'Confirmado', color: 'pill-green' },
  cancelled: { label: 'Cancelado',  color: 'pill-gray' },
}

export const PROPOSAL_MODE_LABELS = {
  investment: { label: 'Inversión', color: 'pill-blue' },
  service:    { label: 'Servicio',  color: 'pill-green' },
}

const STUDY_SELECT = '*'
const SAPIENS_STUDY_ADMIN_EMAILS = new Set([
  'juan@sapiensenergia.es',
  'tecnicoit01@sapiensenergia.es',
  'carlos@sapiensenergia.es',
  'it@sapiensenergia.es',
])

export function isConfiguredStudyAdminEmail(email) {
  return SAPIENS_STUDY_ADMIN_EMAILS.has(String(email || '').trim().toLowerCase())
}

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

function getPathFilename(path) {
  const text = normalizeText(path)
  if (!text) return null
  const parts = text.split('/').filter(Boolean)
  return parts[parts.length - 1] || null
}

function getStudyStorageFolder(study, source) {
  return normalizeText(
    pick(
      source.supabase_folder_path,
      source.folder_path,
      getParentFolder(source.factura_supabase_path),
      getParentFolder(source.invoice_supabase_path),
      getParentFolder(source.propuesta_supabase_path),
      getParentFolder(source.proposal_supabase_path),
      study?.supabase_folder_path,
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

function parseStorageTimestamp(value) {
  const text = normalizeText(value)
  if (!text) return null
  const match = text.match(/(?:^|[-_/])(\d{8})T?(\d{6})(\d{0,3})Z?/i)
  if (!match) return null

  const [, date, time, millis = ''] = match
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(4, 6)) - 1
  const day = Number(date.slice(6, 8))
  const hour = Number(time.slice(0, 2))
  const minute = Number(time.slice(2, 4))
  const second = Number(time.slice(4, 6))
  const ms = Number(millis.padEnd(3, '0') || 0)
  const valueMs = Date.UTC(year, month, day, hour, minute, second, ms)
  return Number.isFinite(valueMs) ? valueMs : null
}

function parseDateMs(value) {
  const text = normalizeText(value)
  if (!text) return null
  const ms = Date.parse(text)
  return Number.isFinite(ms) ? ms : null
}

function getStudyReferenceDateMs(study) {
  const source = asObject(study?.source_file)
  return parseDateMs(pick(
    source.created_at,
    source.createdAt,
    source.uploaded_at,
    source.uploadedAt,
    source.timestamp,
    source.generated_at,
    study?.created_at,
    study?.updated_at
  ))
}

function getEntryDateMs(entry) {
  return parseStorageTimestamp(entry?.name)
    || parseDateMs(entry?.created_at)
    || parseDateMs(entry?.updated_at)
    || parseDateMs(entry?.last_accessed_at)
}

function getStudyIdentifierTokens(study) {
  const source = asObject(study?.source_file)
  return [
    study?.id,
    study?.id ? String(study.id).slice(0, 8) : null,
    study?.id ? String(study.id).slice(0, 12) : null,
    source.study_id,
    source.studyId,
    source.upload_id,
    source.uploadId,
    source.file_id,
    source.fileId,
    source.document_set_id,
  ]
    .map(value => normalizeText(value)?.toLowerCase())
    .filter(value => value && value.length >= 8)
}

function normalizeStoredDocumentEntry(entry, fallbackKey = null) {
  const document = asObject(entry)
  const type = normalizeText(document.type || document.key || fallbackKey)
  const normalizedType = type === 'invoice'
    ? 'invoice'
    : type === 'proposal'
      ? 'proposal'
      : type === 'signed_contract' || type === 'contract'
        ? 'contract'
        : fallbackKey

  if (!normalizedType) return null

  return {
    key: normalizedType,
    label: normalizedType === 'invoice'
      ? 'Factura'
      : normalizedType === 'proposal'
        ? 'Propuesta'
        : 'Contrato firmado',
    bucket: document.bucket,
    path: document.path,
    mimeType: document.mime_type || document.mimeType,
    filename: document.file_name || document.fileName || document.original_name || document.originalName,
    uploadedAt: document.uploaded_at || document.uploadedAt,
  }
}

function getDocumentFilenameTokens(document) {
  return [
    document?.filename,
    getPathFilename(document?.path),
  ]
    .map(value => normalizeText(value)?.toLowerCase())
    .filter(value => value && value !== 'documento')
}

function scoreStorageEntry(entry, document, study) {
  const name = normalizeText(entry?.name)
  if (!name) return { score: -1, dateDiff: Number.POSITIVE_INFINITY }

  const lowerName = name.toLowerCase()
  const searchTokens = getDocumentSearchTokens(document.key)
  const matchesDocumentKind = searchTokens.some(token => lowerName.includes(token))
  const filenameTokens = getDocumentFilenameTokens(document)
  const identifierTokens = getStudyIdentifierTokens(study)
  const entryDateMs = getEntryDateMs(entry)
  const studyDateMs = getStudyReferenceDateMs(study)
  const dateDiff = entryDateMs && studyDateMs ? Math.abs(entryDateMs - studyDateMs) : Number.POSITIVE_INFINITY

  let score = 0
  if (matchesDocumentKind) score += 100
  if (filenameTokens.some(token => lowerName === token || lowerName.endsWith(`/${token}`))) score += 1000
  if (filenameTokens.some(token => token.length >= 8 && lowerName.includes(token))) score += 300
  if (identifierTokens.some(token => lowerName.includes(token))) score += 700

  if (Number.isFinite(dateDiff)) {
    const minutes = dateDiff / 60000
    if (minutes <= 2) score += 300
    else if (minutes <= 10) score += 220
    else if (minutes <= 60) score += 160
    else if (minutes <= 24 * 60) score += 90
    else if (minutes <= 7 * 24 * 60) score += 25
  }

  return { score, dateDiff }
}

function pickBestStorageEntry(entries, document, study) {
  const compatible = (entries || []).filter(entry => {
    const extension = getFileExtension(entry?.name)
    return entry?.name && ['pdf', 'jpg', 'jpeg', 'png', 'webp'].includes(extension)
  })
  const tokens = getDocumentSearchTokens(document.key)
  const typed = compatible.filter(entry => {
    const name = (entry.name || '').toLowerCase()
    return tokens.some(token => name.includes(token))
  })
  const candidates = typed.length > 0 ? typed : compatible

  return candidates
    .map(entry => ({ entry, ...scoreStorageEntry(entry, document, study) }))
    .sort((a, b) => b.score - a.score || a.dateDiff - b.dateDiff || String(a.entry.name).localeCompare(String(b.entry.name)))
    [0]?.entry || null
}

async function resolveStorageDocument(document, folderPath, study) {
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

  const candidate = pickBestStorageEntry(entries, document, study)

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

  const referenceDateMs = getStudyReferenceDateMs(study)
  const identifiers = getStudyIdentifierTokens(study)
  const matches = (entries || [])
    .filter(entry => entry?.name)
    .map(entry => {
      const name = entry.name
      const normalized = slugify(name)
      const slugScore = slugCandidates.reduce((best, candidate) => {
        if (normalized === candidate) return Math.max(best, 120)
        if (normalized.startsWith(`${candidate}-`)) return Math.max(best, 100)
        return best
      }, 0)

      if (!slugScore) return null

      const lowerName = name.toLowerCase()
      const entryDateMs = getEntryDateMs(entry)
      const dateDiff = entryDateMs && referenceDateMs ? Math.abs(entryDateMs - referenceDateMs) : Number.POSITIVE_INFINITY
      let score = slugScore
      if (identifiers.some(token => lowerName.includes(token))) score += 700
      if (Number.isFinite(dateDiff)) {
        const minutes = dateDiff / 60000
        if (minutes <= 2) score += 300
        else if (minutes <= 10) score += 220
        else if (minutes <= 60) score += 160
        else if (minutes <= 24 * 60) score += 90
      }

      return { name, score, dateDiff }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.dateDiff - b.dateDiff || a.name.localeCompare(b.name))

  return matches[0]?.name ? `${rootFolder}/${matches[0].name}` : null
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
    if (!cleanUrl && !cleanBucket && !cleanPath) return
    const uniqueId = cleanUrl || `${key}:${cleanBucket || ''}:${cleanPath || ''}`
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
    source.documentos_supabase_bucket,
    source.supabase_bucket,
    source.bucket,
    study?.documentos_supabase_bucket,
    study?.supabase_bucket
  )

  const storedDocuments = Array.isArray(source.documents) ? source.documents : []
  storedDocuments
    .map(entry => normalizeStoredDocumentEntry(entry))
    .filter(Boolean)
    .forEach(document => {
      addDocument({
        key: document.key,
        label: document.label,
        bucket: pick(document.bucket, defaultBucket),
        path: document.path,
        mimeType: document.mimeType,
        filename: document.filename,
      })
    })

  const invoiceDocument = normalizeStoredDocumentEntry(source.invoice, 'invoice')
  if (invoiceDocument) {
    addDocument({
      key: 'invoice',
      label: 'Factura',
      bucket: pick(invoiceDocument.bucket, defaultBucket),
      path: invoiceDocument.path,
      mimeType: invoiceDocument.mimeType,
      filename: invoiceDocument.filename,
    })
  }

  const proposalDocument = normalizeStoredDocumentEntry(source.proposal, 'proposal')
  if (proposalDocument) {
    addDocument({
      key: 'proposal',
      label: 'Propuesta',
      bucket: pick(proposalDocument.bucket, defaultBucket),
      path: proposalDocument.path,
      mimeType: proposalDocument.mimeType,
      filename: proposalDocument.filename,
    })
  }

  const signedContractDocument = normalizeStoredDocumentEntry(
    contractData.metadata?.signed_contract || contractData.signed_contract || source.signed_contract,
    'contract'
  )
  if (signedContractDocument) {
    addDocument({
      key: 'contract',
      label: 'Contrato firmado',
      bucket: pick(signedContractDocument.bucket, contractData.contract_supabase_bucket, defaultBucket),
      path: signedContractDocument.path,
      mimeType: signedContractDocument.mimeType,
      filename: signedContractDocument.filename,
    })
  }

  addDocument({
    key: 'proposal',
    label: 'Propuesta',
    url: pick(source.proposal_drive_url, source.proposal_url, source.proposalUrl),
    bucket: pick(source.propuesta_supabase_bucket, source.proposal_supabase_bucket, defaultBucket),
    path: pick(
      source.propuesta_supabase_path,
      source.proposal_supabase_path,
      source.propuesta_path,
      source.proposal_path,
      study?.propuesta_supabase_path
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
      source.factura_supabase_path,
      source.invoice_supabase_path,
      source.factura_path,
      source.invoice_path,
      study?.factura_supabase_path
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

function filterVisibleStudies(studies) {
  return (studies || []).filter(study => study?.status !== 'cancelled')
}

async function queryStudiesDirect() {
  const { data, error } = await supabase
    .from('studies')
    .select(STUDY_SELECT)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  return { data, error }
}

export async function listStudies() {
  const directResult = await queryStudiesDirect()
  if (!directResult.error && (directResult.data || []).length > 0) {
    return { data: filterVisibleStudies(directResult.data), error: null, source: 'direct' }
  }

  const rpcResult = await queryRpc('get_studies_overview')
  if (!rpcResult.error) {
    return {
      data: filterVisibleStudies(rpcResult.data),
      error: null,
      source: 'rpc',
      warnings: (directResult.data || []).length === 0 ? ['fallback_rpc_used'] : [],
    }
  }

  if (!directResult.error) {
    const warnings = []
    if (isMissingRpcError(rpcResult.error)) warnings.push('missing_studies_rpc')
    if ((directResult.data || []).length === 0) warnings.push('direct_query_returned_empty')
    return { data: filterVisibleStudies(directResult.data), error: null, source: 'direct', rpcError: rpcResult.error, warnings }
  }

  return { data: [], error: directResult.error || rpcResult.error, source: 'error', rpcError: rpcResult.error }
}

export async function getStudyDetail(id) {
  const { data, error } = await supabase
    .from('studies')
    .select(STUDY_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (!error && data) {
    return { data, error: null, source: 'direct' }
  }

  const rpcResult = await queryRpc('get_study_detail', { p_study_id: id })
  if (!rpcResult.error) {
    return { data: rpcResult.data?.[0] || null, error: null, source: 'rpc' }
  }

  if (!error) {
    return { data: data || null, error: null, source: 'direct', rpcError: rpcResult.error }
  }

  return { data: null, error: error || rpcResult.error, source: 'error', rpcError: rpcResult.error }
}

export async function listRelatedStudies(study) {
  const clientId = normalizeText(study?.client_id)
  const dni = getStudyDni(study)
  const empresaId = normalizeText(study?.empresa_id)

  if (!clientId && !dni) return { data: [], error: null, source: 'empty' }

  let query = supabase
    .from('studies')
    .select(STUDY_SELECT)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })

  if (clientId) {
    query = query.eq('client_id', clientId)
  } else {
    query = query.eq('customer->>dni', dni)
    if (empresaId) query = query.eq('empresa_id', empresaId)
  }

  const { data, error } = await query

  return {
    data: filterVisibleStudies(data || []),
    error,
    source: error ? 'error' : 'direct',
  }
}

export async function getStudyReservations(id) {
  const { data, error } = await supabase
    .from('installation_reservations')
    .select('*')
    .eq('study_id', id)
    .order('created_at', { ascending: false })

  if (!error && (data || []).length > 0) {
    return { data: data || [], error: null, source: 'direct' }
  }

  const rpcResult = await queryRpc('get_study_reservations', { p_study_id: id })
  if (!rpcResult.error) {
    return { data: rpcResult.data || [], error: null, source: 'rpc' }
  }

  if (!error) {
    return { data: data || [], error: null, source: 'direct', rpcError: rpcResult.error }
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

  if (!error && data) {
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

  if (!error) {
    return { data: data || null, error: null, source: 'direct', rpcError: rpcResult.error }
  }

  return { data: null, error: error || rpcResult.error, source: 'error', rpcError: rpcResult.error }
}

export async function getStudyInstallation(study, reservations = [], contract = null) {
  const installationId = pick(
    study?.selected_installation_id,
    reservations.find(reservation => reservation.installation_id)?.installation_id,
    contract?.installation_id
  )

  if (!installationId) return { data: null, error: null, source: 'empty' }

  const { data, error } = await supabase
    .from('installations')
    .select('id, nombre_instalacion, potencia_instalada_kwp, potencia_nominal_kw, direccion, municipio, provincia, cups_generador, fecha_activacion, fecha_activacion_real, distribuidoras(id, nombre, codigo)')
    .eq('id', installationId)
    .maybeSingle()

  return { data: data || null, error, source: error ? 'error' : 'direct' }
}

export async function canCurrentUserDeleteStudies() {
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return { data: false, error: userError || null }
  if (isConfiguredStudyAdminEmail(user.email)) return { data: true, error: null }

  const { data, error } = await supabase
    .from('user_empresas')
    .select('role')
    .eq('user_id', user.id)
    .eq('role', 'admin')
    .limit(1)

  if (error) return { data: false, error }
  return { data: (data || []).length > 0, error: null }
}

export async function deleteStudyAdmin(id) {
  const { error } = await supabase.rpc('delete_study_admin', { p_study_id: id })
  return { error }
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
  const invoice = getStudyInvoice(study)
  return normalizeText(pick(
    customer.cups,
    customer.cups_consumo,
    customer.cupsConsumo,
    invoice.cups,
    invoice.cups_consumo,
    invoice.cupsConsumo
  ))
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
  return normalizeText(pick(
    invoice.type,
    invoice.tipo_factura,
    invoice.tipoFactura,
    invoice.billType,
    invoice.tariff_type,
    customer.tipo_factura
  ))
}

export function getStudyAverageConsumption(study) {
  const customer = getStudyCustomer(study)
  const invoice = getStudyInvoice(study)
  return maybeNumber(
    pick(
      invoice.averageMonthlyConsumptionKwh,
      invoice.consumo_medio_mensual_kwh,
      invoice.consumoMedioMensual,
      customer.consumo_medio_mensual_kwh
    )
  )
}

export function getStudyRealConsumption(study) {
  const customer = getStudyCustomer(study)
  const invoice = getStudyInvoice(study)
  return maybeNumber(
    pick(
      invoice.currentInvoiceConsumptionKwh,
      invoice.consumptionKwh,
      invoice.consumo_mensual_real_kwh,
      invoice.consumoMensualReal,
      customer.consumo_mensual_real_kwh
    )
  )
}

export function getStudyPeriodPrice(study, period) {
  const customer = getStudyCustomer(study)
  const invoice = getStudyInvoice(study)
  return maybeNumber(
    pick(
      invoice.periodPricesEurPerKwh?.[period],
      invoice.periodPricesEurPerKwh?.[period.toLowerCase()],
      invoice[`precio_${period.toLowerCase()}_eur_kwh`],
      customer[`precio_${period.toLowerCase()}_eur_kwh`],
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

export function getStudyAssignedInstallationName(study, installation = null, reservations = [], contract = null) {
  const snapshot = asObject(study?.selected_installation_snapshot)
  return normalizeText(pick(
    snapshot.nombre_instalacion,
    snapshot.name,
    installation?.nombre_instalacion,
    installation?.name,
    reservations.find(reservation => reservation.installation_name)?.installation_name,
    contract?.installation_name
  ))
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
    let resolved = await resolveStorageDocument(document, exactFolderPath, study)

    const lowerError = String(resolved.error || '').toLowerCase()
    if (resolved.error && (
      lowerError.includes('no se encontró')
      || lowerError.includes('object not found')
      || lowerError.includes('bucket')
    )) {
      const discoveredFolder = await discoverStudyStorageFolder(study, source, document.bucket)
      if (discoveredFolder && discoveredFolder !== exactFolderPath) {
        resolved = await resolveStorageDocument(document, discoveredFolder, study)
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
