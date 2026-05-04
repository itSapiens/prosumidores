-- ============================================================
-- 023_reservations_participes_contract_rpc.sql
-- ============================================================
-- RPCs usadas por la pantalla de instalación/estudio para evitar
-- falsos 403 cuando los datos legacy tienen empresa_id desalineado
-- pero la instalación pertenece a una empresa gestionable por el usuario.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.update_installation_reservation(
  p_reservation_id uuid,
  p_payment_status text DEFAULT NULL,
  p_reservation_status text DEFAULT NULL
)
RETURNS SETOF public.installation_reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_installation_empresa_id uuid;
BEGIN
  IF p_payment_status IS NOT NULL
    AND p_payment_status NOT IN ('pending','signal_paid','paid','failed','refunded') THEN
    RAISE EXCEPTION 'Estado de pago no válido: %', p_payment_status
      USING ERRCODE = '22023';
  END IF;

  IF p_reservation_status IS NOT NULL
    AND p_reservation_status NOT IN ('pending_payment','paid','confirmed','released','cancelled','rejected') THEN
    RAISE EXCEPTION 'Estado de reserva no válido: %', p_reservation_status
      USING ERRCODE = '22023';
  END IF;

  SELECT i.empresa_id
    INTO v_installation_empresa_id
  FROM public.installation_reservations ir
  JOIN public.installations i ON i.id = ir.installation_id
  WHERE ir.id = p_reservation_id;

  IF v_installation_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_min_role(v_installation_empresa_id, 'gestor') THEN
    RAISE EXCEPTION 'No tienes permisos para actualizar esta reserva.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.installation_reservations ir
  SET
    payment_status = COALESCE(p_payment_status, ir.payment_status),
    reservation_status = COALESCE(p_reservation_status, ir.reservation_status),
    confirmed_at = CASE
      WHEN COALESCE(p_reservation_status, ir.reservation_status) = 'confirmed'
      THEN COALESCE(ir.confirmed_at, now())
      ELSE ir.confirmed_at
    END,
    released_at = CASE
      WHEN COALESCE(p_reservation_status, ir.reservation_status) = 'released'
      THEN COALESCE(ir.released_at, now())
      ELSE ir.released_at
    END
  WHERE ir.id = p_reservation_id
  RETURNING ir.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_participe_from_reservation(
  p_reservation_id uuid
)
RETURNS public.participes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_reservation public.installation_reservations%ROWTYPE;
  v_installation public.installations%ROWTYPE;
  v_participe public.participes%ROWTYPE;
  v_coef numeric(8,6);
BEGIN
  SELECT *
    INTO v_reservation
  FROM public.installation_reservations
  WHERE id = p_reservation_id;

  IF v_reservation.id IS NULL THEN
    RAISE EXCEPTION 'Reserva no encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.client_id IS NULL THEN
    RAISE EXCEPTION 'Esta reserva no tiene cliente vinculado.'
      USING ERRCODE = '23502';
  END IF;

  SELECT *
    INTO v_installation
  FROM public.installations
  WHERE id = v_reservation.installation_id;

  IF v_installation.id IS NULL THEN
    RAISE EXCEPTION 'Instalación no encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_min_role(v_installation.empresa_id, 'gestor') THEN
    RAISE EXCEPTION 'No tienes permisos para añadir partícipes en esta instalación.'
      USING ERRCODE = '42501';
  END IF;

  v_coef := CASE
    WHEN COALESCE(v_installation.potencia_instalada_kwp, 0) > 0
    THEN ROUND((v_reservation.reserved_kwp / v_installation.potencia_instalada_kwp)::numeric, 6)
    ELSE 0
  END;

  SELECT *
    INTO v_participe
  FROM public.participes
  WHERE installation_id = v_reservation.installation_id
    AND client_id = v_reservation.client_id
  ORDER BY active DESC, created_at DESC
  LIMIT 1;

  IF v_participe.id IS NOT NULL THEN
    IF v_participe.active THEN
      RETURN v_participe;
    END IF;

    UPDATE public.participes
    SET
      empresa_id = v_installation.empresa_id,
      active = true,
      coeficiente_reparto = v_coef
    WHERE id = v_participe.id
    RETURNING * INTO v_participe;

    RETURN v_participe;
  END IF;

  INSERT INTO public.participes (
    empresa_id,
    installation_id,
    client_id,
    coeficiente_reparto,
    active
  )
  VALUES (
    v_installation.empresa_id,
    v_reservation.installation_id,
    v_reservation.client_id,
    v_coef,
    true
  )
  RETURNING * INTO v_participe;

  RETURN v_participe;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_study_contract(
  p_study_id uuid
)
RETURNS SETOF public.contracts
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  SELECT *
  FROM public.contracts
  WHERE study_id = p_study_id
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.update_installation_reservation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_participe_from_reservation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_contract(uuid) TO authenticated;

COMMIT;
