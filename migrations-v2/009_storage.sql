-- ============================================================
-- 009_storage.sql — Buckets y policies de Storage
-- ============================================================
-- Crea los buckets para documentos generados y firmados.
-- Ambos privados: solo accesibles con signed URL o por usuarios
-- autenticados de la empresa dueña.
--
-- Organización de carpetas:
--   documentos-generados/{empresa_id}/{installation_id}/{document_id}.pdf
--   documentos-firmados/{empresa_id}/{installation_id}/{document_id}.pdf
--
-- RLS: un usuario solo puede leer/escribir archivos cuya ruta
-- empieza por un empresa_id al que pertenece.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Crear buckets (INSERT en storage.buckets, idempotente)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documentos-generados', 'documentos-generados', false, 10485760,
   ARRAY['application/pdf']::text[]),
  ('documentos-firmados',  'documentos-firmados',  false, 10485760,
   ARRAY['application/pdf','image/png','image/jpeg']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------
-- Limpiar policies por defecto (si las hubiera)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "documentos_generados_select" ON storage.objects;
DROP POLICY IF EXISTS "documentos_generados_insert" ON storage.objects;
DROP POLICY IF EXISTS "documentos_generados_update" ON storage.objects;
DROP POLICY IF EXISTS "documentos_generados_delete" ON storage.objects;
DROP POLICY IF EXISTS "documentos_firmados_select" ON storage.objects;
DROP POLICY IF EXISTS "documentos_firmados_insert" ON storage.objects;
DROP POLICY IF EXISTS "documentos_firmados_update" ON storage.objects;
DROP POLICY IF EXISTS "documentos_firmados_delete" ON storage.objects;

-- ------------------------------------------------------------
-- Policies: bucket documentos-generados
-- Cualquier usuario autenticado de la empresa puede CRUD sobre
-- los archivos cuya ruta empieza por su empresa_id.
-- ------------------------------------------------------------
CREATE POLICY "documentos_generados_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documentos-generados'
    AND (string_to_array(name, '/'))[1]::uuid = ANY(public.current_empresa_ids())
  );

CREATE POLICY "documentos_generados_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-generados'
    AND (string_to_array(name, '/'))[1]::uuid = ANY(public.current_empresa_ids())
  );

CREATE POLICY "documentos_generados_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'documentos-generados'
    AND (string_to_array(name, '/'))[1]::uuid = ANY(public.current_empresa_ids())
  );

CREATE POLICY "documentos_generados_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documentos-generados'
    AND (string_to_array(name, '/'))[1]::uuid = ANY(public.current_empresa_ids())
    AND public.has_min_role(
      (string_to_array(name, '/'))[1]::uuid,
      'admin'  -- Solo admin puede borrar generados (audit trail)
    )
  );

-- ------------------------------------------------------------
-- Policies: bucket documentos-firmados
-- Mismo patrón pero delete solo admin (los firmados son legales).
-- ------------------------------------------------------------
CREATE POLICY "documentos_firmados_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documentos-firmados'
    AND (string_to_array(name, '/'))[1]::uuid = ANY(public.current_empresa_ids())
  );

CREATE POLICY "documentos_firmados_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-firmados'
    AND (string_to_array(name, '/'))[1]::uuid = ANY(public.current_empresa_ids())
  );

-- Los firmados NO se pueden modificar una vez subidos (integridad legal)
-- UPDATE no se crea → bloqueado.

CREATE POLICY "documentos_firmados_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documentos-firmados'
    AND (string_to_array(name, '/'))[1]::uuid = ANY(public.current_empresa_ids())
    AND public.has_min_role(
      (string_to_array(name, '/'))[1]::uuid,
      'admin'
    )
  );

COMMIT;
