-- ============================================================
-- GRANTs SQL para authenticated y anon (distinto de RLS)
-- ============================================================
-- Error "permission denied for table X" → falta GRANT SQL.
--
-- En Supabase hay DOS capas de permisos:
--   1) GRANT (privilegios SQL a nivel de tabla/esquema)
--   2) RLS policies (filtrado de filas)
--
-- Ambos son necesarios. Si falta el GRANT, PostgreSQL bloquea
-- antes de evaluar RLS y devuelve "permission denied".
--
-- Las tablas creadas por SQL puro (no desde la UI de Supabase)
-- no heredan los GRANTs por defecto para authenticated/anon.
-- Este script los aplica y además configura DEFAULT PRIVILEGES
-- para que las tablas futuras ya los hereden.
--
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- 1) USAGE en el esquema
GRANT USAGE ON SCHEMA public TO authenticated, anon;

-- 2) Privilegios en todas las tablas existentes
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO authenticated, anon;

-- 3) Privilegios en secuencias (para columnas SERIAL / IDENTITY)
GRANT USAGE, SELECT
  ON ALL SEQUENCES IN SCHEMA public
  TO authenticated, anon;

-- 4) DEFAULT PRIVILEGES para tablas / secuencias futuras
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO authenticated, anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO authenticated, anon;

-- ============================================================
-- Verificación
-- ============================================================
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'installation_reservations'
  AND grantee IN ('authenticated','anon')
ORDER BY grantee, privilege_type;
