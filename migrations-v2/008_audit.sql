-- ============================================================
-- 008_audit.sql — Auditoría de acciones sensibles
-- ============================================================
-- Tabla audit_log inmutable + trigger genérico que captura
-- INSERT/UPDATE/DELETE sobre tablas con PII o legalmente
-- relevantes. Cumple con RGPD Art. 30 (registro de actividades).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabla: audit_log
-- ------------------------------------------------------------
CREATE TABLE public.audit_log (
  id          bigserial PRIMARY KEY,
  empresa_id  uuid REFERENCES public.empresas(id) ON DELETE SET NULL,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT audit_log_action_valid CHECK (
    action IN ('insert','update','delete','sign','close_version','open_version','login','export','download')
  )
);

CREATE INDEX idx_audit_log_empresa ON public.audit_log(empresa_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log(entity, entity_id);
CREATE INDEX idx_audit_log_user ON public.audit_log(user_id, created_at DESC);

COMMENT ON TABLE public.audit_log IS
  'Registro inmutable de acciones sensibles. Nunca se modifica ni se borra (policy bloquea UPDATE/DELETE).';

-- ------------------------------------------------------------
-- Función genérica de trigger de auditoría
-- Captura el OLD y NEW de cada operación en tablas sensibles.
-- Para UPDATE calcula sólo los campos que han cambiado.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_empresa_id uuid;
  v_entity_id uuid;
  v_old jsonb;
  v_new jsonb;
  v_changed jsonb;
BEGIN
  -- Extraer empresa_id si la tabla lo tiene
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    BEGIN v_empresa_id := (v_old->>'empresa_id')::uuid; EXCEPTION WHEN others THEN v_empresa_id := NULL; END;
    BEGIN v_entity_id := (v_old->>'id')::uuid; EXCEPTION WHEN others THEN v_entity_id := NULL; END;
  ELSE
    v_new := to_jsonb(NEW);
    BEGIN v_empresa_id := (v_new->>'empresa_id')::uuid; EXCEPTION WHEN others THEN v_empresa_id := NULL; END;
    BEGIN v_entity_id := (v_new->>'id')::uuid; EXCEPTION WHEN others THEN v_entity_id := NULL; END;
    IF TG_OP = 'UPDATE' THEN
      v_old := to_jsonb(OLD);
    END IF;
  END IF;

  -- Para UPDATEs, registrar solo campos modificados
  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_object_agg(key, value)
    INTO v_changed
    FROM jsonb_each(v_new)
    WHERE v_old->key IS DISTINCT FROM value
      AND key NOT IN ('updated_at','updated_by');
    -- Si solo han cambiado updated_at/by, no registrar
    IF v_changed IS NULL OR v_changed = '{}'::jsonb THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  INSERT INTO public.audit_log(empresa_id, user_id, action, entity, entity_id, old_data, new_data)
  VALUES (
    v_empresa_id,
    auth.uid(),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN v_old ELSE NULL END,
    CASE WHEN TG_OP = 'UPDATE' THEN v_changed
         WHEN TG_OP = 'INSERT' THEN v_new
         ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.audit_trigger() IS
  'Trigger genérico AFTER INSERT/UPDATE/DELETE que registra en audit_log.';

-- ------------------------------------------------------------
-- Aplicar trigger de auditoría a tablas sensibles
-- ------------------------------------------------------------
CREATE TRIGGER trg_audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_installations
  AFTER INSERT OR UPDATE OR DELETE ON public.installations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_participes
  AFTER INSERT OR UPDATE OR DELETE ON public.participes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_studies
  AFTER INSERT OR UPDATE OR DELETE ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_installation_reservations
  AFTER INSERT OR UPDATE OR DELETE ON public.installation_reservations
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_acuerdo_versiones
  AFTER INSERT OR UPDATE OR DELETE ON public.acuerdo_versiones
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_empresas
  AFTER INSERT OR UPDATE OR DELETE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_user_empresas
  AFTER INSERT OR UPDATE OR DELETE ON public.user_empresas
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

CREATE TRIGGER trg_audit_document_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

COMMIT;
