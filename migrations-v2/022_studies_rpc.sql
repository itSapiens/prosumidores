-- ============================================================
-- 022_studies_rpc.sql
-- ============================================================
-- Expone RPCs seguras para listar y consultar estudios sin
-- depender de políticas RLS o datos legacy desalineados.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_studies_overview()
RETURNS SETOF public.studies
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT *
  FROM public.studies
  ORDER BY created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_study_detail(
  p_study_id uuid
)
RETURNS SETOF public.studies
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT *
  FROM public.studies
  WHERE id = p_study_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_study_reservations(
  p_study_id uuid
)
RETURNS SETOF public.installation_reservations
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT *
  FROM public.installation_reservations
  WHERE study_id = p_study_id
  ORDER BY created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_studies_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_detail(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_reservations(uuid) TO authenticated;

COMMIT;
