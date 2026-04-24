-- ============================================================
-- 006_studies.sql — Estudios de viabilidad y reservas
-- ============================================================
-- studies: estudios energéticos cargados desde factura/Excel
-- installation_reservations: reservas de potencia en instalaciones
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabla: studies
-- Estudios de viabilidad vinculados (o no) a una instalación.
-- Contienen snapshot jsonb de datos del cliente y cálculos.
-- ------------------------------------------------------------
CREATE TABLE public.studies (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                      uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,

  -- Estado del estudio
  status                          text NOT NULL DEFAULT 'uploaded',
  email_status                    text,

  -- Datos (jsonb por flexibilidad)
  customer                        jsonb NOT NULL DEFAULT '{}'::jsonb,
  calculation                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  invoice_data                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_file                     jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Asignación a instalación (si procede)
  selected_installation_id        uuid REFERENCES public.installations(id) ON DELETE SET NULL,
  selected_installation_snapshot  jsonb,
  assigned_kwp                    numeric,

  -- Relación con cliente persistente (si se ha "promovido")
  client_id                       uuid REFERENCES public.clients(id) ON DELETE SET NULL,

  -- Metadata
  notas                           text,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),
  created_by                      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                      uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT studies_status_valid CHECK (
    status IN ('uploaded','validated','calculated','sent','reserved','contracted','rejected','cancelled')
  ),
  CONSTRAINT studies_email_status_valid CHECK (
    email_status IS NULL OR email_status IN ('pending','sent','delivered','opened','bounced','failed')
  ),
  CONSTRAINT studies_assigned_kwp_positive CHECK (
    assigned_kwp IS NULL OR assigned_kwp > 0
  )
);

CREATE INDEX idx_studies_empresa ON public.studies(empresa_id);
CREATE INDEX idx_studies_status ON public.studies(empresa_id, status);
CREATE INDEX idx_studies_installation ON public.studies(selected_installation_id) WHERE selected_installation_id IS NOT NULL;
CREATE INDEX idx_studies_client ON public.studies(client_id) WHERE client_id IS NOT NULL;

COMMENT ON TABLE public.studies IS
  'Estudios de viabilidad. customer jsonb contiene PII snapshot. Aislado por empresa_id.';

CREATE TRIGGER trg_studies_updated_at
  BEFORE UPDATE ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_studies_audit_fields
  BEFORE INSERT OR UPDATE ON public.studies
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- ------------------------------------------------------------
-- Tabla: installation_reservations
-- Reservas de potencia en una instalación. Un estudio puede
-- tener 1 reserva y una reserva pertenece a 1 instalación.
-- ------------------------------------------------------------
CREATE TABLE public.installation_reservations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  installation_id      uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  study_id             uuid REFERENCES public.studies(id) ON DELETE SET NULL,
  client_id            uuid REFERENCES public.clients(id) ON DELETE SET NULL,

  -- Reserva
  reserved_kwp         numeric NOT NULL,
  reservation_status   text NOT NULL DEFAULT 'pending_payment',
  payment_status       text NOT NULL DEFAULT 'pending',
  payment_deadline_at  timestamptz,

  -- Metadata
  notas                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT reservations_reserved_kwp_positive CHECK (reserved_kwp > 0),
  CONSTRAINT reservations_status_valid CHECK (
    reservation_status IN ('pending_payment','paid','confirmed','released','cancelled','rejected')
  ),
  CONSTRAINT reservations_payment_status_valid CHECK (
    payment_status IN ('pending','signal_paid','paid','failed','refunded')
  )
);

CREATE INDEX idx_reservations_empresa ON public.installation_reservations(empresa_id);
CREATE INDEX idx_reservations_installation ON public.installation_reservations(installation_id);
CREATE INDEX idx_reservations_study ON public.installation_reservations(study_id) WHERE study_id IS NOT NULL;
CREATE INDEX idx_reservations_client ON public.installation_reservations(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_reservations_status ON public.installation_reservations(installation_id, reservation_status);

COMMENT ON TABLE public.installation_reservations IS
  'Reservas de potencia kWp en instalaciones. Aislado por empresa_id.';

CREATE TRIGGER trg_reservations_updated_at
  BEFORE UPDATE ON public.installation_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_reservations_audit_fields
  BEFORE INSERT OR UPDATE ON public.installation_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

COMMIT;
