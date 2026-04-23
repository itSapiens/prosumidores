import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { supabaseAuth } from '../lib/supabase.js'
import { useAuth } from '../lib/AuthContext.jsx'

const navItems = [
  {
    section: 'Principal',
    items: [
      { to: '/dashboard',  label: 'Panel principal',   icon: IconGrid },
      { to: '/proyectos',  label: 'Instalaciones',     icon: IconFolder },
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
    ]
  }
]

export default function Layout() {
  const location = useLocation()
  const { user } = useAuth()
  const userInitial = (user?.email?.[0] || 'U').toUpperCase()

  const getTitle = () => {
    const path = location.pathname
    if (path === '/dashboard') return 'Panel principal'
    if (path === '/proyectos') return 'Instalaciones'
    if (path === '/proyectos/nuevo') return 'Nueva instalación'
    if (path.startsWith('/proyectos/') && path.endsWith('/editar')) return 'Editar instalación'
    if (path.startsWith('/proyectos/') && path.endsWith('/datos')) return 'Datos de la instalación'
    if (path.startsWith('/proyectos/')) return 'Detalle instalación'
    if (path === '/documentos') return 'Generar documentos'
    if (path === '/importar') return 'Importar partícipes'
    if (path === '/plantillas') return 'Gestión de plantillas'
    if (path === '/configuracion') return 'Configuración'
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
          {navItems.map(group => (
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
              <div className="user-role">Gestión interna</div>
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
function IconStudy() {
  return <svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 2a1 1 0 011-1h5l4 4v8a1 1 0 01-1 1H4a1 1 0 01-1-1V2z"/><path d="M9 1v4h4" fill="none" stroke="white" strokeWidth="1"/><rect x="5" y="8" width="6" height="1" rx=".5"/><rect x="5" y="10.5" width="4" height="1" rx=".5"/></svg>
}
