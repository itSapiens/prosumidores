-- ============================================================
-- patch_legacy_storage_generador_propuestas.sql
-- ============================================================
-- Permite a usuarios autenticados LEER archivos del bucket legacy
-- `generador-propuestas-documentos`, usado por los estudios para
-- `clients/<slug>/factura.pdf` y `clients/<slug>/propuesta.pdf`.
--
-- Necesario para:
--   - storage.from(bucket).list(...)
--   - storage.from(bucket).createSignedUrl(...)
-- desde el frontend autenticado.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS "legacy_generador_propuestas_select" ON storage.objects;

CREATE POLICY "legacy_generador_propuestas_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'generador-propuestas-documentos'
  );

COMMIT;
