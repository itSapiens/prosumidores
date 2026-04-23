-- ============================================================
-- PROSUMIDORES — Parche v2: nuevos campos en installations
-- Ejecutar en Supabase → SQL Editor → New query
-- ============================================================

ALTER TABLE public.installations
  ADD COLUMN IF NOT EXISTS potencia_nominal_kw double precision,
  ADD COLUMN IF NOT EXISTS inclinacion double precision,
  ADD COLUMN IF NOT EXISTS orientacion text
    CHECK (orientacion IN ('sur','sureste','suroeste','este','oeste')),
  ADD COLUMN IF NOT EXISTS fecha_activacion_real date;

-- ============================================================
-- FIN DEL PARCHE
-- Columnas añadidas a installations:
--   potencia_nominal_kw (double precision)
--   inclinacion (double precision, grados)
--   orientacion (text enum: sur/sureste/suroeste/este/oeste)
--   fecha_activacion_real (date)
-- ============================================================
