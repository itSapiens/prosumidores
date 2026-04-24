-- ============================================================
-- 012_auto_empresa.sql — Auto-rellenar empresa_id en INSERT
-- ============================================================
-- Red de seguridad para que el código v1 (que no envía empresa_id)
-- siga funcionando contra el schema v2 (que lo exige).
--
-- Regla:
--   - INSERT con empresa_id = NULL:
--       * Usuario con 1 empresa → se auto-asigna
--       * Usuario con 0 empresas → error explicativo (42501)
--       * Usuario con >1 empresas → error explicativo (42501)
--   - INSERT con empresa_id explícito → no tocar (se respeta)
--
-- La policy RLS sigue actuando después, así que si alguien intenta
-- meter empresa_id de otra empresa a la que no pertenece → bloqueado.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Función: auto_set_empresa_id
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_set_empresa_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_empresas uuid[];
  v_count int;
BEGIN
  -- Si ya viene con empresa_id, no tocar
  IF NEW.empresa_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Consultar las empresas del usuario autenticado
  SELECT public.current_empresa_ids() INTO v_empresas;
  v_count := COALESCE(array_length(v_empresas, 1), 0);

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Usuario sin empresa asignada. Contacta con el administrador.'
      USING ERRCODE = '42501';
  END IF;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'Usuario pertenece a múltiples empresas. La aplicación debe especificar empresa_id.'
      USING ERRCODE = '42501';
  END IF;

  NEW.empresa_id := v_empresas[1];
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_set_empresa_id() IS
  'Trigger BEFORE INSERT: rellena empresa_id desde user_empresas cuando viene NULL. Solo funciona para usuarios con una empresa única.';

-- ------------------------------------------------------------
-- Aplicar el trigger a todas las tablas tenant
-- ------------------------------------------------------------
-- Nota: los nombres empiezan por "trg_" para que respeten el orden
-- alfabético con los triggers existentes (trg_XXX_audit_fields, etc.)
-- En Postgres los triggers BEFORE se ejecutan en orden alfabético del nombre:
--   trg_XXX_audit_fields  → pone created_by/updated_by
--   trg_XXX_auto_empresa  → rellena empresa_id (después)
--   trg_XXX_updated_at    → pone updated_at (después)
-- El orden no importa para la corrección (no dependen entre sí).

CREATE TRIGGER trg_clients_auto_empresa
  BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

CREATE TRIGGER trg_installations_auto_empresa
  BEFORE INSERT ON public.installations
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

CREATE TRIGGER trg_participes_auto_empresa
  BEFORE INSERT ON public.participes
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

CREATE TRIGGER trg_studies_auto_empresa
  BEFORE INSERT ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

CREATE TRIGGER trg_reservations_auto_empresa
  BEFORE INSERT ON public.installation_reservations
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

CREATE TRIGGER trg_documents_auto_empresa
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

CREATE TRIGGER trg_acuerdo_versiones_auto_empresa
  BEFORE INSERT ON public.acuerdo_versiones
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

CREATE TRIGGER trg_templates_auto_empresa
  BEFORE INSERT ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.auto_set_empresa_id();

COMMIT;

-- ============================================================
-- Verificación: insertar un installation de prueba DESDE LA APP
-- después de aplicar esto debería funcionar sin tocar código frontend.
-- ============================================================
