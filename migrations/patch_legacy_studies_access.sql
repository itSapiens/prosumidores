-- ============================================================
-- patch_legacy_studies_access.sql
-- ============================================================
-- Parche para entornos LEGACY donde `public.studies` existe con
-- el esquema antiguo (sin empresa_id) y la app autenticada ve
-- cero filas por ausencia de GRANT/RLS de SELECT.
--
-- Compatible con la tabla que muestra:
--   id, language, consent_accepted, source_file, customer,
--   location, invoice_data, selected_installation_id,
--   selected_installation_snapshot, calculation, status,
--   email_status, created_at, updated_at, assigned_kwp
-- ============================================================

BEGIN;

GRANT USAGE ON SCHEMA public TO authenticated;

GRANT SELECT ON public.studies TO authenticated;
GRANT SELECT ON public.installation_reservations TO authenticated;

ALTER TABLE public.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_select_studies_legacy" ON public.studies;
DROP POLICY IF EXISTS "auth_select_installation_reservations_legacy" ON public.installation_reservations;

CREATE POLICY "auth_select_studies_legacy"
ON public.studies
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "auth_select_installation_reservations_legacy"
ON public.installation_reservations
FOR SELECT
TO authenticated
USING (true);

COMMIT;
