-- ============================================================
-- Migración: snapshot inmutable en acuerdo_versiones
-- ============================================================
-- Añade columna JSON con la foto congelada de la versión
-- (partícipes + coeficientes) al cerrar el acuerdo.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

ALTER TABLE acuerdo_versiones
  ADD COLUMN IF NOT EXISTS snapshot jsonb;

COMMENT ON COLUMN acuerdo_versiones.snapshot IS
  'Foto inmutable de los partícipes y coeficientes en el momento de cierre de la versión';
