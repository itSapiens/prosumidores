-- ============================================================
-- 007_documents.sql — Plantillas, documentos y versiones
-- ============================================================
-- document_templates: plantillas de documentos por distribuidora
-- acuerdo_versiones: versiones del acuerdo de reparto (con snapshot)
-- documents: documentos generados por partícipe (PDFs firmables)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabla: document_templates
-- Plantillas por (empresa, distribuidora, tipo). Cada empresa
-- puede personalizar su redacción.
-- ------------------------------------------------------------
CREATE TABLE public.document_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  distribuidora_id  uuid NOT NULL REFERENCES public.distribuidoras(id) ON DELETE RESTRICT,
  tipo              text NOT NULL,
  contenido         text NOT NULL DEFAULT '',
  version           integer NOT NULL DEFAULT 1,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT document_templates_tipo_valid CHECK (
    tipo IN ('acuerdo_reparto','autorizacion_gestor','mandamiento_sepa','acuerdo_reparto_colectivo')
  ),
  CONSTRAINT document_templates_empresa_dist_tipo_unique
    UNIQUE (empresa_id, distribuidora_id, tipo)
);

CREATE INDEX idx_templates_empresa ON public.document_templates(empresa_id);
CREATE INDEX idx_templates_distribuidora ON public.document_templates(distribuidora_id);

COMMENT ON TABLE public.document_templates IS
  'Plantillas de documentos por empresa y distribuidora. Editable solo por admins.';

CREATE TRIGGER trg_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_templates_audit_fields
  BEFORE INSERT OR UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- ------------------------------------------------------------
-- Tabla: acuerdo_versiones
-- Historial de versiones del acuerdo de reparto por instalación.
-- Solo puede haber UNA versión 'activa' por instalación a la vez.
-- Al cerrarse se guarda el snapshot inmutable.
-- ------------------------------------------------------------
CREATE TABLE public.acuerdo_versiones (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  installation_id   uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  version           integer NOT NULL,
  estado            text NOT NULL DEFAULT 'activo',
  fecha_inicio      timestamptz NOT NULL DEFAULT now(),
  fecha_cierre      timestamptz,
  snapshot          jsonb,
  notas             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT acuerdo_versiones_estado_valid CHECK (estado IN ('activo','cerrado','anulado')),
  CONSTRAINT acuerdo_versiones_version_positive CHECK (version > 0),
  CONSTRAINT acuerdo_versiones_unique UNIQUE (installation_id, version),
  -- Coherencia: si estado='cerrado' debe tener fecha_cierre y snapshot
  CONSTRAINT acuerdo_versiones_cerrado_coherente CHECK (
    (estado <> 'cerrado') OR (fecha_cierre IS NOT NULL AND snapshot IS NOT NULL)
  )
);

-- Solo UNA versión activa por instalación
CREATE UNIQUE INDEX idx_acuerdo_versiones_activa_unica
  ON public.acuerdo_versiones(installation_id)
  WHERE estado = 'activo';

CREATE INDEX idx_acuerdo_versiones_empresa ON public.acuerdo_versiones(empresa_id);
CREATE INDEX idx_acuerdo_versiones_installation ON public.acuerdo_versiones(installation_id);

COMMENT ON TABLE public.acuerdo_versiones IS
  'Versiones del acuerdo de reparto. Al cerrar, snapshot jsonb captura estado inmutable.';

CREATE TRIGGER trg_acuerdo_versiones_updated_at
  BEFORE UPDATE ON public.acuerdo_versiones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_acuerdo_versiones_audit_fields
  BEFORE INSERT OR UPDATE ON public.acuerdo_versiones
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- ------------------------------------------------------------
-- Tabla: documents
-- Un documento por (instalación, cliente, tipo, versión_acuerdo).
-- Incluye referencias a Supabase Storage para los PDFs generado
-- y firmado (con hash SHA-256 para trazabilidad legal).
-- ------------------------------------------------------------
CREATE TABLE public.documents (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  installation_id           uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  client_id                 uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  version_acuerdo_id        uuid REFERENCES public.acuerdo_versiones(id) ON DELETE SET NULL,

  tipo                      text NOT NULL,
  estado                    text NOT NULL DEFAULT 'generado',
  version_acuerdo           integer,

  -- Supabase Storage — PDF generado por la aplicación
  storage_path_generado     text,
  hash_generado             text,  -- SHA-256 en hex del contenido del PDF
  size_bytes_generado       bigint,

  -- Supabase Storage — PDF firmado subido por el cliente
  storage_path_firmado      text,
  hash_firmado              text,
  size_bytes_firmado        bigint,

  -- Fechas clave
  generado_en               timestamptz,
  enviado_en                timestamptz,
  firmado_en                timestamptz,

  -- Metadata
  notas                     text,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT documents_tipo_valid CHECK (
    tipo IN ('acuerdo_reparto','autorizacion_gestor','mandamiento_sepa','acuerdo_reparto_colectivo')
  ),
  CONSTRAINT documents_estado_valid CHECK (
    estado IN ('generado','enviado','firmado','anulado')
  ),
  CONSTRAINT documents_hash_generado_format CHECK (
    hash_generado IS NULL OR hash_generado ~ '^[a-f0-9]{64}$'
  ),
  CONSTRAINT documents_hash_firmado_format CHECK (
    hash_firmado IS NULL OR hash_firmado ~ '^[a-f0-9]{64}$'
  ),
  -- Un documento único por (instalación, cliente, tipo, versión)
  -- Para el acuerdo colectivo (sin client) permitimos NULL client_id con tipo único por versión
  CONSTRAINT documents_unique_per_cliente
    UNIQUE (installation_id, client_id, tipo, version_acuerdo)
);

CREATE INDEX idx_documents_empresa ON public.documents(empresa_id);
CREATE INDEX idx_documents_installation ON public.documents(installation_id);
CREATE INDEX idx_documents_client ON public.documents(client_id) WHERE client_id IS NOT NULL;
CREATE INDEX idx_documents_estado ON public.documents(installation_id, estado);
CREATE INDEX idx_documents_version ON public.documents(version_acuerdo_id) WHERE version_acuerdo_id IS NOT NULL;

COMMENT ON TABLE public.documents IS
  'Documentos firmables por partícipe. storage_path_* apuntan a Supabase Storage. hash_* permiten verificar integridad legal.';

CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_documents_audit_fields
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

COMMIT;
