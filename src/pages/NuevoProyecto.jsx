import { useState, useEffect } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase.js'
import { validarIBAN, formatearIBAN } from '../utils/validaciones.js'

const ORIENTACIONES = [
  { value: 'sur', label: 'Sur' },
  { value: 'sureste', label: 'Sureste' },
  { value: 'suroeste', label: 'Suroeste' },
  { value: 'este', label: 'Este' },
  { value: 'oeste', label: 'Oeste' },
]

function InputUnidad({ value, onChange, unidad, error, calculated, ...props }) {
  return (
    <div style={{ display: 'flex' }}>
      <input
        className={`form-input${error ? ' error' : ''}`}
        style={{
          borderRadius: '8px 0 0 8px',
          borderRight: 'none',
          flex: 1,
          ...(calculated ? {
            background: 'var(--surface-alt)',
            color: 'var(--text-secondary)',
            cursor: 'not-allowed',
            fontWeight: 600,
          } : {})
        }}
        value={value}
        onChange={calculated ? undefined : (e => onChange(e.target.value))}
        readOnly={calculated}
        tabIndex={calculated ? -1 : undefined}
        {...props}
      />
      <span style={{
        display: 'flex', alignItems: 'center', padding: '0 10px',
        background: 'var(--surface-alt)', border: '1px solid var(--border-medium)',
        borderLeft: 'none', borderRadius: '0 8px 8px 0',
        fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0
      }}>{unidad}</span>
    </div>
  )
}

function SubTitulo({ children, style }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 700,
      color: 'var(--primary-dark, #000054)',
      textTransform: 'uppercase', letterSpacing: '0.05em',
      marginTop: 20, marginBottom: 12,
      paddingBottom: 6,
      borderBottom: '2px solid var(--primary, #54D9C7)',
      ...style,
    }}>
      {children}
    </div>
  )
}

