-- ============================================================
-- 002_empresas_users.sql — Multi-tenant y roles
-- ============================================================
-- Tabla empresas (tenants) y tabla de pertenencia user_empresas
-- con rol. Funciones helper que usarán las policies RLS.
--
-- Jerarquía de roles (3 > 2 > 1):
--   admin   -> puede todo (gestionar empresa, usuarios, plantillas)
--   gestor  -> CRUD instalaciones, clientes, documentos
--   lectura -> solo SELECT
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Tabla: empresas (tenants)
-- ------------------------------------------------------------
CREATE TABLE public.empresas (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               text NOT NULL,
  cif                  text NOT NULL,
  direccion            text NOT NULL DEFAULT '',
  municipio            text NOT NULL DEFAULT '',
  codigo_postal        text NOT NULL DEFAULT '',
  provincia            text NOT NULL DEFAULT '',
  telefono             text NOT NULL DEFAULT '',
  email                citext NOT NULL DEFAULT '',
  representante_legal  text NOT NULL DEFAULT '',
  creditor_id_sepa     text NOT NULL DEFAULT '',
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT empresas_cif_unique UNIQUE (cif),
  CONSTRAINT empresas_cif_not_empty CHECK (length(trim(cif)) > 0),
  CONSTRAINT empresas_nombre_not_empty CHECK (length(trim(nombre)) > 0)
);

COMMENT ON TABLE public.empresas IS
  'Tenant. Cada empresa ve solo sus datos. En v2 inicial solo existe Sapiens.';

-- Trigger updated_at
CREATE TRIGGER trg_empresas_updated_at
  BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger audit fields (created_by/updated_by)
CREATE TRIGGER trg_empresas_audit_fields
  BEFORE INSERT OR UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_audit_fields();

-- ------------------------------------------------------------
-- Tabla: user_empresas (membership con role)
-- Un usuario puede pertenecer a 1 o más empresas con rol distinto
-- en cada una (aunque en v2 solo hay Sapiens).
-- ------------------------------------------------------------
CREATE TABLE public.user_empresas (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id  uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'lectura',
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  PRIMARY KEY (user_id, empresa_id),
  CONSTRAINT user_empresas_role_valid CHECK (role IN ('admin','gestor','lectura'))
);

CREATE INDEX idx_user_empresas_empresa ON public.user_empresas(empresa_id);

COMMENT ON TABLE public.user_empresas IS
  'Relación N-N entre auth.users y empresas con rol. Fuente de verdad para RLS.';

-- ------------------------------------------------------------
-- Función: current_empresa_ids()
-- Devuelve las empresas a las que pertenece el usuario autenticado.
-- SECURITY DEFINER para leer user_empresas sin rebotar contra su
-- propia RLS (evita recursión).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_empresa_ids()
RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT COALESCE(array_agg(empresa_id), ARRAY[]::uuid[])
  FROM public.user_empresas
  WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.current_empresa_ids() IS
  'Devuelve el array de empresa_id del usuario autenticado. Usar en RLS como: USING (empresa_id = ANY(current_empresa_ids())).';

-- ------------------------------------------------------------
-- Función: has_min_role(empresa_id, min_role)
-- Comprueba si el usuario tiene un rol >= min_role en la empresa.
-- Jerarquía: admin(3) > gestor(2) > lectura(1).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_min_role(p_empresa_id uuid, p_min_role text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_empresas
    WHERE user_id = auth.uid()
      AND empresa_id = p_empresa_id
      AND CASE role
            WHEN 'admin'   THEN 3
            WHEN 'gestor'  THEN 2
            WHEN 'lectura' THEN 1
            ELSE 0
          END
          >=
          CASE p_min_role
            WHEN 'admin'   THEN 3
            WHEN 'gestor'  THEN 2
            WHEN 'lectura' THEN 1
            ELSE 99
          END
  );
$$;

COMMENT ON FUNCTION public.has_min_role(uuid, text) IS
  'Usuario tiene rol >= p_min_role en la empresa. Ejemplo: has_min_role(empresa_id, ''gestor'').';

-- Permitir ejecutar las funciones al rol authenticated
GRANT EXECUTE ON FUNCTION public.current_empresa_ids()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_min_role(uuid,text) TO authenticated;

COMMIT;
