import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { mapSupabaseError } from '../lib/errors.js'
import { isConfiguredStudyAdminEmail } from '../lib/studies.js'

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'lectura', label: 'Lectura' },
  { value: 'none', label: 'Sin acceso' },
]

const ROLE_GLOBAL_OPTIONS = [
  { value: 'admin', label: 'Administrador global' },
  { value: 'gestor', label: 'Gestor global' },
  { value: 'lectura', label: 'Lectura global' },
  { value: 'none', label: 'Sin acceso global' },
]

const ROLE_LABELS = {
  admin: 'Administrador',
  gestor: 'Gestor',
  lectura: 'Lectura',
  none: 'Sin acceso',
}

function rolePill(role) {
  if (role === 'mixed') return <span className="pill pill-gray"><span className="pill-dot" />Mixto</span>
  if (role === 'admin') return <span className="pill pill-green"><span className="pill-dot" />Administrador</span>
  if (role === 'gestor') return <span className="pill pill-blue"><span className="pill-dot" />Gestor</span>
  if (role === 'lectura') return <span className="pill pill-amber"><span className="pill-dot" />Lectura</span>
  return <span className="pill pill-gray"><span className="pill-dot" />Sin acceso</span>
}

function getMembershipRole(user, empresaId) {
  const memberships = Array.isArray(user.memberships) ? user.memberships : []
  return memberships.find(item => item.empresa_id === empresaId)?.role || 'none'
}

function getGlobalRole(user, empresas) {
  const scopedEmpresas = empresas.filter(empresa => empresa.active !== false)
  if (scopedEmpresas.length === 0) return 'none'
  const roles = new Set(scopedEmpresas.map(empresa => getMembershipRole(user, empresa.id)))
  return roles.size === 1 ? [...roles][0] : 'mixed'
}

