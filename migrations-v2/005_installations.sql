-- ============================================================
-- 005_installations.sql — Instalaciones y partícipes
-- ============================================================
-- installations: proyectos de autoconsumo colectivo
-- participes: relación N-N con clientes + coeficiente de reparto
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabla: installations
-- ------------------------------------------------------------
CREATE TABLE public.installations (
  id                                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                           uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,

  -- Identificación
  nombre_instalacion                   text NOT NULL,
  cups_generador                       text,
  distribuidora_id                     uuid REFERENCES public.distribuidoras(id) ON DELETE SET NULL,

  -- Ubicación
  direccion                            text NOT NULL DEFAULT '',
  municipio                            text NOT NULL DEFAULT '',
  codigo_postal                        text NOT NULL DEFAULT '',
  provincia                            text NOT NULL DEFAULT '',
  lat                                  numeric,
  lng                                  numeric,

  -- Parámetros técnicos
  potencia_instalada_kwp               numeric NOT NULL,
  potencia_nominal_kw                  numeric,
  inclinacion                          numeric,
  orientacion                          text,
  almacenamiento_kwh                   numeric,
  horas_efectivas                      numeric,
  porcentaje_autoconsumo               numeric,

  -- Parámetros económicos
  coste_anual_mantenimiento_por_kwp    numeric,
  coste_kwh_inversion                  numeric,
  coste_kwh_servicio                   numeric,
  modalidad                            text,

  -- Reserva
  reserva                              text,
  reserva_fija_eur                     numeric,
  iban_aportaciones                    text,

  -- Cálculo de estudios / potencia contratable
  calculo_estudios                     text,
  potencia_fija_kwp                    numeric,
  potencia_minima_kwp                  numeric,
  contractable_kwp_total               numeric,

  -- Reparto
  tipo_reparto                         text NOT NULL DEFAULT 'fijo',

  -- Fechas
  fecha_activacion                     date,
  fecha_activacion_real                date,

  -- Metadata
  notas                                text,
  active                               boolean NOT NULL DEFAULT true,
  created_at                           timestamptz NOT NULL DEFAULT now(),
  updated_at                           timestamptz NOT NULL DEFAULT now(),
  created_by                           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                           uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT installations_nombre_not_empty CHECK (length(trim(nombre_instalacion)) > 0),
  CONSTRAINT installations_potencia_positive CHECK (potencia_instalada_kwp > 0),
  CONSTRAINT installations_tipo_reparto_valid CHECK (tipo_reparto IN ('fijo','dinamico')),
  CONSTRAINT installations_modalidad_valid CHECK (
    modalidad IS NULL OR modalidad IN ('Inversion','Servicio','Ambas','inversion','servicio','ambas')
  ),
  CONSTRAINT installations_reserva_valid CHECK (
    reserva IS NULL OR reserva IN ('segun_potencia','fijo')
  ),
  CONSTRAINT installations_calculo_estudios_valid CHECK (
    calculo_estudios IS NULL OR calculo_estudios IN ('segun_factura','fijo')
  ),
  CONSTRAINT installations_orientacion_valid CHECK (
    orientacion IS NULL OR orientacion IN ('sur','sureste','suroeste','este','oeste','norte','noreste','noroeste')
  ),
  CONSTRAINT installations_inclinacion_valid CHECK (
    inclinacion IS NULL OR (inclinacion >= 0 AND inclinacion <= 90)
  ),
  CONSTRAINT installations_autoconsumo_valid CHECK (
    porcentaje_autoconsumo IS NULL OR (porcentaje_autoconsumo >= 0 AND porcentaje_autoconsumo <= 100)
  ),
  CONSTRAINT installations_cups_format CHECK (
    cups_generador IS NULL OR cups_generador ~ '^[A-Z]{2}[0-9]{16}[A-Z]{2}[0-9FP]?$'
  )
);

CREATE INDEX idx_installations_empresa ON public.installations(empresa_id);
CREATE INDEX idx_installations_distribuidora ON public.installations(distribuidora_id);
CREATE INDEX idx_installations_active ON public.installations(empresa_id, active) WHERE active = true;
CREATE INDEX idx_installations_cups_generador ON public.installations(cups_generador) WHERE cups_generador IS NOT NULL;

COMMENT ON TABLE public.installations IS
  'Proyectos de autoconsumo colectivo. Aislado por empresa_id.';

CREATE TRIGGER trg_installations_updated_at
  BEFORE UPDATE ON public.installations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_installations_audit_fields
  BEFORE INSERT OR UPDATE ON public.installations
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- ------------------------------------------------------------
-- Tabla: participes
-- Relación N-N entre installations y clients con coeficiente.
-- La suma de coeficientes por installation debe = 1.000000.
-- (La validación de suma se hace en aplicación, PostgreSQL no
--  tiene forma nativa de forzar esto como constraint de tabla.)
-- ------------------------------------------------------------
CREATE TABLE public.participes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id           uuid NOT NULL REFERENCES public.empresas(id) ON DELETE RESTRICT,
  installation_id      uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  client_id            uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,

  -- Coeficiente entre 0.000000 y 1.000000 (6 decimales)
  coeficiente_reparto  numeric(8,6) NOT NULL DEFAULT 0,

  -- Soft delete (para no violar UNIQUE al eliminar y re-añadir)
  active               boolean NOT NULL DEFAULT true,

  -- Metadata
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT participes_coef_range CHECK (coeficiente_reparto >= 0 AND coeficiente_reparto <= 1)
);

-- Un cliente solo puede estar ACTIVO una vez por instalación
-- (permite tener registros inactivos históricos sin violar la regla)
CREATE UNIQUE INDEX idx_participes_active_unique
  ON public.participes(installation_id, client_id)
  WHERE active = true;

CREATE INDEX idx_participes_empresa ON public.participes(empresa_id);
CREATE INDEX idx_participes_installation ON public.participes(installation_id);
CREATE INDEX idx_participes_client ON public.participes(client_id);

COMMENT ON TABLE public.participes IS
  'Partícipes de una instalación con su coeficiente de reparto (0-1, 6 decimales). La suma por instalación debe = 1.';

CREATE TRIGGER trg_participes_updated_at
  BEFORE UPDATE ON public.participes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_participes_audit_fields
  BEFORE INSERT OR UPDATE ON public.participes
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

COMMIT;
