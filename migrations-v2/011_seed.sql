-- ============================================================
-- 011_seed.sql — Datos iniciales: Sapiens + tu usuario admin
-- ============================================================
-- SE EJECUTA AL FINAL, DESPUÉS DE HABER HECHO LOGIN AL MENOS UNA
-- VEZ con tu cuenta @sapiensenergia.es (para que exista un
-- registro en auth.users al que referenciar).
--
-- ANTES DE EJECUTAR:
-- 1) Cambia el valor de v_admin_email (línea ~15) por tu email
-- 2) Opcional: rellena los datos reales de Sapiens Energía
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_admin_email    text := 'CAMBIAME@sapiensenergia.es';  -- ← CAMBIA ESTO
  v_admin_user_id  uuid;
  v_empresa_id     uuid;
  v_distribuidora_id uuid;
BEGIN
  -- --------------------------------------------------------
  -- 1. Encontrar el user_id del admin por email
  -- --------------------------------------------------------
  SELECT id INTO v_admin_user_id
  FROM auth.users
  WHERE lower(email) = lower(v_admin_email);

  IF v_admin_user_id IS NULL THEN
    RAISE EXCEPTION 'No se encuentra usuario %. Haz login con esa cuenta primero y reintenta.', v_admin_email;
  END IF;

  -- --------------------------------------------------------
  -- 2. Insertar empresa Sapiens (si no existe ya por CIF)
  -- --------------------------------------------------------
  INSERT INTO public.empresas (
    nombre, cif, direccion, municipio, codigo_postal, provincia,
    telefono, email, representante_legal, creditor_id_sepa
  ) VALUES (
    'Sapiens Energía',
    'B00000000',             -- ← Pon el CIF real
    'Dirección sede',        -- ← Pon la dirección real
    'Municipio',
    '00000',
    'Provincia',
    '000000000',
    'info@sapiensenergia.es',
    'Representante Legal',   -- ← Pon el nombre real del representante
    'ES00ZZZ00000000'        -- ← Pon el Creditor ID SEPA real
  )
  ON CONFLICT (cif) DO UPDATE SET nombre = EXCLUDED.nombre
  RETURNING id INTO v_empresa_id;

  -- Si ya existía, obtener su id
  IF v_empresa_id IS NULL THEN
    SELECT id INTO v_empresa_id FROM public.empresas WHERE cif = 'B00000000';
  END IF;

  -- --------------------------------------------------------
  -- 3. Vincular usuario admin a la empresa como 'admin'
  -- --------------------------------------------------------
  INSERT INTO public.user_empresas (user_id, empresa_id, role)
  VALUES (v_admin_user_id, v_empresa_id, 'admin')
  ON CONFLICT (user_id, empresa_id) DO UPDATE SET role = 'admin';

  -- --------------------------------------------------------
  -- 4. Crear plantillas por defecto para cada distribuidora
  --    × cada tipo de documento (24 plantillas = 6 dists × 4 tipos)
  --    Contenido inicial vacío — se editan desde la UI después.
  -- --------------------------------------------------------
  FOR v_distribuidora_id IN SELECT id FROM public.distribuidoras LOOP
    INSERT INTO public.document_templates (empresa_id, distribuidora_id, tipo, contenido, version)
    VALUES
      (v_empresa_id, v_distribuidora_id, 'acuerdo_reparto',
        '[Plantilla pendiente de redactar]', 1),
      (v_empresa_id, v_distribuidora_id, 'autorizacion_gestor',
        '[Plantilla pendiente de redactar]', 1),
      (v_empresa_id, v_distribuidora_id, 'mandamiento_sepa',
        '[Plantilla pendiente de redactar]', 1),
      (v_empresa_id, v_distribuidora_id, 'acuerdo_reparto_colectivo',
        '[Plantilla pendiente de redactar]', 1)
    ON CONFLICT (empresa_id, distribuidora_id, tipo) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Seed completado. empresa_id=%, admin=%', v_empresa_id, v_admin_email;
END $$;

COMMIT;

-- ============================================================
-- Verificación (ejecutar aparte para comprobar)
-- ============================================================
-- SELECT e.nombre, ue.role, u.email
-- FROM public.empresas e
-- JOIN public.user_empresas ue ON ue.empresa_id = e.id
-- JOIN auth.users u ON u.id = ue.user_id;
--
-- SELECT count(*) as total_plantillas FROM public.document_templates;
-- -- debería devolver 24 (6 distribuidoras × 4 tipos)
