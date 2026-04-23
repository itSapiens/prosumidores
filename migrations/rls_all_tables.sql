-- ============================================================
-- RLS Policies para todas las tablas del backend de la app
-- ============================================================
-- Da acceso completo (SELECT/INSERT/UPDATE/DELETE) al rol
-- `authenticated` en todas las tablas que usa la aplicación.
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================

DO $$
DECLARE
  t text;
  tablas text[] := ARRAY[
    'installations',
    'installation_reservations',
    'participes',
    'clients',
    'studies',
    'documents',
    'document_templates',
    'distribuidoras',
    'empresa_config',
    'acuerdo_versiones'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    -- Habilitar RLS
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- Borrar policies antiguas con estos nombres (idempotente)
    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_update_%s" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_delete_%s" ON %I', t, t);

    -- Crear policies permisivas para authenticated
    EXECUTE format('CREATE POLICY "auth_select_%s" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "auth_insert_%s" ON %I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "auth_update_%s" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "auth_delete_%s" ON %I FOR DELETE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

-- ============================================================
-- Verificación: lista todas las policies creadas
-- ============================================================
SELECT tablename, policyname, cmd, roles
FROM pg_policies
WHERE tablename IN (
  'installations','installation_reservations','participes','clients',
  'studies','documents','document_templates','distribuidoras',
  'empresa_config','acuerdo_versiones'
)
ORDER BY tablename, cmd;
