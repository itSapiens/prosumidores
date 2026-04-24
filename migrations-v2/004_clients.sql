-- ============================================================
-- 004_clients.sql — Clientes (consumidores con PII)
-- ============================================================
-- Datos personales de los clientes de la empresa. Tabla con
-- alto valor PII (DNI, IBAN, email, teléfono, dirección).
-- Acceso restringido por RLS a la empresa dueña.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabla: clients
-- ------------------------------------------------------------
CREATE TABLE public.clients (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                 uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,

  -- Datos personales
  nombre                     text NOT NULL DEFAULT '',
  apellidos                  text NOT NULL DEFAULT '',
  dni                        text NOT NULL,
  email                      citext NOT NULL DEFAULT '',
  telefono                   text NOT NULL DEFAULT '',

  -- Dirección postal
  direccion_completa         text NOT NULL DEFAULT '',
  codigo_postal              text NOT NULL DEFAULT '',
  poblacion                  text NOT NULL DEFAULT '',
  provincia                  text NOT NULL DEFAULT '',

  -- Datos eléctricos y bancarios
  cups                       text,
  iban                       text,
  bic                        text,
  tipo_factura               text,
  consumo_mensual_real_kwh   numeric,
  consumo_medio_mensual_kwh  numeric,
  precio_p1_eur_kwh          numeric,
  precio_p2_eur_kwh          numeric,
  precio_p3_eur_kwh          numeric,
  precio_p4_eur_kwh          numeric,
  precio_p5_eur_kwh          numeric,
  precio_p6_eur_kwh          numeric,

  -- Metadata
  notas                      text,
  active                     boolean NOT NULL DEFAULT true,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  created_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                 uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- DNI único por empresa (permite que distintas empresas tengan el mismo cliente)
  CONSTRAINT clients_empresa_dni_unique UNIQUE (empresa_id, dni),
  CONSTRAINT clients_dni_not_empty CHECK (length(trim(dni)) > 0),
  CONSTRAINT clients_tipo_factura_valid CHECK (
    tipo_factura IS NULL OR tipo_factura IN ('2.0TD','3.0TD','6.1TD','2TD','3TD')
  ),
  CONSTRAINT clients_cups_format CHECK (
    cups IS NULL OR cups ~ '^[A-Z]{2}[0-9]{16}[A-Z]{2}[0-9FP]?$'
  )
);

-- Índices para queries frecuentes
CREATE INDEX idx_clients_empresa ON public.clients(empresa_id);
CREATE INDEX idx_clients_dni ON public.clients(dni);
CREATE INDEX idx_clients_active ON public.clients(empresa_id, active) WHERE active = true;
CREATE INDEX idx_clients_cups ON public.clients(cups) WHERE cups IS NOT NULL;

COMMENT ON TABLE public.clients IS
  'Clientes/consumidores. PII: nombre, apellidos, DNI, email, teléfono, dirección, IBAN. Aislado por empresa_id.';

COMMENT ON COLUMN public.clients.dni IS
  'DNI/NIF/NIE. Único por empresa (empresa_id, dni). Guardado en texto plano por requisito funcional. Considerar cifrado columnar si aumenta sensibilidad.';

COMMENT ON COLUMN public.clients.iban IS
  'IBAN completo. Validar formato en aplicación antes de insertar.';

-- Triggers
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_clients_audit_fields
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

COMMIT;
