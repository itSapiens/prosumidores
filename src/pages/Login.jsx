import { useState } from 'react'
import { supabaseAuth } from '../lib/supabase.js'

export default function Login() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleGoogleLogin() {
    setError('')
    setLoading(true)
    const { error } = await supabaseAuth.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          // hd = hosted domain: solo acepta cuentas de este dominio
          // (doble seguro: además de "Internal" en Google Cloud)
          hd: 'sapiensenergia.es',
          // Fuerza a elegir cuenta si el usuario tiene varias
          prompt: 'select_account',
        },
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    }
    // Si no hay error, Supabase redirige a Google y no volvemos aquí
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
        {/* Círculos decorativos */}
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

      {/* Panel derecho — login */}
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
              Accede con tu cuenta corporativa de Sapiens Energía
            </div>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#fff',
              color: '#3c4043',
              border: '1px solid #dadce0',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: loading ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              transition: 'box-shadow .2s, background .2s',
            }}
            onMouseEnter={e => {
              if (!loading) e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.12)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            {/* Logo oficial de Google (SVG, no requiere descarga) */}
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              <path fill="none" d="M0 0h48v48H0z"/>
            </svg>
            {loading ? 'Redirigiendo a Google...' : 'Continuar con Google'}
          </button>

          {error && (
            <div style={{
              marginTop: 16,
              padding: '10px 14px', borderRadius: 8,
              background: '#FCEBEB', color: '#A32D2D',
              fontSize: 13, fontWeight: 500,
              border: '1px solid #E24B4A',
            }}>
              {error}
            </div>
          )}

          <div style={{
            marginTop: 24,
            fontSize: 12,
            color: '#706F6F',
            textAlign: 'center',
            lineHeight: 1.5,
          }}>
            Solo se permite acceso a cuentas del dominio<br/>
            <strong style={{ color: '#000054' }}>@sapiensenergia.es</strong>
          </div>

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
