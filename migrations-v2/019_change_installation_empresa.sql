-- ============================================================
-- 019_change_installation_empresa.sql
-- ============================================================
-- RPC para cambiar la empresa titular de una instalación ya
-- creada. La operación es atómica y cascade: actualiza
-- empresa_id en la propia installation y en TODAS las tablas
-- dependientes que también llevan empresa_id (participes,
-- studies, installation_reservations, documents, contracts,
-- acuerdo_versiones).
--
-- Restricciones:
--   - El caller debe tener rol 'gestor' o superior en LA EMPRESA
--     ORIGEN (puede modificar la instalación) Y en LA EMPRESA
--     DESTINO (puede asignársela). Esto evita "robar" instalaciones
--     o tirarlas a una empresa donde no tienes permiso.
--   - La instalación debe existir y la empresa destino también.
--
-- Notas de diseño:
--   - `clients` NO cambia de empresa: un cliente puede ser
--     partícipe en instalaciones de varias empresas. La RLS de
--     clients filtra por empresa_id propio del cliente, así que
--     mientras el user mantenga membership en la empresa
--     original del cliente, lo seguirá viendo.
--   - Los archivos en Storage NO se mueven (sus paths incluyen
--     el empresa_id antiguo). Mientras el user tenga membership
--     en ambas empresas, sigue accediendo. Si en el futuro hace
--     falta mover físicamente los blobs, se puede añadir un step
--     desde el cliente con storage.move().
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.change_installation_empresa(
  p_installation_id uuid,
  p_new_empresa_id  uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id        uuid;
  v_old_empresa_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Cargar empresa actual de la instalación
  SELECT empresa_id INTO v_old_empresa_id
  FROM public.installations
  WHERE id = p_installation_id;

  IF v_old_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Instalación no encontrada (id=%)', p_installation_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Si no hay cambio, no-op
  IF v_old_empresa_id = p_new_empresa_id THEN
    RETURN;
  END IF;

  -- 2. Verificar que la empresa destino existe y está activa
  IF NOT EXISTS (
    SELECT 1 FROM public.empresas
    WHERE id = p_new_empresa_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Empresa destino no encontrada o inactiva (id=%)', p_new_empresa_id
      USING ERRCODE = 'P0002';
  END IF;

  -- 3. Verificar permisos: rol 'gestor' o superior en AMBAS empresas
  IF NOT public.has_min_role(v_old_empresa_id, 'gestor') THEN
    RAISE EXCEPTION 'No tienes permisos en la empresa actual de la instalación.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_min_role(p_new_empresa_id, 'gestor') THEN
    RAISE EXCEPTION 'No tienes permisos en la empresa destino.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Actualizar empresa_id en cascade (todas las tablas que llevan
  -- empresa_id Y dependen de installation_id).
  --
  -- Orden: tablas hoja primero, installations al final.
  -- Aunque las RLS están activas, la función es SECURITY DEFINER
  -- y se ejecuta con permisos del owner → bypassa RLS para el
  -- cascade. El check de permisos (paso 3) ya se hizo arriba.

  UPDATE public.participes
     SET empresa_id = p_new_empresa_id
   WHERE installation_id = p_installation_id;

  UPDATE public.studies
     SET empresa_id = p_new_empresa_id
   WHERE selected_installation_id = p_installation_id;

  UPDATE public.installation_reservations
     SET empresa_id = p_new_empresa_id
   WHERE installation_id = p_installation_id;

  UPDATE public.documents
     SET empresa_id = p_new_empresa_id
   WHERE installation_id = p_installation_id;

  UPDATE public.acuerdo_versiones
     SET empresa_id = p_new_empresa_id
   WHERE installation_id = p_installation_id;

  -- contracts existe pero puede no tener filas (FK opcional según despliegue)
  UPDATE public.contracts
     SET empresa_id = p_new_empresa_id
   WHERE installation_id = p_installation_id;

  -- contract_access_tokens depende de contracts; refrescar también
  UPDATE public.contract_access_tokens t
     SET empresa_id = p_new_empresa_id
    FROM public.contracts c
   WHERE t.contract_id = c.id
     AND c.installation_id = p_installation_id;

  -- Finalmente la propia installation
  UPDATE public.installations
     SET empresa_id = p_new_empresa_id
   WHERE id = p_installation_id;
END;
$$;

COMMENT ON FUNCTION public.change_installation_empresa(uuid, uuid) IS
  'Cambia la empresa titular de una instalación y propaga el cambio a todas las tablas dependientes (participes, studies, reservations, documents, contracts, tokens, acuerdo_versiones). Requiere rol gestor+ en empresa origen y destino.';

GRANT EXECUTE ON FUNCTION public.change_installation_empresa(uuid, uuid) TO authenticated;

COMMIT;

-- ============================================================
-- Verificación (ejecutar tras aplicar):
-- ============================================================
-- -- Listar firma de la función:
-- SELECT proname, pg_get_function_identity_arguments(oid) AS args
-- FROM pg_proc
-- WHERE proname = 'change_installation_empresa';
--
-- -- Tras un cambio, comprobar consistencia:
-- SELECT 'installations' AS t, empresa_id FROM public.installations WHERE id = '<inst_id>'
-- UNION ALL
-- SELECT 'participes', empresa_id FROM public.participes WHERE installation_id = '<inst_id>' GROUP BY empresa_id
-- UNION ALL
-- SELECT 'studies', empresa_id FROM public.studies WHERE selected_installation_id = '<inst_id>' GROUP BY empresa_id
-- UNION ALL
-- SELECT 'reservations', empresa_id FROM public.installation_reservations WHERE installation_id = '<inst_id>' GROUP BY empresa_id
-- UNION ALL
-- SELECT 'documents', empresa_id FROM public.documents WHERE installation_id = '<inst_id>' GROUP BY empresa_id
-- UNION ALL
-- SELECT 'contracts', empresa_id FROM public.contracts WHERE installation_id = '<inst_id>' GROUP BY empresa_id;
-- -- Todas las filas deben mostrar el MISMO empresa_id.
