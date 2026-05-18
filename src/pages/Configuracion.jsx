import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { mapSupabaseError } from '../lib/errors.js'
import { isConfiguredStudyAdminEmail } from '../lib/studies.js'

// ============================================================
// Configuración → CRUD de empresas
// ============================================================
// Cada empresa que aparece aquí es un "tenant" (empresa titular
// de instalaciones). Todas las empresas son visibles para usuarios
// autenticados, pero solo los admins globales pueden editar datos de
// empresa. Los admins pueden crear nuevas empresas vía
// la RPC `create_empresa_with_memberships` (migración 018).
//
// Campos obligatorios: nombre, cif, dirección, municipio,
// código postal, email. El resto son opcionales.
// ============================================================

const EMPTY_FORM = {
  nombre: '', cif: '', direccion: '', municipio: '', codigo_postal: '',
  provincia: '', telefono: '', email: '',
  representante_legal: '', creditor_id_sepa: '',
  logo_bucket: 'empresa-logos', logo_path: '', logo_mime_type: '',
  pdf_color_primario: '#061452',
  pdf_color_secundario: '#4FC3D7',
  pdf_color_acento: '#43D5D0',
  pdf_color_texto: '#061452',
  pdf_color_fondo_pagina: '#F8F8F5',
  pdf_color_fondo_card: '#FFFFFF',
  pdf_frase_inicio: 'A enerxía,',
  pdf_frase_destacada: 'nas túas mans',
  pdf_frase_final: 'sen tocar o teu tellado.',
}

const CAMPOS_OBLIGATORIOS = ['nombre', 'cif', 'direccion', 'municipio', 'codigo_postal', 'email']
const HEX_COLOR_RE = /^#[0-9A-F]{6}$/i
const BRAND_COLOR_FIELDS = [
  ['pdf_color_primario', 'Color primario (hex)'],
  ['pdf_color_secundario', 'Color secundario (hex)'],
  ['pdf_color_acento', 'Color acento (hex)'],
  ['pdf_color_texto', 'Color texto (hex)'],
  ['pdf_color_fondo_pagina', 'Fondo de página (hex)'],
  ['pdf_color_fondo_card', 'Fondo de cards (hex)'],
]
const LOGO_BUCKET_DEFAULT = 'empresa-logos'

function safeHex(value, fallback) {
  return HEX_COLOR_RE.test((value || '').trim()) ? value.trim().toUpperCase() : fallback
}

