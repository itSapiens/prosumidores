-- ============================================================
-- 013_fix_cups_regex.sql — Arreglar CHECK del formato CUPS
-- ============================================================
-- El CHECK original '^[A-Z]{2}[0-9]{16}[A-Z]{2}[0-9FP]?$'
-- rechazaba CUPS22 legítimos (ej. ES0031500565001003AB0F)
-- porque [0-9FP]? sólo acepta 0 o 1 carácter suelto.
--
-- Un CUPS22 real es CUPS20 + dígito + letra F/P/C/R (los dos juntos).
-- ============================================================

BEGIN;

-- ---- clients.cups ------------------------------------------
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_cups_format;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_cups_format CHECK (
    cups IS NULL OR cups ~ '^[A-Z]{2}[0-9]{16}[A-Z]{2}([0-9][FPCR])?$'
  );

-- ---- installations.cups_generador --------------------------
ALTER TABLE public.installations
  DROP CONSTRAINT IF EXISTS installations_cups_format;

ALTER TABLE public.installations
  ADD CONSTRAINT installations_cups_format CHECK (
    cups_generador IS NULL OR cups_generador ~ '^[A-Z]{2}[0-9]{16}[A-Z]{2}([0-9][FPCR])?$'
  );

COMMIT;
