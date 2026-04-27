-- ============================================================
-- 018_empresa_management.sql
-- ============================================================
-- Permite que un admin cree empresas nuevas desde la app.
--
-- Problema: la RLS de `empresas` no tiene policy de INSERT, y la
-- de `user_empresas` exige `has_min_role(empresa_id, 'admin')`
-- para insertar. Cuando se crea una empresa nueva, todavía no
-- hay nadie admin → catch-22. Se resuelve con una RPC con
-- SECURITY DEFINER que crea empresa + memberships en una
-- operación atómica.
--
-- Comportamiento:
--   1. El usuario que llama debe ser admin en al menos UNA empresa
--      (de lo contrario, no puede crear nuevas).
--   2. Crea la empresa con los datos pasados.
--   3. Inserta al creador como admin de la nueva empresa.
--   4. Clona memberships: cada user con rol admin/gestor en
--      cualquier empresa actual queda con su MISMO rol en la
--      nueva (admins → admin, gestores → gestor). Lecturas no
--      se clonan (no hay caso real, pero queda explícito).
--
-- Esto implementa la decisión "todos los gestores actuales
-- tienen acceso automático a las nuevas comunidades".
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_empresa_with_memberships(
  p_nombre              text,
  p_cif                 text,
  p_direccion           text,
  p_municipio           text,
  p_codigo_postal       text,
  p_email               text,
  p_provincia           text DEFAULT '',
  p_telefono            text DEFAULT '',
  p_representante_legal text DEFAULT '',
  p_creditor_id_sepa    text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id    uuid;
  v_empresa_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado'
      USING ERRCODE = '42501';
  END IF;

  -- Solo users con rol 'admin' en alguna empresa pueden crear nuevas.
  -- Esto evita que cualquier authenticated cree empresas spam.
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_empresas
    WHERE user_id = v_user_id
      AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Solo administradores pueden crear nuevas empresas.'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Insertar empresa
  INSERT INTO public.empresas (
    nombre, cif, direccion, municipio, codigo_postal, email,
    provincia, telefono, representante_legal, creditor_id_sepa
  ) VALUES (
    btrim(p_nombre), upper(btrim(p_cif)), btrim(p_direccion),
    btrim(p_municipio), btrim(p_codigo_postal), lower(btrim(p_email)),
    btrim(p_provincia), btrim(p_telefono), btrim(p_representante_legal),
    upper(btrim(p_creditor_id_sepa))
  )
  RETURNING id INTO v_empresa_id;

  -- 2. Crear membership admin para el creador
  INSERT INTO public.user_empresas (user_id, empresa_id, role)
  VALUES (v_user_id, v_empresa_id, 'admin');

  -- 3. Clonar memberships de admins/gestores existentes en la nueva empresa.
  -- Si un user es admin en alguna empresa → admin en la nueva.
  -- Si solo es gestor (en ninguna admin) → gestor en la nueva.
  INSERT INTO public.user_empresas (user_id, empresa_id, role)
  SELECT
    user_id,
    v_empresa_id,
    CASE
      WHEN bool_or(role = 'admin')  THEN 'admin'
      WHEN bool_or(role = 'gestor') THEN 'gestor'
      ELSE 'lectura'
    END
  FROM public.user_empresas
  WHERE user_id <> v_user_id           -- el creador ya está añadido arriba
    AND role IN ('admin', 'gestor')    -- lecturas no se clonan
  GROUP BY user_id
  ON CONFLICT (user_id, empresa_id) DO NOTHING;

  RETURN v_empresa_id;
END;
$$;

COMMENT ON FUNCTION public.create_empresa_with_memberships(
  text, text, text, text, text, text, text, text, text, text
) IS
  'Crea una empresa nueva atómicamente: inserta empresa, añade al creador como admin, y clona memberships de admins/gestores existentes. Solo admins de alguna empresa pueden ejecutarla.';

GRANT EXECUTE ON FUNCTION public.create_empresa_with_memberships(
  text, text, text, text, text, text, text, text, text, text
) TO authenticated;

COMMIT;

-- ============================================================
-- Verificación (ejecutar aparte tras aplicar):
-- ============================================================
-- -- Antes de probar, asegúrate de estar autenticado como admin.
-- SELECT public.create_empresa_with_memberships(
--   'Comunidad Energética Test',  -- nombre
--   'X99999999',                   -- cif
--   'Calle de Prueba, 1',          -- direccion
--   'Valencia',                    -- municipio
--   '46000',                       -- codigo_postal
--   'test@ejemplo.com'             -- email
-- );
--
-- -- Después debería verse en empresas y los gestores actuales
-- -- deberían tener membership en la nueva:
-- SELECT e.nombre, count(ue.user_id) AS users
-- FROM public.empresas e
-- LEFT JOIN public.user_empresas ue ON ue.empresa_id = e.id
-- GROUP BY e.id, e.nombre;
