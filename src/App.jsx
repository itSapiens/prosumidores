import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Proyectos from './pages/Proyectos.jsx'
import MapaInstalaciones from './pages/MapaInstalaciones.jsx'
import DetalleProyecto from './pages/DetalleProyecto.jsx'
import NuevoProyecto from './pages/NuevoProyecto.jsx'
import Documentos from './pages/Documentos.jsx'
import Importar from './pages/Importar.jsx'
import Plantillas from './pages/Plantillas.jsx'
import Configuracion from './pages/Configuracion.jsx'
import Usuarios from './pages/Usuarios.jsx'
import Estudios from './pages/Estudios.jsx'
import DetalleEstudio from './pages/DetalleEstudio.jsx'

function ProtectedRoutes() {
  const { session } = useAuth()

  // Cargando sesión inicial
  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  // No autenticado → Login
  if (!session) return <Navigate to="/login" replace />

  return (
    <Route path="/" element={<Layout />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<Dashboard />} />
      <Route path="proyectos" element={<Proyectos />} />
      <Route path="mapa" element={<MapaInstalaciones />} />
      <Route path="proyectos/nuevo" element={<NuevoProyecto />} />
      <Route path="proyectos/:id" element={<DetalleProyecto />} />
      <Route path="proyectos/:id/datos" element={<NuevoProyecto />} />
      <Route path="proyectos/:id/editar" element={<NuevoProyecto />} />
      <Route path="documentos" element={<Documentos />} />
      <Route path="importar" element={<Importar />} />
      <Route path="plantillas" element={<Plantillas />} />
      <Route path="configuracion" element={<Configuracion />} />
      <Route path="usuarios" element={<Usuarios />} />
      <Route path="estudios" element={<Estudios />} />
      <Route path="estudios/:id" element={<DetalleEstudio />} />
    </Route>
  )
}

function AppRoutes() {
  const { session } = useAuth()

  if (session === undefined) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/" element={session ? <Layout /> : <Navigate to="/login" replace />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="proyectos" element={<Proyectos />} />
        <Route path="mapa" element={<MapaInstalaciones />} />
        <Route path="proyectos/nuevo" element={<NuevoProyecto />} />
        <Route path="proyectos/:id" element={<DetalleProyecto />} />
        <Route path="proyectos/:id/datos" element={<NuevoProyecto />} />
        <Route path="proyectos/:id/editar" element={<NuevoProyecto />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="importar" element={<Importar />} />
        <Route path="plantillas" element={<Plantillas />} />
        <Route path="configuracion" element={<Configuracion />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="estudios" element={<Estudios />} />
        <Route path="estudios/:id" element={<DetalleEstudio />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? '/dashboard' : '/login'} replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
