import { createClient } from '@supabase/supabase-js'

// ============================================================
// Cliente Supabase unificado (auth + datos en el mismo proyecto)
// ============================================================
// Las credenciales se leen de variables de entorno. Vite las
// inyecta en tiempo de build (import.meta.env.VITE_*).
// Configura .env.local a partir de .env.example.
// ============================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en el entorno. ' +
    'Copia .env.example a .env.local y rellena los valores del proyecto Supabase.'
  )
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // PKCE es el flow recomendado para SPAs (evita exposición de tokens en URL)
    flowType: 'pkce',
  },
})

// ------------------------------------------------------------
// Alias retro-compatible
// ------------------------------------------------------------
// En la v1 había dos clientes (auth y datos) por la separación
// de proyectos. En la v2 es el mismo. Mantenemos el alias para
// que el código existente siga funcionando durante la migración
// sin necesidad de tocar todos los imports. Se eliminará al final.
// ------------------------------------------------------------
export const supabaseAuth = supabase
