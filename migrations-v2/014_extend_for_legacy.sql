-- ============================================================
-- 014_extend_for_legacy.sql — Extender v2 con tablas legacy v1
-- ============================================================
-- Añade al esquema v2 los objetos que v1 tenía y que usa la
-- "otra aplicación conectada" (firma de contratos + recepción
-- de justificantes de pago). Se mantienen con:
--   - empresa_id NOT NULL + FK a empresas
--   - created_by / updated_by / updated_at (patrón v2)
--   - triggers set_updated_at + set_audit_fields
--   - RLS se activa aquí, las policies viven en 015_rls_extensions.sql
--
-- Bloques:
--   (a) ALTER installations: 3 columnas del flujo de reserva/contratación
--   (b) ALTER installation_reservations: timestamps de lifecycle + metadata
--       (descartadas columnas Stripe por decisión explícita)
--   (c) CREATE contracts
--   (d) CREATE contract_access_tokens
--
-- NOTA: payment_submissions (v1) estaba ligada a Stripe. Como
-- Stripe no se usará en v2, la tabla se omite intencionadamente.
--
-- Los CHECK de enum values están alineados con los valores
-- confirmados de v1. Si se ampliaran los estados, basta con
-- ALTER ... DROP/ADD CONSTRAINT.
-- ============================================================

BEGIN;

-- ============================================================
-- (a) installations: columnas para flujo de contratación
-- ============================================================
ALTER TABLE public.installations
  ADD COLUMN IF NOT EXISTS contractable_kwp_reserved  numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contractable_kwp_confirmed numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS precio_excedentes_eur_kwh  numeric NOT NULL DEFAULT 0;

ALTER TABLE public.installations
  DROP CONSTRAINT IF EXISTS installations_contractable_reserved_nonneg,
  DROP CONSTRAINT IF EXISTS installations_contractable_confirmed_nonneg,
  DROP CONSTRAINT IF EXISTS installations_precio_excedentes_nonneg;

ALTER TABLE public.installations
  ADD CONSTRAINT installations_contractable_reserved_nonneg
    CHECK (contractable_kwp_reserved >= 0),
  ADD CONSTRAINT installations_contractable_confirmed_nonneg
    CHECK (contractable_kwp_confirmed >= 0),
  ADD CONSTRAINT installations_precio_excedentes_nonneg
    CHECK (precio_excedentes_eur_kwh >= 0);

COMMENT ON COLUMN public.installations.contractable_kwp_reserved IS
  'kWp reservados (reservas en estado pending_payment / signal_paid). Lo mantiene la otra app.';
COMMENT ON COLUMN public.installations.contractable_kwp_confirmed IS
  'kWp confirmados (contrato firmado). Lo mantiene la otra app.';
COMMENT ON COLUMN public.installations.precio_excedentes_eur_kwh IS
  'Precio €/kWh que el comercializador paga por excedentes vertidos a red.';

-- ============================================================
-- (b) installation_reservations: lifecycle + metadata
-- ============================================================
-- Columnas añadidas (todas presentes en v1, sin las Stripe):
--   - reserved_at        → momento "humano" en que se toma la reserva
--                          (distinto de created_at técnico)
--   - confirmed_at       → momento en que se confirma (contrato firmado)
--   - released_at        → momento en que se libera (cancelada / caducada)
--   - release_reason     → motivo de liberación (texto libre)
--   - deadline_enforced  → true si el plazo de pago se aplicó (cron)
--   - signal_amount      → importe de señal (€). No es Stripe, es dominio.
--   - currency           → ISO currency code (DEFAULT 'eur').
--   - metadata           → jsonb flexible por si la otra app guarda info.
-- ============================================================
ALTER TABLE public.installation_reservations
  ADD COLUMN IF NOT EXISTS reserved_at        timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS confirmed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS released_at        timestamptz,
  ADD COLUMN IF NOT EXISTS release_reason     text,
  ADD COLUMN IF NOT EXISTS deadline_enforced  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signal_amount      numeric,
  ADD COLUMN IF NOT EXISTS currency           text NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS metadata           jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.installation_reservations
  DROP CONSTRAINT IF EXISTS reservations_signal_amount_nonneg,
  DROP CONSTRAINT IF EXISTS reservations_currency_format;

ALTER TABLE public.installation_reservations
  ADD CONSTRAINT reservations_signal_amount_nonneg
    CHECK (signal_amount IS NULL OR signal_amount >= 0),
  ADD CONSTRAINT reservations_currency_format
    CHECK (currency ~ '^[a-z]{3}$');

COMMENT ON COLUMN public.installation_reservations.reserved_at IS
  'Momento de la reserva (distinto de created_at, que puede ser el INSERT técnico).';
COMMENT ON COLUMN public.installation_reservations.confirmed_at IS
  'Momento en que la reserva pasa a confirmada (contrato firmado / validado).';
COMMENT ON COLUMN public.installation_reservations.released_at IS
  'Momento en que la reserva queda liberada (cancelación, caducidad, etc.).';
COMMENT ON COLUMN public.installation_reservations.release_reason IS
  'Motivo de liberación: cancelled_by_user, deadline_expired, rejected, …';
COMMENT ON COLUMN public.installation_reservations.deadline_enforced IS
  'true si el cron de caducidad liberó la reserva por impago.';

