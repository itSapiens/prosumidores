-- ============================================================
-- 016_extend_contract_token_purpose.sql
-- ============================================================
-- Añade 'proposal_continue' como valor válido del CHECK
-- `contract_access_tokens.purpose`.
--
-- Motivo: la base v1 tiene 158 tokens con purpose='proposal_continue'
-- que representan links donde el cliente retoma una propuesta en curso
-- (flujo distinto de 'contract_sign'/'contract_view'). Para no perder
-- la semántica original se preserva el valor en v2.
--
-- Valores soportados tras esta migración:
--   - contract_sign     → firma del contrato
--   - contract_view     → visualización del contrato (solo lectura)
--   - proposal_continue → retomar propuesta (flujo previo a firma)
-- ============================================================

BEGIN;

ALTER TABLE public.contract_access_tokens
  DROP CONSTRAINT IF EXISTS contract_access_tokens_purpose_check;

ALTER TABLE public.contract_access_tokens
  ADD CONSTRAINT contract_access_tokens_purpose_check
  CHECK (purpose IN ('contract_sign','contract_view','proposal_continue'));

COMMIT;