export default function NuevoProyecto() {
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const esEdicion = Boolean(id)
  // Modo vista: URL termina en /datos → formulario bloqueado para solo lectura
  const soloLectura = Boolean(id) && location.pathname.endsWith('/datos')
  const [distribuidoras, setDistribuidoras] = useState([])
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [errores, setErrores] = useState({})
  const [form, setForm] = useState({
    nombre_instalacion: '', direccion: '', lat: '', lng: '',
    horas_efectivas: '', potencia_instalada_kwp: '', potencia_nominal_kw: '',
    inclinacion: '', orientacion: 'sur', almacenamiento_kwh: '0',
    coste_anual_mantenimiento_por_kwp: '', coste_kwh_inversion: '', coste_kwh_servicio: '',
    iban_aportaciones: '',
    reserva: 'segun_potencia', reserva_fija_eur: '',
    porcentaje_autoconsumo: '100', modalidad: 'Ambas', contractable_kwp_total: '',
    potencia_minima_kwp: '',
    calculo_estudios: 'segun_factura', potencia_fija_kwp: '',
    cups_generador: '', distribuidora_id: '', tipo_reparto: 'fijo',
    fecha_activacion: '', fecha_activacion_real: '', active: true,
  })

  useEffect(() => {
    supabase.from('distribuidoras').select('*').order('nombre').then(({ data, error }) => {
      if (error) console.error('distribuidoras:', error)
      setDistribuidoras(data || [])
    })
    if (esEdicion) cargarInstalacion()
  }, [id])

  async function cargarInstalacion() {
    setLoading(true)
    const { data } = await supabase.from('installations').select('*').eq('id', id).single()
    if (data) setForm(prev => ({
      ...prev, ...data,
      fecha_activacion: data.fecha_activacion || '',
      fecha_activacion_real: data.fecha_activacion_real || '',
      distribuidora_id: data.distribuidora_id || '',
      cups_generador: data.cups_generador || '',
      tipo_reparto: data.tipo_reparto || 'fijo',
      orientacion: data.orientacion || 'sur',
      potencia_nominal_kw: data.potencia_nominal_kw ?? '',
      inclinacion: data.inclinacion ?? '',
      potencia_minima_kwp: data.potencia_minima_kwp ?? '',
      iban_aportaciones: data.iban_aportaciones || '',
      reserva: data.reserva || 'segun_potencia',
      reserva_fija_eur: data.reserva_fija_eur ?? '',
      calculo_estudios: data.calculo_estudios || 'segun_factura',
      potencia_fija_kwp: data.potencia_fija_kwp ?? '',
    }))
    setLoading(false)
  }

  function set(campo, valor) {
    setForm(prev => ({ ...prev, [campo]: valor }))
    if (errores[campo]) setErrores(prev => ({ ...prev, [campo]: null }))
  }

  function validar() {
    const e = {}
    if (!form.nombre_instalacion.trim()) e.nombre_instalacion = 'Obligatorio'
    if (!form.direccion.trim()) e.direccion = 'Obligatorio'
    if (!form.potencia_instalada_kwp || isNaN(form.potencia_instalada_kwp)) e.potencia_instalada_kwp = 'Valor inválido'
    if (!form.contractable_kwp_total || isNaN(form.contractable_kwp_total)) e.contractable_kwp_total = 'Valor inválido'
    if (!form.modalidad) e.modalidad = 'Obligatorio'
    if (form.inclinacion !== '' && (isNaN(form.inclinacion) || form.inclinacion < 0 || form.inclinacion > 90))
      e.inclinacion = 'Entre 0° y 90°'
    if (form.iban_aportaciones.trim() && !validarIBAN(form.iban_aportaciones))
      e.iban_aportaciones = 'IBAN español inválido (formato ES + 22 dígitos con dígito de control correcto)'
    setErrores(e)
    return Object.keys(e).length === 0
  }

  async function guardar() {
    if (!validar()) return
    setGuardando(true)
    try {
      const num = v => (v !== '' && v !== null ? parseFloat(v) : null)
      const payload = {
        nombre_instalacion: form.nombre_instalacion.trim(),
        direccion: form.direccion.trim(),
        lat: num(form.lat) ?? 0,
        lng: num(form.lng) ?? 0,
        horas_efectivas: num(form.horas_efectivas) ?? 0,
        potencia_instalada_kwp: parseFloat(form.potencia_instalada_kwp),
        potencia_nominal_kw: num(form.potencia_nominal_kw),
        inclinacion: num(form.inclinacion),
        orientacion: form.orientacion || null,
        almacenamiento_kwh: num(form.almacenamiento_kwh) ?? 0,
        coste_anual_mantenimiento_por_kwp: num(form.coste_anual_mantenimiento_por_kwp) ?? 0,
        coste_kwh_inversion: num(form.coste_kwh_inversion) ?? 0,
        coste_kwh_servicio: num(form.coste_kwh_servicio) ?? 0,
        porcentaje_autoconsumo: num(form.porcentaje_autoconsumo) ?? 100,
        modalidad: form.modalidad,
        potencia_minima_kwp: num(form.potencia_minima_kwp),
        iban_aportaciones: (form.iban_aportaciones || '').trim().toUpperCase().replace(/\s/g, '') || null,
        reserva: form.reserva,
        reserva_fija_eur: form.reserva === 'fijo' ? num(form.reserva_fija_eur) : null,
        calculo_estudios: form.calculo_estudios,
        potencia_fija_kwp: form.calculo_estudios === 'fijo' ? num(form.potencia_fija_kwp) : null,
        contractable_kwp_total: parseFloat(form.contractable_kwp_total),
        cups_generador: form.cups_generador?.trim() || null,
        distribuidora_id: form.distribuidora_id || null,
        tipo_reparto: form.tipo_reparto,
        fecha_activacion: form.fecha_activacion || null,
        fecha_activacion_real: form.fecha_activacion_real || null,
        active: true,
      }
      if (esEdicion) {
        const { data: updated, error } = await supabase
          .from('installations')
          .update(payload)
          .eq('id', id)
          .select()
          .single()
        if (error) throw new Error(error.message)
        if (!updated) throw new Error('No se encontró la instalación o no tienes permisos para editarla.')
        navigate(`/proyectos/${id}`)
      } else {
        const { data, error } = await supabase
          .from('installations')
          .insert(payload)
          .select()
          .single()
        if (error) throw new Error(error.message)
        if (data) navigate(`/proyectos/${data.id}`)
      }
    } catch (err) {
      alert('Error al guardar: ' + err.message)
    } finally {
      setGuardando(false)
    }
  }

  // --- Campos calculados de Costes ---
  const toNum = v => {
    const n = parseFloat(v)
    return isNaN(n) ? 0 : n
  }
  const horas         = toNum(form.horas_efectivas)
  const precioEnergia = toNum(form.coste_kwh_inversion)
  const mantenimiento = toNum(form.coste_anual_mantenimiento_por_kwp)

  // Inversión
  const precioPotenciaInversion = horas * 25 * precioEnergia
  const lcoeInversion = horas > 0 ? precioEnergia + (mantenimiento / horas) : 0

  const fmt = (n, decimales = 2) => {
    if (!n || !isFinite(n)) return ''
    return Number(n).toFixed(decimales)
  }

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>

  const tituloBreadcrumb = soloLectura ? 'Datos' : esEdicion ? 'Editar' : 'Nueva instalación'

  return (
    <div style={{ maxWidth: 760 }}>
      <div className="flex-row mb-16" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="breadcrumb">
          <a className="breadcrumb-link" onClick={() => navigate('/proyectos')}>Instalaciones</a>
          <span className="breadcrumb-sep">›</span>
          <span className="breadcrumb-current">{tituloBreadcrumb}</span>
        </div>
        {soloLectura && (
          <button
            className="btn btn-ghost"
            onClick={() => navigate(`/proyectos/${id}/editar`)}
            title="Editar instalación"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            Editar
          </button>
        )}
      </div>

      <fieldset disabled={soloLectura} style={{ border: 'none', padding: 0, margin: 0 }}>

      {/* Datos generales */}
      <div className="card mb-16">
        <div className="form-section-title">Datos generales</div>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Nombre de la instalación *</label>
            <input className={`form-input${errores.nombre_instalacion ? ' error' : ''}`}
              value={form.nombre_instalacion} onChange={e => set('nombre_instalacion', e.target.value)}
              placeholder="Ej: Comunidad Energética Ruzafa Norte" />
            {errores.nombre_instalacion && <span className="form-error">{errores.nombre_instalacion}</span>}
          </div>
          <div className="form-group full">
            <label className="form-label">Dirección *</label>
            <input className={`form-input${errores.direccion ? ' error' : ''}`}
              value={form.direccion} onChange={e => set('direccion', e.target.value)}
              placeholder="C/ Ejemplo, 1, 28001 Madrid" />
            {errores.direccion && <span className="form-error">{errores.direccion}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Latitud</label>
            <input className="form-input" type="number" step="any"
              value={form.lat} onChange={e => set('lat', e.target.value)} placeholder="40.4168" />
          </div>
          <div className="form-group">
            <label className="form-label">Longitud</label>
            <input className="form-input" type="number" step="any"
              value={form.lng} onChange={e => set('lng', e.target.value)} placeholder="-3.7038" />
          </div>
        </div>
      </div>

      {/* Parámetros técnicos */}
      <div className="card mb-16">
        <div className="form-section-title">Parámetros técnicos</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Potencia instalada (pico) *</label>
            <InputUnidad value={form.potencia_instalada_kwp} onChange={v => set('potencia_instalada_kwp', v)}
              unidad="kWp" type="number" step="0.1" placeholder="48.6" error={errores.potencia_instalada_kwp} />
            {errores.potencia_instalada_kwp && <span className="form-error">{errores.potencia_instalada_kwp}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Potencia nominal</label>
            <InputUnidad value={form.potencia_nominal_kw} onChange={v => set('potencia_nominal_kw', v)}
              unidad="kW" type="number" step="0.1" placeholder="43.2" />
            <span className="form-hint">Potencia real de salida del inversor</span>
          </div>

          <div className="form-group">
            <label className="form-label">Almacenamiento</label>
            <InputUnidad value={form.almacenamiento_kwh} onChange={v => set('almacenamiento_kwh', v)}
              unidad="kWh" type="number" step="0.1" placeholder="0" />
          </div>

          <div className="form-group">
            <label className="form-label">% Autoconsumo</label>
            <InputUnidad value={form.porcentaje_autoconsumo} onChange={v => set('porcentaje_autoconsumo', v)}
              unidad="%" type="number" min="0" max="100" placeholder="100" />
          </div>

          <div className="form-group">
            <label className="form-label">Inclinación</label>
            <InputUnidad value={form.inclinacion} onChange={v => set('inclinacion', v)}
              unidad="°" type="number" step="1" min="0" max="90" placeholder="30"
              error={errores.inclinacion} />
            {errores.inclinacion
              ? <span className="form-error">{errores.inclinacion}</span>
              : <span className="form-hint">Ángulo respecto a la horizontal (0°–90°)</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Orientación</label>
            <select className="form-select" value={form.orientacion} onChange={e => set('orientacion', e.target.value)}>
              {ORIENTACIONES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">kWp total contratables *</label>
            <InputUnidad value={form.contractable_kwp_total} onChange={v => set('contractable_kwp_total', v)}
              unidad="kWp" type="number" step="0.1" placeholder="48.6" error={errores.contractable_kwp_total} />
            {errores.contractable_kwp_total && <span className="form-error">{errores.contractable_kwp_total}</span>}
          </div>

          <div className="form-group">
            <label className="form-label">Potencia mínima a asignar</label>
            <InputUnidad value={form.potencia_minima_kwp} onChange={v => set('potencia_minima_kwp', v)}
              unidad="kWp" type="number" step="0.1" placeholder="1.0" />
          </div>

          <div className="form-group">
            <label className="form-label">Cálculo estudios</label>
            <select className="form-select" value={form.calculo_estudios} onChange={e => set('calculo_estudios', e.target.value)}>
              <option value="segun_factura">Según factura</option>
              <option value="fijo">Fijo</option>
            </select>
            <span className="form-hint">Base para calcular la potencia recomendada</span>
          </div>

          {form.calculo_estudios === 'fijo' && (
            <div className="form-group">
              <label className="form-label">Potencia recomendada fija</label>
              <InputUnidad value={form.potencia_fija_kwp} onChange={v => set('potencia_fija_kwp', v)}
                unidad="kWp" type="number" step="0.01" placeholder="3.45" />
              <span className="form-hint">Potencia fija usada en los estudios</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Horas efectivas anuales</label>
            <InputUnidad value={form.horas_efectivas} onChange={v => set('horas_efectivas', v)}
              unidad="h/año" type="number" placeholder="1200" />
          </div>

        </div>
      </div>

      {/* Costes */}
      <div className="card mb-16">
        <div className="form-section-title">Costes</div>

        {/* Modalidad — apartado principal */}
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">Modalidad *</label>
            <select
              className={`form-select${errores.modalidad ? ' error' : ''}`}
              value={form.modalidad}
              onChange={e => set('modalidad', e.target.value)}
              style={{ maxWidth: 320 }}
            >
              <option value="Ambas">Ambas</option>
              <option value="Inversion">Inversión</option>
              <option value="Servicio">Servicio</option>
            </select>
            {errores.modalidad && <span className="form-error">{errores.modalidad}</span>}
          </div>
        </div>

        {/* Apartado 1 · Inversión */}
        <SubTitulo>Inversión</SubTitulo>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Precio energía</label>
            <InputUnidad
              value={form.coste_kwh_inversion}
              onChange={v => set('coste_kwh_inversion', v)}
              unidad="€/kWh" type="number" step="0.001" placeholder="0.050"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Precio potencia</label>
            <InputUnidad
              value={fmt(precioPotenciaInversion, 2)}
              unidad="€/kWp"
              calculated
            />
            <span className="form-hint">Calculado: horas efectivas × 25 × precio energía</span>
          </div>
          <div className="form-group">
            <label className="form-label">Mantenimiento</label>
            <InputUnidad
              value={form.coste_anual_mantenimiento_por_kwp}
              onChange={v => set('coste_anual_mantenimiento_por_kwp', v)}
              unidad="€/kWp·año" type="number" step="0.01" placeholder="10.00"
            />
          </div>
          <div className="form-group">
            <label className="form-label">LCOE inversión</label>
            <InputUnidad
              value={fmt(lcoeInversion, 4)}
              unidad="€/kWh"
              calculated
            />
            <span className="form-hint">Calculado: precio energía + (mantenimiento ÷ horas efectivas)</span>
          </div>
        </div>

        {/* Apartado 2 · Servicio */}
        <SubTitulo>Servicio</SubTitulo>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">LCOE servicio</label>
            <InputUnidad
              value={form.coste_kwh_servicio}
              onChange={v => set('coste_kwh_servicio', v)}
              unidad="€/kWh" type="number" step="0.001" placeholder="0.020"
            />
          </div>
        </div>

        {/* Apartado 3 · Aportaciones y reserva */}
        <SubTitulo>Aportaciones y reserva</SubTitulo>
        <div className="form-grid">
          <div className="form-group full">
            <label className="form-label">IBAN aportaciones económicas</label>
            <input
              className={`form-input text-mono${errores.iban_aportaciones ? ' error' : ''}`}
              style={{ fontSize: 13, letterSpacing: '0.05em' }}
              value={form.iban_aportaciones}
              onChange={e => {
                const raw = e.target.value.toUpperCase().replace(/\s/g, '')
                set('iban_aportaciones', raw)
              }}
              onBlur={e => {
                const raw = e.target.value.trim().toUpperCase().replace(/\s/g, '')
                if (raw) set('iban_aportaciones', formatearIBAN(raw))
              }}
              placeholder="ES91 2100 0418 4502 0005 1332"
              maxLength={29}
            />
            {errores.iban_aportaciones
              ? <span className="form-error">{errores.iban_aportaciones}</span>
              : <span className="form-hint">IBAN español — se formatea automáticamente con espacios al salir del campo</span>
            }
          </div>
          <div className="form-group">
            <label className="form-label">Reserva</label>
            <select className="form-select" value={form.reserva} onChange={e => set('reserva', e.target.value)}>
              <option value="segun_potencia">Según potencia</option>
              <option value="fijo">Fijo</option>
            </select>
          </div>
          {form.reserva === 'fijo' && (
            <div className="form-group">
              <label className="form-label">Importe de reserva fijo</label>
              <InputUnidad value={form.reserva_fija_eur} onChange={v => set('reserva_fija_eur', v)}
                unidad="€" type="number" step="0.01" placeholder="150.00" />
            </div>
          )}
        </div>
      </div>

      {/* Activación */}
      <div className="card mb-16">
        <div className="form-section-title">Datos de activación</div>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">CAU generación</label>
            <input className="form-input text-mono" style={{ fontSize: 12 }}
              value={form.cups_generador}
              onChange={e => set('cups_generador', e.target.value.toUpperCase())}
              placeholder="ES0021000025045781ZA" maxLength={22} />
            <span className="form-hint">20–22 caracteres. Empieza por ES.</span>
          </div>
          <div className="form-group">
            <label className="form-label">Distribuidora</label>
            <select className="form-select" value={form.distribuidora_id} onChange={e => set('distribuidora_id', e.target.value)}>
              <option value="">Seleccionar distribuidora</option>
              {distribuidoras.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo de reparto</label>
            <select className="form-select" value={form.tipo_reparto} onChange={e => set('tipo_reparto', e.target.value)}>
              <option value="fijo">Fijo</option>
              <option value="dinamico">Dinámico horario</option>
            </select>
          </div>
          <div></div>
          <div className="form-group">
            <label className="form-label">Fecha de activación prevista</label>
            <input className="form-input" type="date"
              value={form.fecha_activacion} onChange={e => set('fecha_activacion', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha de activación real</label>
            <input className="form-input" type="date"
              value={form.fecha_activacion_real} onChange={e => set('fecha_activacion_real', e.target.value)} />
            <span className="form-hint">Dejar vacío si aún no está activada</span>
          </div>
        </div>
      </div>

      </fieldset>

      <div className="flex-row" style={{ justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn" onClick={() => navigate(esEdicion ? `/proyectos/${id}` : '/proyectos')}>
          {soloLectura ? 'Volver' : 'Cancelar'}
        </button>
        {!soloLectura && (
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}>
            {guardando ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Crear instalación'}
          </button>
        )}
      </div>
    </div>
  )
}
