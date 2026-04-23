-- ============================================================
-- RLS Policies para installation_reservations
-- ============================================================
-- Error 401 al leer la tabla → RLS activo sin policy de SELECT.
-- Estas policies dan acceso completo al rol authenticated
-- (el rol de los usuarios que han iniciado sesión en la app).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

-- Asegurar que RLS está activo
ALTER TABLE installation_reservations ENABLE ROW LEVEL SECURITY;

-- Limpiar policies antiguas si existen (idempotente)
DROP POLICY IF EXISTS "auth_select_reservations"   ON installation_reservations;
DROP POLICY IF EXISTS "auth_insert_reservations"   ON installation_reservations;
DROP POLICY IF EXISTS "auth_update_reservations"   ON installation_reservations;
DROP POLICY IF EXISTS "auth_delete_reservations"   ON installation_reservations;

-- SELECT: permitir leer todas las reservas a cualquier usuario autenticado
CREATE POLICY "auth_select_reservations"
  ON installation_reservations
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: permitir crear reservas a cualquier usuario autenticado
CREATE POLICY "auth_insert_reservations"
  ON installation_reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: permitir actualizar reservas (p.ej. cambiar estado de pago)
CREATE POLICY "auth_update_reservations"
  ON installation_reservations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: permitir borrar reservas
CREATE POLICY "auth_delete_reservations"
  ON installation_reservations
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- Verificación (ejecuta por separado para comprobar):
-- ============================================================
-- SELECT polname, cmd, roles, qual FROM pg_policies
--   WHERE tablename = 'installation_reservations';
