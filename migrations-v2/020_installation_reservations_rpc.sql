-- ============================================================
-- 020_installation_reservations_rpc.sql
-- ============================================================
-- Devuelve las reservas de una instalación enriquecidas con los
-- datos asociados de client y study.
-- Se expone como RPC para que el frontend no tenga que montar
-- varios SELECT ni depender de JOINs cliente-side.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_installation_reservations_by_installation(
  p_installation_id uuid
)
RETURNS TABLE (
  id uuid,
  empresa_id uuid,
  installation_id uuid,
  study_id uuid,
  client_id uuid,
  reserved_kwp numeric,
  reservation_status text,
  payment_status text,
  payment_deadline_at timestamptz,
  notas text,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  updated_by uuid,
  reserved_at timestamptz,
  confirmed_at timestamptz,
  released_at timestamptz,
  release_reason text,
  deadline_enforced boolean,
  signal_amount numeric,
  currency text,
  metadata jsonb,
  contract_id uuid,
  notes text,
  clients jsonb,
  studies jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
STABLE
AS $$
  WITH visible_installation AS (
    SELECT i.id
    FROM public.installations i
    WHERE i.id = p_installation_id
      AND i.empresa_id = ANY(public.current_empresa_ids())
  )
  SELECT
    ir.id,
    ir.empresa_id,
    ir.installation_id,
    ir.study_id,
    ir.client_id,
    ir.reserved_kwp,
    ir.reservation_status,
    ir.payment_status,
    ir.payment_deadline_at,
    COALESCE(ir.notas, ir.notes) AS notas,
    ir.created_at,
    ir.updated_at,
    ir.created_by,
    ir.updated_by,
    ir.reserved_at,
    ir.confirmed_at,
    ir.released_at,
    ir.release_reason,
    ir.deadline_enforced,
    ir.signal_amount,
    ir.currency,
    ir.metadata,
    ir.contract_id,
    COALESCE(ir.notes, ir.notas) AS notes,
    CASE
      WHEN c.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', c.id,
        'nombre', c.nombre,
        'apellidos', c.apellidos,
        'email', c.email,
        'dni', c.dni,
        'cups', c.cups
      )
    END AS clients,
    CASE
      WHEN s.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'customer', s.customer
      )
    END AS studies
  FROM visible_installation vi
  JOIN public.installation_reservations ir
    ON ir.installation_id = vi.id
  LEFT JOIN public.clients c
    ON c.id = ir.client_id
  LEFT JOIN public.studies s
    ON s.id = ir.study_id
  ORDER BY ir.created_at DESC;
$$;

COMMENT ON FUNCTION public.get_installation_reservations_by_installation(uuid) IS
  'RPC: devuelve las reservas de una instalación enriquecidas con clients/studies visibles para la empresa del usuario autenticado.';

GRANT EXECUTE ON FUNCTION public.get_installation_reservations_by_installation(uuid) TO authenticated;

COMMIT;
