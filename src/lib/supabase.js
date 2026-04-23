import { createClient } from '@supabase/supabase-js'

// Proyecto de datos (instalaciones, partícipes, etc.)
const SUPABASE_URL = 'https://slwvywujkzylwjgoflne.supabase.co'
const SUPABASE_KEY = 'sb_publishable_rUrT5EbRTGLrvFej8Cv9fA_8vg2Xs-g'
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Proyecto de autenticación compartido
const AUTH_URL = 'https://mlahrrmxyklqwbxflndy.supabase.co'
const AUTH_KEY = 'sb_publishable_ZblqE0KDdDhIGxakx_13cw_4oUgCJ_q'
export const supabaseAuth = createClient(AUTH_URL, AUTH_KEY)
