import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { mapSupabaseError } from '../lib/errors.js'

export default function Configuracion() {
  const [form, setForm] = useState({
    nombre: '',
    cif: '',
    direccion: '',
    municipio: '',
    codigo_postal: '',
    telefono: '',
    email: '',
    representante_legal: '',
    creditor_id_sepa: '',
  })
  const [configId, setConfigId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('empresa_config').select('*').limit(1).single().then(({ data }) => {
      if (data) {
        setConfigId(data.id)
        setForm({
          nombre: data.nombre || '',
          cif: data.cif || '',
          direccion: data.direccion || '',
          municipio: data.municipio || '',
          codigo_postal: data.codigo_postal || '',
          telefono: data.telefono || '',
          email: data.email || '',
          representante_legal: data.representante_legal || '',
          creditor_id_sepa: data.creditor_id_sepa || '',
        })
      }
      setLoading(false)
    })
  }, [])

  function handleChange(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
    setGuardado(false)
  }

  async function handleGuardar() {
    setGuardando(true)
    let error
    if (configId) {
      ;({ error } = await supabase.from('empresa_config').update(form).eq('id', configId))
    } else {
      const { data, error: e } = await supabase.from('empresa_config').insert(form).select().single()
      error = e
      if (data) setConfigId(data.id)
    }
    setGuardando(false)
    if (!error) { setGuardado(true); setTimeout(() => setGuardado(false), 2500) }
    else alert(mapSupabaseError(error, { entidad: 'configuración' }))
  }

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>

  return (
    <div style={{ maxWidth: 620 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Configuración de empresa</div>
          <div className="page-sub">Datos que aparecen en todos los documentos generados</div>
        </div>
        <div className="flex-row gap-8">
          {guardado && <span className="pill pill-green">✓ Guardado</span>}
          <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <div className="card mb-16">
        <div className="form-section-title">Datos de la empresa</div>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Razón social / Nombre de empresa *</label>
            <input className="form-input" value={form.nombre}
              onChange={e => handleChange('nombre', e.target.value)}
              placeholder="Mi Empresa Energía SL" />
          </div>
          <div className="form-group">
            <label className="form-label">CIF *</label>
            <input className="form-input text-mono" value={form.cif}
              onChange={e => handleChange('cif', e.target.value.toUpperCase())}
              placeholder="B12345678" />
          </div>
          <div className="form-group">
            <label className="form-label">Representante legal *</label>
            <input className="form-input" value={form.representante_legal}
              onChange={e => handleChange('representante_legal', e.target.value)}
              placeholder="Nombre Apellidos Apellidos" />
          </div>
          <div className="form-group full">
            <label className="form-label">Dirección completa</label>
            <input className="form-input" value={form.direccion}
              onChange={e => handleChange('direccion', e.target.value)}
              placeholder="C/ Ejemplo, 1, Planta 2" />
          </div>
          <div className="form-group">
            <label className="form-label">Municipio</label>
            <input className="form-input" value={form.municipio}
              onChange={e => handleChange('municipio', e.target.value)}
              placeholder="Madrid" />
          </div>
          <div className="form-group">
            <label className="form-label">Código postal</label>
            <input className="form-input" value={form.codigo_postal}
              onChange={e => handleChange('codigo_postal', e.target.value)}
              placeholder="28001" maxLength={5} />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input className="form-input" value={form.telefono}
              onChange={e => handleChange('telefono', e.target.value)}
              placeholder="900 000 000" />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input className="form-input" type="email" value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="info@empresa.com" />
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

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 16, height: 16 }}>
          <circle cx="8" cy="8" r="7" /><text x="7.5" y="12" textAnchor="middle" fill="white" fontSize="9">i</text>
        </svg>
        Estos datos se usan automáticamente en todos los documentos generados. Cámbialos aquí y todos los futuros documentos se actualizarán.
      </div>
    </div>
  )
}