export default function Usuarios() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState('')
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [empresas, setEmpresas] = useState([])
  const [usuarios, setUsuarios] = useState([])
  const [empresaId, setEmpresaId] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    cargarDatos()
  }, [user?.id])

  async function cargarDatos() {
    setLoading(true)
    setError('')

    const namedAdmin = isConfiguredStudyAdminEmail(user?.email)
    const membershipResult = user?.id
      ? await supabase
        .from('user_empresas')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .limit(1)
      : { data: [] }

    const nextIsAdmin = namedAdmin || (membershipResult.data || []).length > 0
    setIsAdmin(nextIsAdmin)

    if (!nextIsAdmin) {
      setLoading(false)
      return
    }

    const [empresasResult, usuariosResult] = await Promise.all([
      supabase.from('empresas').select('id, nombre, active').order('nombre'),
      supabase.rpc('list_sapiens_user_roles'),
    ])

    if (empresasResult.error) {
      setError(mapSupabaseError(empresasResult.error, { entidad: 'empresa' }))
    }
    if (usuariosResult.error) {
      setError(mapSupabaseError(usuariosResult.error, { entidad: 'usuario' }))
    }

    const nextEmpresas = empresasResult.data || []
    setEmpresas(nextEmpresas)
    setUsuarios(usuariosResult.data || [])
    setEmpresaId(prev => prev || nextEmpresas.find(empresa => empresa.active !== false)?.id || nextEmpresas[0]?.id || '')
    setLoading(false)
  }

  async function cambiarRol(targetUser, nextRole) {
    if (!empresaId) return
    const key = `${targetUser.user_id}:${empresaId}`
    setSavingKey(key)
    setError('')

    const { error: rpcError } = await supabase.rpc('set_sapiens_user_role', {
      p_user_id: targetUser.user_id,
      p_empresa_id: empresaId,
      p_role: nextRole,
    })

    if (rpcError) {
      setError(mapSupabaseError(rpcError, { entidad: 'usuario' }))
      setSavingKey('')
      return
    }

    setUsuarios(prev => prev.map(item => {
      if (item.user_id !== targetUser.user_id) return item
      const memberships = Array.isArray(item.memberships) ? item.memberships : []
      const empresa = empresas.find(e => e.id === empresaId)
      const nextMemberships = nextRole === 'none'
        ? memberships.filter(membership => membership.empresa_id !== empresaId)
        : [
          ...memberships.filter(membership => membership.empresa_id !== empresaId),
          { empresa_id: empresaId, empresa_nombre: empresa?.nombre || '', role: nextRole },
        ]
      return { ...item, memberships: nextMemberships }
    }))
    setSavingKey('')
  }

  async function cambiarRolTodas(targetUser, nextRole) {
    const scopedEmpresas = empresas.filter(empresa => empresa.active !== false)
    if (scopedEmpresas.length === 0) return

    const key = `${targetUser.user_id}:all`
    setSavingKey(key)
    setError('')

    const results = await Promise.all(scopedEmpresas.map(empresa =>
      supabase.rpc('set_sapiens_user_role', {
        p_user_id: targetUser.user_id,
        p_empresa_id: empresa.id,
        p_role: nextRole,
      })
    ))

    const failed = results.find(result => result.error)
    if (failed?.error) {
      setError(mapSupabaseError(failed.error, { entidad: 'usuario' }))
      setSavingKey('')
      return
    }

    setUsuarios(prev => prev.map(item => {
      if (item.user_id !== targetUser.user_id) return item
      const memberships = Array.isArray(item.memberships) ? item.memberships : []
      const scopedIds = new Set(scopedEmpresas.map(empresa => empresa.id))
      const untouchedMemberships = memberships.filter(membership => !scopedIds.has(membership.empresa_id))
      const nextMemberships = nextRole === 'none'
        ? untouchedMemberships
        : [
          ...untouchedMemberships,
          ...scopedEmpresas.map(empresa => ({
            empresa_id: empresa.id,
            empresa_nombre: empresa.nombre || '',
            role: nextRole,
          })),
        ]
      return { ...item, memberships: nextMemberships }
    }))
    setSavingKey('')
  }

  const empresaActual = empresas.find(empresa => empresa.id === empresaId) || null

  const filtrados = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return usuarios
    return usuarios.filter(item => String(item.email || '').toLowerCase().includes(text))
  }, [query, usuarios])

  const counts = useMemo(() => {
    return filtrados.reduce((acc, item) => {
      const role = getMembershipRole(item, empresaId)
      acc[role] = (acc[role] || 0) + 1
      return acc
    }, { admin: 0, gestor: 0, lectura: 0, none: 0 })
  }, [empresaId, filtrados])

  if (loading) return <div className="loading"><div className="spinner" />Cargando...</div>

  if (!isAdmin) {
    return (
      <div className="empty-state">
        <div className="empty-title">Solo administradores</div>
        <div className="empty-sub">Este apartado está reservado para gestionar usuarios y permisos.</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 1120 }}>
      <div className="page-header">
        <div>
          <div className="page-title">Usuarios</div>
          <div className="page-sub">Cuentas de Sapiens que ya han iniciado sesión en la aplicación</div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7"/><text x="7.5" y="12" textAnchor="middle" fill="white" fontSize="10">!</text></svg>
          {error}
        </div>
      )}

      <div className="card mb-16">
        <div className="user-admin-toolbar">
          <div className="form-group">
            <label className="form-label">Empresa</label>
            <select className="form-select" value={empresaId} onChange={event => setEmpresaId(event.target.value)}>
              {empresas.map(empresa => (
                <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Buscar usuario</label>
            <input
              className="form-input"
              type="search"
              placeholder="email@sapiensenergia.es"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="study-kpi-grid mb-16">
        <div className="study-kpi-card study-kpi-primary">
          <div className="study-kpi-value">{filtrados.length}</div>
          <div className="study-kpi-label">Usuarios visibles</div>
        </div>
        <div className="study-kpi-card">
          <div className="study-kpi-value">{counts.admin || 0}</div>
          <div className="study-kpi-label">Administradores</div>
        </div>
        <div className="study-kpi-card">
          <div className="study-kpi-value">{counts.gestor || 0}</div>
          <div className="study-kpi-label">Gestores</div>
        </div>
        <div className="study-kpi-card">
          <div className="study-kpi-value">{counts.lectura || 0}</div>
          <div className="study-kpi-label">Solo lectura</div>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Último acceso</th>
              <th>Rol global</th>
              <th>Rol en {empresaActual?.nombre || 'empresa'}</th>
              <th>Cambiar rol</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map(item => {
              const role = getMembershipRole(item, empresaId)
              const globalRole = getGlobalRole(item, empresas)
              const key = `${item.user_id}:${empresaId}`
              const globalKey = `${item.user_id}:all`
              return (
                <tr key={item.user_id}>
                  <td>
                    <div className="font-bold">{item.email}</div>
                    <div className="td-muted text-mono">{item.user_id}</div>
                  </td>
                  <td>
                    <div className="td-muted">
                      {item.last_sign_in_at ? new Date(item.last_sign_in_at).toLocaleString('es-ES') : 'Sin acceso registrado'}
                    </div>
                  </td>
                  <td>{rolePill(globalRole)}</td>
                  <td>{rolePill(role)}</td>
                  <td>
                    <div className="role-edit-stack">
                      <div>
                        <select
                          className="form-select"
                          value={role}
                          disabled={savingKey === key || savingKey === globalKey}
                          onChange={event => cambiarRol(item, event.target.value)}
                        >
                          {ROLE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <div className="td-muted">Solo {empresaActual?.nombre || 'empresa seleccionada'}</div>
                      </div>
                      <div>
                        <select
                          className="form-select"
                          value={globalRole}
                          disabled={savingKey === key || savingKey === globalKey}
                          onChange={event => cambiarRolTodas(item, event.target.value)}
                        >
                          {globalRole === 'mixed' && <option value="mixed">Roles distintos</option>}
                          {ROLE_GLOBAL_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <div className="td-muted">Todas las empresas activas</div>
                      </div>
                    </div>
                    {(savingKey === key || savingKey === globalKey) && <div className="td-muted">Guardando...</div>}
                  </td>
                </tr>
              )
            })}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state" style={{ padding: 24 }}>
                    <div className="empty-title">No hay usuarios</div>
                    <div className="empty-sub">Aparecerán aquí cuando entren con Google usando una cuenta de Sapiens.</div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="alert alert-info" style={{ marginTop: 16 }}>
        <svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="7" /><text x="7.5" y="12" textAnchor="middle" fill="white" fontSize="9">i</text></svg>
        Los usuarios se crean en Auth cuando hacen login. Puedes asignarles rol por empresa o aplicar un rol global a todas las empresas activas: {ROLE_LABELS.admin}, {ROLE_LABELS.gestor} o {ROLE_LABELS.lectura}.
      </div>
    </div>
  )
}
