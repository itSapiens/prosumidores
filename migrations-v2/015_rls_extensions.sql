-- ============================================================
-- 015_rls_extensions.sql — Policies RLS para las tablas legacy
-- ============================================================
-- Complemento de 014_extend_for_legacy.sql. Define las policies
-- de SELECT / INSERT / UPDATE / DELETE para:
--   - contracts
--   - contract_access_tokens
--
-- Patrón (idéntico al de 010_rls.sql):
--   SELECT  → cualquier miembro de la empresa (rol lectura+)
--   INSERT  → gestor+
--   UPDATE  → gestor+
--   DELETE  → admin (datos con valor legal / trazabilidad)
--
-- Los tokens hash nunca deben poder modificarse "a mano" por un
-- usuario normal; solo se crean al enviar el enlace de firma y se
-- marcan used/revoked desde la app o SECURITY DEFINER.
-- ============================================================

BEGIN;

-- ============================================================
-- Policies: contracts
-- ============================================================
CREATE POLICY "contracts_select" ON public.contracts FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));

CREATE POLICY "contracts_insert" ON public.contracts FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'gestor')
  );

CREATE POLICY "contracts_update" ON public.contracts FOR UPDATE TO authenticated
  USING (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'gestor')
  )
  WITH CHECK (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'gestor')
  );

CREATE POLICY "contracts_delete" ON public.contracts FOR DELETE TO authenticated
  USING (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'admin')
  );

-- ============================================================
-- Policies: contract_access_tokens
-- ============================================================
-- SELECT: lectura+ (auditoría en el backoffice)
-- INSERT/UPDATE/DELETE: gestor+ (los crea la app al generar el link
--   de firma; el endpoint público usa service_role para consumirlos)
-- DELETE: admin (los tokens expirados se conservan como evidencia)
CREATE POLICY "contract_tokens_select" ON public.contract_access_tokens FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));

CREATE POLICY "contract_tokens_insert" ON public.contract_access_tokens FOR INSERT TO authenticated
  WITH CHECK (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'gestor')
  );

CREATE POLICY "contract_tokens_update" ON public.contract_access_tokens FOR UPDATE TO authenticated
  USING (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'gestor')
  )
  WITH CHECK (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'gestor')
  );

CREATE POLICY "contract_tokens_delete" ON public.contract_access_tokens FOR DELETE TO authenticated
  USING (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'admin')
  );

COMMIT;