function ProposalPdfBrandPreview({ form, logoPreviewUrl }) {
  const primary = safeHex(form.pdf_color_primario, EMPTY_FORM.pdf_color_primario)
  const secondary = safeHex(form.pdf_color_secundario, EMPTY_FORM.pdf_color_secundario)
  const accent = safeHex(form.pdf_color_acento, EMPTY_FORM.pdf_color_acento)
  const text = safeHex(form.pdf_color_texto, EMPTY_FORM.pdf_color_texto)
  const pageBg = safeHex(form.pdf_color_fondo_pagina, EMPTY_FORM.pdf_color_fondo_pagina)
  const cardBg = safeHex(form.pdf_color_fondo_card, EMPTY_FORM.pdf_color_fondo_card)

  const previewStyle = {
    '--preview-primary': primary,
    '--preview-secondary': secondary,
    '--preview-accent': accent,
    '--preview-text': text,
    '--preview-page-bg': pageBg,
    '--preview-card-bg': cardBg,
    '--preview-gradient': `linear-gradient(135deg, ${accent} 0%, ${secondary} 100%)`,
  }

  return (
    <div className="proposal-pdf-preview-panel" style={previewStyle}>
      <div className="proposal-pdf-preview-toolbar">
        <div>
          <div className="card-title">Preview PDF cliente</div>
          <div className="page-sub">Aspecto aproximado tras subir factura en la calculadora</div>
        </div>
      </div>

      <div className="proposal-pdf-preview-canvas">
        <div className="proposal-pdf-preview-page">
          <div className="proposal-pdf-preview-header">
            <div className="proposal-pdf-preview-brand">
              {logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt="Logo de empresa" />
              ) : (
                <span className="proposal-pdf-preview-dot" />
              )}
              <span>{form.nombre || 'Comunitat Energia del Prat'}</span>
            </div>
            <span className="proposal-pdf-preview-kicker">Proposta · Participación</span>
          </div>

          <div className="proposal-pdf-preview-client-card">
            <div>
              <span className="proposal-pdf-preview-eyebrow">Informe personalizado</span>
              <strong>erre errre</strong>
              <p>08820 El Prat de Llobregat · Barcelona</p>
            </div>
            <div className="proposal-pdf-preview-divider" />
            <div>
              <span>Consumo</span>
              <strong>3.500 kWh/año</strong>
            </div>
            <div>
              <span>Tarifa</span>
              <strong>2.0TD · punta-llano</strong>
            </div>
            <div>
              <span>Coste actual</span>
              <strong>893,37 €/año</strong>
            </div>
          </div>

          <div className="proposal-pdf-preview-hero">
            <h3>
              {form.pdf_frase_inicio || 'A enerxía,'}{' '}
              <em>{form.pdf_frase_destacada || 'nas túas mans'}</em>{' '}
              {form.pdf_frase_final || 'sen tocar o teu tellado.'}
            </h3>
            <p>Participa na planta solar comunitaria da túa zona.</p>
          </div>

          <div className="proposal-pdf-preview-section-title">
            <span>El dato que cambia todo</span>
            <strong>Tu precio de la luz, <em>ata un 88% máis barato</em></strong>
          </div>

          <div className="proposal-pdf-preview-comparison">
            <div className="proposal-pdf-preview-price-old">
              <small>Hoxe · sen participación</small>
              <strong>0,229</strong>
              <span>€/kWh</span>
            </div>
            <div className="proposal-pdf-preview-option">
              <span>Con cota mensual</span>
              <div className="proposal-pdf-preview-ring">
                <strong>0,056</strong>
                <small>€/kWh</small>
              </div>
              <ul>
                <li>Ahorro mensual · <strong>39,71 €</strong></li>
                <li>Ahorro anual · <strong>476,49 €</strong></li>
              </ul>
            </div>
          </div>

          <div className="proposal-pdf-preview-option second">
            <span>Con pagamento único</span>
            <div className="proposal-pdf-preview-ring">
              <strong>0,027</strong>
              <small>€/kWh</small>
            </div>
            <ul>
              <li>Ahorro mensual · <strong>50,49 €</strong></li>
              <li>Ahorro anual · <strong>605,85 €</strong></li>
            </ul>
          </div>
        </div>

        <div className="proposal-pdf-preview-page second-page">
          <div className="proposal-pdf-preview-header">
            <div className="proposal-pdf-preview-brand">
              {logoPreviewUrl ? (
                <img src={logoPreviewUrl} alt="Logo de empresa" />
              ) : (
                <span className="proposal-pdf-preview-dot" />
              )}
              <span>{form.nombre || 'Comunitat Energia del Prat'}</span>
            </div>
            <span className="proposal-pdf-preview-kicker">Páxina 2 · Modalidades</span>
          </div>

          <div className="proposal-pdf-preview-p2-title">
            <span>Elixe a túa opción</span>
            <strong>Dúas formas de participar na mesma planta solar</strong>
          </div>

          <div className="proposal-pdf-preview-mode-grid">
            <div className="proposal-pdf-preview-mode-card">
              <span>Con cota mensual</span>
              <strong>Servicio</strong>
              <p>Sen investimento inicial, cunha cota mensual estable e aforro dende o primeiro mes.</p>
              <div className="proposal-pdf-preview-mode-price">10,78 €/mes</div>
            </div>
            <div className="proposal-pdf-preview-mode-card recommended">
              <span>Con pagamento único</span>
              <strong>Participación</strong>
              <p>Pagas unha vez, reduces máis o prezo do kWh e maximizas o aforro a longo prazo.</p>
              <div className="proposal-pdf-preview-mode-price">605,85 €/año</div>
            </div>
          </div>

          <div className="proposal-pdf-preview-chart-card">
            <div>
              <span>Precio estable</span>
              <strong>25 años de energía solar compartida</strong>
            </div>
            <div className="proposal-pdf-preview-lines">
              <i />
              <i />
              <i />
            </div>
          </div>

          <div className="proposal-pdf-preview-impact-grid">
            <div>
              <strong>4,6 t</strong>
              <span>CO₂ evitado</span>
            </div>
            <div>
              <strong>213</strong>
              <span>árboles equivalentes</span>
            </div>
            <div>
              <strong>100%</strong>
              <span>energía local</span>
            </div>
          </div>

          <div className="proposal-pdf-preview-cta">
            <div>
              <span>Siguiente paso</span>
              <strong>¿Reservamos tu participación?</strong>
              <p>{form.email || 'hola@solarcomun.coop'}</p>
            </div>
            <button type="button">Reservar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Configuracion() {
  // 'list' | 'edit' (con empresa_id) | 'new'
  const [vista, setVista] = useState('list')
  const [empresas, setEmpresas] = useState([])
  const [loading, setLoading] = useState(true)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [errores, setErrores] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [esAdmin, setEsAdmin] = useState(false)
  const [puedeGestionarEmpresas, setPuedeGestionarEmpresas] = useState(false)
  const [adminEmpresaIds, setAdminEmpresaIds] = useState([])
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreviewUrl, setLogoPreviewUrl] = useState('')

  useEffect(() => {
    cargarEmpresas()
    comprobarAdmin()
  }, [])

  useEffect(() => {
    let revokeUrl = ''
    let cancelled = false

    async function cargarPreviewLogo() {
      setLogoPreviewUrl('')
      if (logoFile) {
        const objectUrl = URL.createObjectURL(logoFile)
        revokeUrl = objectUrl
        setLogoPreviewUrl(objectUrl)
        return
      }
      if (!form.logo_path) return

      const bucket = form.logo_bucket || LOGO_BUCKET_DEFAULT
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(form.logo_path, 60 * 60)
      if (!cancelled) setLogoPreviewUrl(data?.signedUrl || '')
    }

    cargarPreviewLogo()

    return () => {
      cancelled = true
      if (revokeUrl) URL.revokeObjectURL(revokeUrl)
    }
  }, [logoFile, form.logo_bucket, form.logo_path])

  async function cargarEmpresas() {
    setLoading(true)
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .eq('active', true)
      .order('nombre')
    if (error) {
      alert(mapSupabaseError(error, { entidad: 'empresa' }))
    }
    setEmpresas(data || [])
    setLoading(false)
  }

  async function comprobarAdmin() {
    // ¿Es admin en alguna empresa? Necesario para mostrar el botón "+ Nueva"
    // y permitir editar solo las empresas donde tiene rol admin.
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_empresas')
      .select('empresa_id, role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
    const ids = (data || []).map(row => row.empresa_id).filter(Boolean)
    const adminGlobal = ids.length > 0 || isConfiguredStudyAdminEmail(user.email)
    setAdminEmpresaIds(ids)
    setEsAdmin(adminGlobal)
    setPuedeGestionarEmpresas(adminGlobal)
  }

  function abrirNueva() {
    setForm(EMPTY_FORM)
    setLogoFile(null)
    setLogoPreviewUrl('')
    setEditandoId(null)
    setErrores({})
    setGuardado(false)
    setVista('new')
  }

  function abrirEditar(empresa) {
    if (!puedeGestionarEmpresas && !adminEmpresaIds.includes(empresa.id)) return
    setForm({
      nombre: empresa.nombre || '',
      cif: empresa.cif || '',
      direccion: empresa.direccion || '',
      municipio: empresa.municipio || '',
      codigo_postal: empresa.codigo_postal || '',
      provincia: empresa.provincia || '',
      telefono: empresa.telefono || '',
      email: empresa.email || '',
      representante_legal: empresa.representante_legal || '',
      creditor_id_sepa: empresa.creditor_id_sepa || '',
      logo_bucket: empresa.logo_bucket || LOGO_BUCKET_DEFAULT,
      logo_path: empresa.logo_path || '',
      logo_mime_type: empresa.logo_mime_type || '',
      pdf_color_primario: empresa.pdf_color_primario || EMPTY_FORM.pdf_color_primario,
      pdf_color_secundario: empresa.pdf_color_secundario || EMPTY_FORM.pdf_color_secundario,
      pdf_color_acento: empresa.pdf_color_acento || EMPTY_FORM.pdf_color_acento,
      pdf_color_texto: empresa.pdf_color_texto || EMPTY_FORM.pdf_color_texto,
      pdf_color_fondo_pagina: empresa.pdf_color_fondo_pagina || EMPTY_FORM.pdf_color_fondo_pagina,
      pdf_color_fondo_card: empresa.pdf_color_fondo_card || EMPTY_FORM.pdf_color_fondo_card,
      pdf_frase_inicio: empresa.pdf_frase_inicio || EMPTY_FORM.pdf_frase_inicio,
      pdf_frase_destacada: empresa.pdf_frase_destacada || EMPTY_FORM.pdf_frase_destacada,
      pdf_frase_final: empresa.pdf_frase_final || EMPTY_FORM.pdf_frase_final,
    })
    setLogoFile(null)
    setEditandoId(empresa.id)
    setErrores({})
    setGuardado(false)
    setVista('edit')
  }

  function volver() {
    setVista('list')
    setForm(EMPTY_FORM)
    setLogoFile(null)
    setLogoPreviewUrl('')
    setEditandoId(null)
    setErrores({})
  }

  function handleChange(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
    if (errores[campo]) setErrores(prev => ({ ...prev, [campo]: null }))
    setGuardado(false)
  }

  function handleColorChange(campo, valor) {
    handleChange(campo, valor.trim().toUpperCase())
  }

  function handleLogoChange(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrores(prev => ({ ...prev, logo: 'Selecciona una imagen' }))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrores(prev => ({ ...prev, logo: 'Máximo 2 MB' }))
      return
    }
    setLogoFile(file)
    setErrores(prev => ({ ...prev, logo: null }))
    setGuardado(false)
  }

  function quitarLogo() {
    setLogoFile(null)
    setLogoPreviewUrl('')
    setForm(prev => ({
      ...prev,
      logo_bucket: LOGO_BUCKET_DEFAULT,
      logo_path: '',
      logo_mime_type: '',
    }))
    setGuardado(false)
  }

  async function subirLogo(empresaId) {
    if (!logoFile) return null
    const extension = (logoFile.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '')
    const safeExtension = extension || 'png'
    const path = `${empresaId}/logo-${Date.now()}.${safeExtension}`
    const bucket = form.logo_bucket || LOGO_BUCKET_DEFAULT

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, logoFile, {
        contentType: logoFile.type || 'image/png',
        upsert: true,
      })
    if (error) throw error

    return {
      logo_bucket: bucket,
      logo_path: path,
      logo_mime_type: logoFile.type || 'image/png',
      logo_updated_at: new Date().toISOString(),
    }
  }

  function buildPayload(extra = {}) {
    return {
      nombre: form.nombre.trim(),
      cif: form.cif.trim().toUpperCase(),
      direccion: form.direccion.trim(),
      municipio: form.municipio.trim(),
      codigo_postal: form.codigo_postal.trim(),
      provincia: form.provincia.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim().toLowerCase(),
      representante_legal: form.representante_legal.trim(),
      creditor_id_sepa: form.creditor_id_sepa.trim().toUpperCase(),
      logo_bucket: form.logo_bucket || LOGO_BUCKET_DEFAULT,
      logo_path: form.logo_path || null,
      logo_mime_type: form.logo_mime_type || null,
      pdf_color_primario: form.pdf_color_primario.trim().toUpperCase(),
      pdf_color_secundario: form.pdf_color_secundario.trim().toUpperCase(),
      pdf_color_acento: form.pdf_color_acento.trim().toUpperCase(),
      pdf_color_texto: form.pdf_color_texto.trim().toUpperCase(),
      pdf_color_fondo_pagina: form.pdf_color_fondo_pagina.trim().toUpperCase(),
      pdf_color_fondo_card: form.pdf_color_fondo_card.trim().toUpperCase(),
      pdf_frase_inicio: form.pdf_frase_inicio.trim(),
      pdf_frase_destacada: form.pdf_frase_destacada.trim(),
      pdf_frase_final: form.pdf_frase_final.trim(),
      ...extra,
    }
  }

  function validar() {
    const e = {}
    for (const campo of CAMPOS_OBLIGATORIOS) {
      if (!form[campo] || !form[campo].trim()) e[campo] = 'Obligatorio'
    }
    if (form.email && form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      e.email = 'Formato de email inválido'
    }
    if (form.codigo_postal && form.codigo_postal.trim() && !/^\d{5}$/.test(form.codigo_postal.trim())) {
      e.codigo_postal = 'Debe tener 5 dígitos'
    }
    for (const [campo] of BRAND_COLOR_FIELDS) {
      if (!HEX_COLOR_RE.test((form[campo] || '').trim())) {
        e[campo] = 'Usa formato #RRGGBB'
      }
    }
    setErrores(e)
    return Object.keys(e).length === 0
  }

  async function handleGuardar() {
    if (!validar()) return
    setGuardando(true)
    try {
      if (editandoId) {
        // UPDATE — la RLS exige rol admin de esa empresa
        const logoPayload = await subirLogo(editandoId)
        const payload = buildPayload(logoPayload || {})
        const { error } = await supabase
          .from('empresas')
          .update(payload)
          .eq('id', editandoId)
        if (error) throw error
      } else {
        // INSERT — vía RPC (la tabla no tiene policy de INSERT directa)
        const { data: empresaId, error } = await supabase.rpc('create_empresa_with_memberships', {
          p_nombre: form.nombre.trim(),
          p_cif: form.cif.trim().toUpperCase(),
          p_direccion: form.direccion.trim(),
          p_municipio: form.municipio.trim(),
          p_codigo_postal: form.codigo_postal.trim(),
          p_email: form.email.trim().toLowerCase(),
          p_provincia: form.provincia.trim(),
          p_telefono: form.telefono.trim(),
          p_representante_legal: form.representante_legal.trim(),
          p_creditor_id_sepa: form.creditor_id_sepa.trim().toUpperCase(),
          p_pdf_color_primario: form.pdf_color_primario.trim().toUpperCase(),
          p_pdf_color_secundario: form.pdf_color_secundario.trim().toUpperCase(),
          p_pdf_color_acento: form.pdf_color_acento.trim().toUpperCase(),
          p_pdf_color_texto: form.pdf_color_texto.trim().toUpperCase(),
          p_pdf_color_fondo_pagina: form.pdf_color_fondo_pagina.trim().toUpperCase(),
          p_pdf_color_fondo_card: form.pdf_color_fondo_card.trim().toUpperCase(),
          p_pdf_frase_inicio: form.pdf_frase_inicio.trim(),
          p_pdf_frase_destacada: form.pdf_frase_destacada.trim(),
          p_pdf_frase_final: form.pdf_frase_final.trim(),
        })
        if (error) throw error
        if (logoFile && empresaId) {
          const logoPayload = await subirLogo(empresaId)
          const { error: logoError } = await supabase
            .from('empresas')
            .update(logoPayload)
            .eq('id', empresaId)
          if (logoError) throw logoError
        }
      }
      setGuardado(true)
      await cargarEmpresas()
      setTimeout(() => { setGuardado(false); volver() }, 1200)
    } catch (err) {
      alert(mapSupabaseError(err, { entidad: 'empresa' }))
    } finally {
      setGuardando(false)
    }
  }

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>

  // ----------------------------------------------------------------
  // Vista: LISTA
  // ----------------------------------------------------------------
  if (vista === 'list') {
    return (
      <div style={{ maxWidth: 900 }}>
        <div className="page-header">
          <div>
            <div className="page-title">Empresas</div>
            <div className="page-sub">
              {empresas.length} empresa{empresas.length === 1 ? '' : 's'} · datos legales que aparecen en los documentos generados
            </div>
          </div>
          {esAdmin && (
            <button className="btn btn-primary" onClick={abrirNueva}>
              + Nueva empresa
            </button>
          )}
        </div>

        {empresas.length === 0 ? (
          <div className="empty-state">
            <div className="empty-title">No hay empresas</div>
            <div className="empty-sub">Crea la primera empresa para poder asignar instalaciones</div>
            {esAdmin && (
              <button className="btn btn-primary" onClick={abrirNueva}>+ Nueva empresa</button>
            )}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>CIF</th>
                  <th>Municipio</th>
                  <th>Email</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empresas.map(e => {
                  const puedeEditar = puedeGestionarEmpresas || adminEmpresaIds.includes(e.id)
                  return (
                  <tr key={e.id} className={puedeEditar ? 'clickable' : ''} onClick={() => abrirEditar(e)}>
                    <td><div className="font-bold">{e.nombre}</div></td>
                    <td className="text-mono">{e.cif}</td>
                    <td>{e.municipio || <span className="text-muted">—</span>}</td>
                    <td>{e.email || <span className="text-muted">—</span>}</td>
                    <td onClick={ev => ev.stopPropagation()}>
                      {puedeEditar ? (
                        <button className="btn btn-sm" onClick={() => abrirEditar(e)}>
                          Editar
                        </button>
                      ) : (
                        <span className="text-muted">Solo lectura</span>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}

        <div className="alert alert-info" style={{ marginTop: 16 }}>
          <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 16, height: 16 }}>
            <circle cx="8" cy="8" r="7" /><text x="7.5" y="12" textAnchor="middle" fill="white" fontSize="9">i</text>
          </svg>
          Los datos de cada empresa se usan en los documentos generados de las instalaciones que pertenecen a esa empresa titular.
        </div>
      </div>
    )
  }

  // ----------------------------------------------------------------
  // Vista: FORMULARIO (crear / editar)
  // ----------------------------------------------------------------
  const titulo = editandoId ? 'Editar empresa' : 'Nueva empresa'
  const sub = editandoId
    ? 'Modifica los datos de esta empresa titular'
    : 'Los gestores actuales tendrán acceso automático a esta nueva empresa'

  return (
    <div style={{ maxWidth: 1180 }}>
      <div className="flex-row mb-16" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="breadcrumb">
          <a className="breadcrumb-link" onClick={volver}>Empresas</a>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-current">{editandoId ? form.nombre || 'Editar' : 'Nueva'}</span>
        </div>
        <div className="flex-row gap-8">
          {guardado && <span className="pill pill-green">✓ Guardado</span>}
          <button className="btn" onClick={volver} disabled={guardando}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Crear empresa'}
          </button>
        </div>
      </div>

      <div className="page-header">
        <div>
          <div className="page-title">{titulo}</div>
          <div className="page-sub">{sub}</div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="form-section-title">Datos de la empresa</div>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Razón social / Nombre *</label>
            <input className={`form-input${errores.nombre ? ' error' : ''}`}
              value={form.nombre}
              onChange={e => handleChange('nombre', e.target.value)}
              placeholder="Mi Empresa Energía SL" />
            {errores.nombre && <span className="form-error">{errores.nombre}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">CIF *</label>
            <input className={`form-input text-mono${errores.cif ? ' error' : ''}`}
              value={form.cif}
              onChange={e => handleChange('cif', e.target.value.toUpperCase())}
              placeholder="B12345678" />
            {errores.cif && <span className="form-error">{errores.cif}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Representante legal</label>
            <input className="form-input" value={form.representante_legal}
              onChange={e => handleChange('representante_legal', e.target.value)}
              placeholder="Nombre Apellidos Apellidos" />
          </div>

          <div className="form-group full">
            <label className="form-label">Dirección *</label>
            <input className={`form-input${errores.direccion ? ' error' : ''}`}
              value={form.direccion}
              onChange={e => handleChange('direccion', e.target.value)}
              placeholder="C/ Ejemplo, 1, Planta 2" />
            {errores.direccion && <span className="form-error">{errores.direccion}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Municipio *</label>
            <input className={`form-input${errores.municipio ? ' error' : ''}`}
              value={form.municipio}
              onChange={e => handleChange('municipio', e.target.value)}
              placeholder="Madrid" />
            {errores.municipio && <span className="form-error">{errores.municipio}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Código postal *</label>
            <input className={`form-input${errores.codigo_postal ? ' error' : ''}`}
              value={form.codigo_postal}
              onChange={e => handleChange('codigo_postal', e.target.value)}
              placeholder="28001" maxLength={5} />
            {errores.codigo_postal && <span className="form-error">{errores.codigo_postal}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Provincia</label>
            <input className="form-input" value={form.provincia}
              onChange={e => handleChange('provincia', e.target.value)}
              placeholder="Madrid" />
          </div>

          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input className="form-input" value={form.telefono}
              onChange={e => handleChange('telefono', e.target.value)}
              placeholder="900 000 000" />
          </div>

          <div className="form-group">
            <label className="form-label">Email *</label>
            <input className={`form-input${errores.email ? ' error' : ''}`} type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="info@empresa.com" />
            {errores.email && <span className="form-error">{errores.email}</span>}
          </div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="form-section-title">Marca para documentos</div>
        <div className="brand-document-layout">
          <div>
            <div className="brand-settings-grid">
              <div className="brand-logo-panel">
                <label className="form-label">Logo de la empresa</label>
                <label className="brand-logo-upload">
                  {logoPreviewUrl ? (
                    <img src={logoPreviewUrl} alt="Logo de empresa" />
                  ) : (
                    <span>Seleccionar logo</span>
                  )}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={e => {
                      handleLogoChange(e.target.files?.[0])
                      e.target.value = ''
                    }}
                  />
                </label>
                <div className="brand-logo-actions">
                  <span className="form-hint">PNG, JPG, WEBP o SVG · máximo 2 MB</span>
                  {(logoPreviewUrl || form.logo_path) && (
                    <button type="button" className="btn btn-sm" onClick={quitarLogo}>
                      Quitar
                    </button>
                  )}
                </div>
                {errores.logo && <span className="form-error">{errores.logo}</span>}
              </div>

              <div className="brand-color-panel">
                {BRAND_COLOR_FIELDS.map(([campo, label]) => (
                  <div className="form-group" key={campo}>
                    <label className="form-label">{label}</label>
                    <div className="color-input-row">
                      <input
                        className="color-swatch-input"
                        type="color"
                        value={HEX_COLOR_RE.test(form[campo]) ? form[campo] : '#000000'}
                        onChange={e => handleColorChange(campo, e.target.value)}
                        aria-label={label}
                      />
                      <input
                        className={`form-input text-mono${errores[campo] ? ' error' : ''}`}
                        value={form[campo]}
                        maxLength={7}
                        onChange={e => handleColorChange(campo, e.target.value)}
                        placeholder="#061452"
                      />
                    </div>
                    {errores[campo] && <span className="form-error">{errores[campo]}</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="form-grid brand-phrase-grid">
              <div className="form-group">
                <label className="form-label">Frase inicio</label>
                <input
                  className="form-input"
                  value={form.pdf_frase_inicio}
                  onChange={e => handleChange('pdf_frase_inicio', e.target.value)}
                  placeholder="A enerxía,"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Frase destacada</label>
                <input
                  className="form-input"
                  value={form.pdf_frase_destacada}
                  onChange={e => handleChange('pdf_frase_destacada', e.target.value)}
                  placeholder="nas túas mans"
                />
              </div>
              <div className="form-group full">
                <label className="form-label">Frase final</label>
                <input
                  className="form-input"
                  value={form.pdf_frase_final}
                  onChange={e => handleChange('pdf_frase_final', e.target.value)}
                  placeholder="sen tocar o teu tellado."
                />
              </div>
            </div>
          </div>

          <ProposalPdfBrandPreview form={form} logoPreviewUrl={logoPreviewUrl} />
        </div>
      </div>

      <div className="card">
        <div className="form-section-title">Datos SEPA</div>
        <div className="form-group">
          <label className="form-label">Identificador de acreedor SEPA (Creditor ID)</label>
          <input className="form-input text-mono" value={form.creditor_id_sepa}
            onChange={e => handleChange('creditor_id_sepa', e.target.value.toUpperCase())}
            placeholder="ES12ZZZ00000000" />
          <span className="form-hint">
            Formato: ES + 2 dígitos + ZZZ + 11 caracteres alfanuméricos.
            Lo obtienes en tu banco al registrarte como acreedor SEPA.
          </span>
        </div>
      </div>
    </div>
  )
}
