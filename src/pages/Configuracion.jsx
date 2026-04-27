import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { mapSupabaseError } from '../lib/errors.js'

// ============================================================
// Configuración → CRUD de empresas
// ============================================================
// Cada empresa que aparece aquí es un "tenant" (empresa titular
// de instalaciones). El usuario solo ve las empresas a las que
// pertenece (RLS). Los admins pueden crear nuevas empresas vía
// la RPC `create_empresa_with_memberships` (migración 018).
//
// Campos obligatorios: nombre, cif, dirección, municipio,
// código postal, email. El resto son opcionales.
// ============================================================

const EMPTY_FORM = {
  nombre: '', cif: '', direccion: '', municipio: '', codigo_postal: '',
  provincia: '', telefono: '', email: '',
  representante_legal: '', creditor_id_sepa: '',
}

const CAMPOS_OBLIGATORIOS = ['nombre', 'cif', 'direccion', 'municipio', 'codigo_postal', 'email']

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

  useEffect(() => {
    cargarEmpresas()
    comprobarAdmin()
  }, [])

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
    // ¿Es admin en alguna empresa? Necesario para mostrar el botón "+ Nueva".
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('user_empresas')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .limit(1)
    setEsAdmin((data || []).length > 0)
  }

  function abrirNueva() {
    setForm(EMPTY_FORM)
    setEditandoId(null)
    setErrores({})
    setGuardado(false)
    setVista('new')
  }

  function abrirEditar(empresa) {
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
    })
    setEditandoId(empresa.id)
    setErrores({})
    setGuardado(false)
    setVista('edit')
  }

  function volver() {
    setVista('list')
    setForm(EMPTY_FORM)
    setEditandoId(null)
    setErrores({})
  }

  function handleChange(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
    if (errores[campo]) setErrores(prev => ({ ...prev, [campo]: null }))
    setGuardado(false)
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
    setErrores(e)
    return Object.keys(e).length === 0
  }

  async function handleGuardar() {
    if (!validar()) return
    setGuardando(true)
    try {
      if (editandoId) {
        // UPDATE — la RLS exige rol admin de esa empresa
        const payload = {
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
        }
        const { error } = await supabase
          .from('empresas')
          .update(payload)
          .eq('id', editandoId)
        if (error) throw error
      } else {
        // INSERT — vía RPC (la tabla no tiene policy de INSERT directa)
        const { error } = await supabase.rpc('create_empresa_with_memberships', {
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
        })
        if (error) throw error
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
                {empresas.map(e => (
                  <tr key={e.id} className="clickable" onClick={() => abrirEditar(e)}>
                    <td><div className="font-bold">{e.nombre}</div></td>
                    <td className="text-mono">{e.cif}</td>
                    <td>{e.municipio || <span className="text-muted">—</span>}</td>
                    <td>{e.email || <span className="text-muted">—</span>}</td>
                    <td onClick={ev => ev.stopPropagation()}>
                      <button className="btn btn-sm" onClick={() => abrirEditar(e)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
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
    <div style={{ maxWidth: 720 }}>
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
