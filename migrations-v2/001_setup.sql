-- ============================================================
-- 001_setup.sql — Extensiones y helpers globales
-- ============================================================
-- Se aplica UNA SOLA VEZ sobre un proyecto Supabase vacío.
-- Instala extensiones necesarias y define funciones helper
-- reutilizables por el resto de migraciones.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Extensiones
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";    -- gen_random_uuid(), digest() para hashes
CREATE EXTENSION IF NOT EXISTS "citext";      -- texto case-insensitive (emails, códigos)

-- ------------------------------------------------------------
-- Helper: set_updated_at
-- Trigger universal que actualiza la columna updated_at
-- en cada UPDATE de la fila.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'Trigger BEFORE UPDATE para mantener la columna updated_at sincronizada.';

-- ------------------------------------------------------------
-- Helper: set_audit_fields
-- Trigger que rellena created_by en INSERT y updated_by en UPDATE
-- usando auth.uid() del usuario que hace la operación.
-- Si la operación se hace con service_role o fuera de contexto
-- auth, auth.uid() será NULL y las columnas quedarán NULL
-- (aceptable para migraciones/seed).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by = COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by = NEW.created_by;
    NEW.created_at = COALESCE(NEW.created_at, now());
    NEW.updated_at = NEW.created_at;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by = auth.uid();
    NEW.updated_at = now();
    -- created_by / created_at nunca se modifican
    NEW.created_by = OLD.created_by;
    NEW.created_at = OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_audit_fields() IS
  'Trigger BEFORE INSERT/UPDATE: rellena created_by, updated_by, created_at, updated_at desde auth.uid().';

-- ------------------------------------------------------------
-- Revocar permisos por defecto al rol anon y public
-- Por convención Supabase deja public muy abierto. Cerramos todo
-- y concedemos explícitamente a authenticated en 010_rls.sql.
-- ------------------------------------------------------------
REVOKE ALL ON SCHEMA public FROM public;
REVOKE ALL ON SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Default privileges: nuevas tablas que se creen aquí en adelante
-- sólo darán permiso al rol authenticated (cuando se aplique RLS).
-- service_role siempre tiene todo (bypassa RLS).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, public;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, public;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, public;

COMMIT;
