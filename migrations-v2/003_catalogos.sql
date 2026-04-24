-- ============================================================
-- 003_catalogos.sql — Catálogos globales
-- ============================================================
-- Tablas que NO pertenecen a ninguna empresa concreta.
-- Son catálogos compartidos y todo el mundo puede leerlos
-- (RLS permisiva en SELECT para authenticated).
-- Solo se modifican por service_role o migraciones.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabla: distribuidoras
-- Catálogo de distribuidoras eléctricas españolas.
-- ------------------------------------------------------------
CREATE TABLE public.distribuidoras (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  codigo      text NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT distribuidoras_codigo_unique UNIQUE (codigo),
  CONSTRAINT distribuidoras_codigo_valid CHECK (codigo ~ '^[a-z0-9_-]+$')
);

CREATE INDEX idx_distribuidoras_active ON public.distribuidoras(active) WHERE active = true;

COMMENT ON TABLE public.distribuidoras IS
  'Catálogo global de distribuidoras eléctricas. No tiene empresa_id (compartido).';

-- Trigger updated_at
CREATE TRIGGER trg_distribuidoras_updated_at
  BEFORE UPDATE ON public.distribuidoras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------
-- Seeds de distribuidoras
-- ------------------------------------------------------------
INSERT INTO public.distribuidoras (nombre, codigo) VALUES
  ('Endesa Distribución',    'endesa'),
  ('I-DE (Iberdrola)',       'ide'),
  ('Naturgy Distribución',   'naturgy'),
  ('UFD / Unión Fenosa',     'ufd'),
  ('E-Distribución',         'e_distribucion'),
  ('Viesgo Distribución',    'viesgo');

COMMIT;