-- ============================================================
-- (c) Tabla: contracts
-- ============================================================
-- Migración 1:1 de v1 conservando todos los campos (incluyendo
-- los paths de Drive y Supabase Storage), pero añadiendo:
--   - empresa_id (tenant)
--   - created_by / updated_by (auditoría)
--   - CHECK de status/proposal_mode/signature_type explícitos
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contracts (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,

  -- Relaciones (mismos FKs que v1)
  study_id                  uuid NOT NULL REFERENCES public.studies(id) ON DELETE RESTRICT,
  client_id                 uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  installation_id           uuid NOT NULL REFERENCES public.installations(id) ON DELETE RESTRICT,

  -- Modo de propuesta (investment / service)
  proposal_mode             text NOT NULL,

  -- Estado del contrato
  status                    text NOT NULL DEFAULT 'generated',
  signature_type            text NOT NULL DEFAULT 'simple',

  -- Identificadores / numeración
  contract_number           text,

  -- Almacenamiento: Drive (legacy) y Supabase Storage
  contract_drive_url        text,
  contract_drive_file_id    text,
  drive_folder_url          text,
  drive_folder_id           text,
  contract_supabase_path    text,
  contract_supabase_bucket  text,
  supabase_folder_path      text,

  -- Timestamps de lifecycle
  uploaded_at               timestamptz,
  signed_at                 timestamptz,
  confirmed_at              timestamptz,

  -- Metadatos flexibles
  metadata                  jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Auditoría estándar v2
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT contracts_proposal_mode_valid CHECK (
    proposal_mode IN ('investment','service')
  ),
  CONSTRAINT contracts_status_valid CHECK (
    status IN ('generated','uploaded','signed','confirmed','cancelled')
  ),
  CONSTRAINT contracts_signature_type_valid CHECK (
    signature_type IN ('simple','advanced','qualified')
  )
);

-- UNIQUE por study (1:1 estudio↔contrato, igual que v1)
CREATE UNIQUE INDEX IF NOT EXISTS contracts_study_id_unique
  ON public.contracts(study_id);

CREATE INDEX IF NOT EXISTS idx_contracts_empresa        ON public.contracts(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contracts_installation   ON public.contracts(installation_id);
CREATE INDEX IF NOT EXISTS idx_contracts_client        ON public.contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status         ON public.contracts(empresa_id, status);

COMMENT ON TABLE public.contracts IS
  'Contratos de la otra app (firma y confirmación). Aislado por empresa_id.';

CREATE TRIGGER trg_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_contracts_audit_fields
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- Auditoría inmutable
CREATE TRIGGER trg_audit_contracts
  AFTER INSERT OR UPDATE OR DELETE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- (d) Tabla: contract_access_tokens
-- ============================================================
-- Tokens de un solo uso (hash en BD, nunca el token en claro)
-- que permiten a un cliente acceder a la página pública de firma
-- sin tener cuenta. v1 tenía 157 tokens.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contract_access_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,

  -- Relaciones
  study_id      uuid NOT NULL REFERENCES public.studies(id) ON DELETE CASCADE,
  contract_id   uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Token (se guarda solo el hash SHA-256; el valor plano se envía 1 vez al cliente)
  token_hash    text NOT NULL,
  purpose       text NOT NULL DEFAULT 'contract_sign',

  -- Lifecycle
  expires_at    timestamptz,
  used_at       timestamptz,
  revoked_at    timestamptz,

  -- Auditoría
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT contract_tokens_token_hash_unique UNIQUE (token_hash),
  CONSTRAINT contract_tokens_purpose_valid CHECK (
    purpose IN ('contract_sign','contract_view')
  ),
  CONSTRAINT contract_tokens_hash_not_empty CHECK (length(trim(token_hash)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_contract_tokens_empresa   ON public.contract_access_tokens(empresa_id);
CREATE INDEX IF NOT EXISTS idx_contract_tokens_study     ON public.contract_access_tokens(study_id);
CREATE INDEX IF NOT EXISTS idx_contract_tokens_contract  ON public.contract_access_tokens(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contract_tokens_client    ON public.contract_access_tokens(client_id);
CREATE INDEX IF NOT EXISTS idx_contract_tokens_active
  ON public.contract_access_tokens(empresa_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.contract_access_tokens IS
  'Tokens hasheados de acceso público a contratos (firma/consulta). Un solo uso.';
COMMENT ON COLUMN public.contract_access_tokens.token_hash IS
  'SHA-256 del token plano. El valor plano NUNCA se guarda.';

CREATE TRIGGER trg_contract_tokens_updated_at
  BEFORE UPDATE ON public.contract_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_contract_tokens_audit_fields
  BEFORE INSERT OR UPDATE ON public.contract_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

CREATE TRIGGER trg_audit_contract_tokens
  AFTER INSERT OR UPDATE OR DELETE ON public.contract_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger();

-- ============================================================
-- Activar RLS en las tablas nuevas (policies en 015_rls_extensions.sql)
-- ============================================================
ALTER TABLE public.contracts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_access_tokens  ENABLE ROW LEVEL SECURITY;

-- GRANTs de tabla (RLS filtra fila a fila)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts               TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_access_tokens  TO authenticated;

COMMIT;
