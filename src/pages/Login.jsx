import { useState } from 'react'
import { supabaseAuth } from '../lib/supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabaseAuth.auth.signInWithPassword({ email, password })
    if (error) setError(error.message === 'Invalid login credentials'
      ? 'Email o contraseña incorrectos'
      : error.message)
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      background: '#000054',
    }}>
      {/* Panel izquierdo — branding */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 40px',
        background: 'linear-gradient(135deg, #000054 0%, #001080 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Círculo decorativo */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 320, height: 320, borderRadius: '50%',
          background: 'rgba(84,217,199,.06)',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', bottom: -60, left: -60,
          width: 240, height: 240, borderRadius: '50%',
          background: 'rgba(148,194,255,.05)',
          pointerEvents: 'none',
        }} />

        <img
          src="/sapiens_logo_white.png"
          alt="Sapiens Energía"
          style={{ width: 200, marginBottom: 40 }}
        />
        <div style={{
          fontSize: 22, fontWeight: 700, color: '#fff',
          textAlign: 'center', lineHeight: 1.3, marginBottom: 12,
        }}>
          Instalaciones ACC
        </div>
        <div style={{
          fontSize: 14, color: 'rgba(255,255,255,.55)',
          textAlign: 'center', maxWidth: 240,
        }}>
          Gestión de autoconsumo colectivo
        </div>

        {/* Línea decorativa con gradiente */}
        <div style={{
          marginTop: 40, width: 160, height: 3, borderRadius: 2,
          background: 'linear-gradient(90deg, #54D9C7, #94C2FF)',
        }} />
      </div>

      {/* Panel derecho — formulario */}
      <div style={{
        width: 420,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F4F6FB',
        padding: '40px 36px',
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#000054', marginBottom: 6 }}>
              Iniciar sesión
            </div>
            <div style={{ fontSize: 13, color: '#706F6F' }}>
              Accede con tu cuenta de Sapiens Energía
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                className="form-input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@sapiensenergia.es"
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 8,
                background: '#FCEBEB', color: '#A32D2D',
                fontSize: 13, fontWeight: 500,
                border: '1px solid #E24B4A',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: 4, padding: '10px 14px', fontSize: 14 }}
              disabled={loading}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <div style={{
            marginTop: 36, paddingTop: 20,
            borderTop: '1px solid rgba(0,0,84,.1)',
            textAlign: 'center',
            fontSize: 11, color: '#706F6F',
          }}>
            sapiensenergia.es
          </div>
        </div>
      </div>
    </div>
  )
}
