import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { supabaseAuth } from '../lib/supabase.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'
import { isConfiguredStudyAdminEmail } from '../lib/studies.js'

const navItems = [
  {
    section: 'Principal',
    items: [
      { to: '/dashboard',  label: 'Panel principal',   icon: IconGrid },
      { to: '/proyectos',  label: 'Instalaciones',     icon: IconFolder },
      { to: '/mapa', label: 'Mapa instalaciones', icon: IconMap },
      { to: '/proyectos/nuevo', label: 'Nueva instalación', icon: IconPlus },
      { to: '/estudios',   label: 'Estudios',          icon: IconStudy },
    ]
  },
  {
    section: 'Documentación',
    items: [
      { to: '/importar', label: 'Importar partícipes', icon: IconUpload },
      { to: '/documentos', label: 'Generar documentos', icon: IconFile },
      { to: '/plantillas', label: 'Plantillas', icon: IconTemplate },
    ]
  },
  {
    section: 'Sistema',
    items: [
      { to: '/configuracion', label: 'Configuración', icon: IconSettings },
      { to: '/usuarios', label: 'Usuarios', icon: IconUsers, adminOnly: true },
    ]
  }
]

export default function Layout() {
  const location = useLocation()
  const { user } = useAuth()
  const [hasAdminMembership, setHasAdminMembership] = useState(false)
  const userInitial = (user?.email?.[0] || 'U').toUpperCase()
  const isAdmin = isConfiguredStudyAdminEmail(user?.email) || hasAdminMembership

  useEffect(() => {
    let cancelled = false
    setHasAdminMembership(false)
    if (!user?.id) return

    supabase
      .from('user_empresas')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .limit(1)
      .then(({ data, error }) => {
        if (!cancelled && !error) setHasAdminMembership((data || []).length > 0)
      })

    return () => { cancelled = true }
  }, [user?.id])

  const visibleNavItems = useMemo(() => {
    return navItems.map(group => ({
      ...group,
      items: group.items.filter(item => !item.adminOnly || isAdmin),
    }))
  }, [isAdmin])

  const getTitle = () => {
    const path = location.pathname
    if (path === '/dashboard') return 'Panel principal'
    if (path === '/proyectos') return 'Instalaciones'
    if (path === '/mapa') return 'Mapa de instalaciones'
    if (path === '/proyectos/nuevo') return 'Nueva instalación'
    if (path.startsWith('/proyectos/') && path.endsWith('/editar')) return 'Editar instalación'
    if (path.startsWith('/proyectos/') && path.endsWith('/datos')) return 'Datos de la instalación'
    if (path.startsWith('/proyectos/')) return 'Detalle instalación'
    if (path === '/documentos') return 'Generar documentos'
    if (path === '/importar') return 'Importar partícipes'
    if (path === '/plantillas') return 'Gestión de plantillas'
    if (path === '/configuracion') return 'Configuración'
    if (path === '/usuarios') return 'Usuarios'
    if (path === '/estudios') return 'Estudios'
    if (path.startsWith('/estudios/')) return 'Detalle estudio'
    return 'Instalaciones ACC'
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <img src="/sapiens_logo_white.png" alt="Sapiens Energía" />
        </div>

        <nav className="nav">
          {visibleNavItems.map(group => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    'nav-item' + (isActive ? ' active' : '')
                  }
                  end={item.to === '/proyectos/nuevo'}
                >
                  <item.icon />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill" style={{ gap: 8 }}>
            <div className="user-avatar">{userInitial}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.email || 'Usuario'}
              </div>
              <div className="user-role">
                {isAdmin ? (
                  <span className="pill pill-green" style={{ fontSize: 10, padding: '2px 7px' }}>
                    <span className="pill-dot" />Administrador
                  </span>
                ) : 'Gestión interna'}
              </div>
            </div>
            <button
              title="Cerrar sesión"
              onClick={() => supabaseAuth.auth.signOut()}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,.45)', padding: 4, borderRadius: 6,
                display: 'flex', alignItems: 'center', flexShrink: 0,
                transition: 'color .12s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,.45)'}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" width={16} height={16}>
                <path d="M6 2H3a1 1 0 00-1 1v10a1 1 0 001 1h3M10 11l3-3-3-3M13 8H6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <span className="topbar-title">{getTitle()}</span>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function IconGrid() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
}
function IconFolder() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 3a1 1 0 011-1h3.5l1.5 2H13a1 1 0 011 1v7a1 1 0 01-1 1H3a1 1 0 01-1-1V3z"/></svg>
}
function IconMap() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M1.8 4.2l3.8-1.8 4.8 1.8 3.8-1.8v9.4l-3.8 1.8-4.8-1.8-3.8 1.8V4.2z"/><path d="M5.6 2.4v9.4M10.4 4.2v9.4"/><circle cx="8" cy="7.8" r="1.3" fill="currentColor" stroke="none"/></svg>
}
function IconPlus() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
}
function IconUpload() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v8M5 5l3-3 3 3"/><path d="M2 13h12"/></svg>
}
function IconFile() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z"/><path d="M9 1v4h4" fill="none" stroke="white" strokeWidth="1"/></svg>
}
function IconTemplate() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="4" rx="1"/><rect x="1" y="7" width="8" height="2" rx="1"/><rect x="1" y="11" width="11" height="2" rx="1"/></svg>
}
function IconSettings() {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="2.5"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/></svg>
}
function IconUsers() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 8a3 3 0 100-6 3 3 0 000 6zM1.5 14c0-2.4 2.1-4.25 5-4.25s5 1.85 5 4.25V15h-10v-1z"/><path d="M11.6 8.4a2.4 2.4 0 10-.95-4.6 4.2 4.2 0 01-.38 4.3c.45.06.9.16 1.33.3zM12.4 9.7c1.3.75 2.1 1.9 2.1 3.3V14h-2v-.15c0-1.55-.58-2.86-1.57-3.82.5-.02 1-.13 1.47-.33z"/></svg>
}
function IconStudy() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2a1 1 0 011-1h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V2z"/><path d="M9 1v4h4" fill="none" stroke="white" strokeWidth="1"/><rect x="5" y="8" width="6" height="1" rx=".5"/><rect x="5" y="10.5" width="4" height="1" rx=".5"/></svg>
}
