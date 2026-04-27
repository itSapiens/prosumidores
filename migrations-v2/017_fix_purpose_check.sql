-- ============================================================
-- 017_fix_purpose_check.sql
-- ============================================================
-- La migración 016 tenía un bug: intentaba dropear el constraint
-- `contract_access_tokens_purpose_check` (nombre por defecto de
-- Postgres), pero el constraint real se creó en 014 con nombre
-- explícito `contract_tokens_purpose_valid`.
-- Resultado: 016 era un no-op y el CHECK seguía sin aceptar
-- 'proposal_continue'. Esto corrige el problema.
--
-- Valores soportados tras esta migración:
--   - contract_sign
--   - contract_view
--   - proposal_continue
-- ============================================================

BEGIN;

ALTER TABLE public.contract_access_tokens
  DROP CONSTRAINT IF EXISTS contract_tokens_purpose_valid;

ALTER TABLE public.contract_access_tokens
  ADD CONSTRAINT contract_tokens_purpose_valid
  CHECK (purpose IN ('contract_sign','contract_view','proposal_continue'));

-- Limpieza del intento fallido de 016 (si se quedó algún residuo)
ALTER TABLE public.contract_access_tokens
  DROP CONSTRAINT IF EXISTS contract_access_tokens_purpose_check;

COMMIT;
