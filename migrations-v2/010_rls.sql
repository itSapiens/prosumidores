-- ============================================================
-- 010_rls.sql — Row Level Security policies
-- ============================================================
-- Activa RLS en todas las tablas y define policies basadas en
-- user_empresas. Sin GRANT a `anon`: solo `authenticated`
-- puede acceder, y solo a filas de empresas a las que pertenece.
--
-- Matriz de permisos por rol:
--   admin   → CRUD empresa/users/templates + todo lo de gestor
--   gestor  → CRUD installations, clients, participes, studies,
--             reservations, documents
--   lectura → SELECT únicamente
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- GRANTs a nivel tabla (complementa RLS)
-- ------------------------------------------------------------
-- Catálogos globales: read para todos los authenticated
GRANT SELECT ON public.distribuidoras TO authenticated;

-- Tablas con RLS: full DML al rol authenticated, pero RLS filtra
GRANT SELECT, INSERT, UPDATE, DELETE ON public.empresas           TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_empresas      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installations      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participes         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.studies            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.installation_reservations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acuerdo_versiones  TO authenticated;

-- Audit log: SELECT solo (solo el trigger SECURITY DEFINER escribe)
GRANT SELECT ON public.audit_log TO authenticated;
GRANT USAGE ON SEQUENCE public.audit_log_id_seq TO authenticated;

-- Secuencias que las tablas puedan necesitar
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- ------------------------------------------------------------
-- ENABLE RLS en todas las tablas
-- ------------------------------------------------------------
ALTER TABLE public.empresas                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_empresas               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.distribuidoras              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installations               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studies                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.installation_reservations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acuerdo_versiones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                   ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Policies: empresas
-- ============================================================
-- SELECT: usuario ve su(s) empresa(s)
CREATE POLICY "empresas_select" ON public.empresas
  FOR SELECT TO authenticated
  USING (id = ANY(public.current_empresa_ids()));

-- UPDATE: solo admin
CREATE POLICY "empresas_update" ON public.empresas
  FOR UPDATE TO authenticated
  USING (id = ANY(public.current_empresa_ids()) AND public.has_min_role(id,'admin'))
  WITH CHECK (id = ANY(public.current_empresa_ids()) AND public.has_min_role(id,'admin'));

-- INSERT / DELETE: no permitido desde la app (solo migraciones / service_role)

-- ============================================================
-- Policies: user_empresas
-- ============================================================
-- SELECT: un usuario ve sus propias pertenencias + admins ven todas las de su empresa
CREATE POLICY "user_empresas_select" ON public.user_empresas
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'))
  );

-- INSERT/UPDATE/DELETE: solo admin de la empresa
CREATE POLICY "user_empresas_insert" ON public.user_empresas
  FOR INSERT TO authenticated
  WITH CHECK (public.has_min_role(empresa_id,'admin'));

CREATE POLICY "user_empresas_update" ON public.user_empresas
  FOR UPDATE TO authenticated
  USING (public.has_min_role(empresa_id,'admin'))
  WITH CHECK (public.has_min_role(empresa_id,'admin'));

CREATE POLICY "user_empresas_delete" ON public.user_empresas
  FOR DELETE TO authenticated
  USING (public.has_min_role(empresa_id,'admin'));

-- ============================================================
-- Policies: distribuidoras (catálogo global read-only)
-- ============================================================
CREATE POLICY "distribuidoras_select" ON public.distribuidoras
  FOR SELECT TO authenticated
  USING (true);
-- Sin INSERT/UPDATE/DELETE policies → solo service_role puede modificar

-- ============================================================
-- Macro para tablas tenant-isolated con CRUD por rol
-- ============================================================
-- Patrón repetido:
--   SELECT  → lectura (rol lectura+)
--   INSERT  → gestor+
--   UPDATE  → gestor+
--   DELETE  → admin (datos sensibles) o gestor+ según tabla

-- clients
CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));

-- installations
CREATE POLICY "installations_select" ON public.installations FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "installations_insert" ON public.installations FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "installations_update" ON public.installations FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "installations_delete" ON public.installations FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));

-- participes
CREATE POLICY "participes_select" ON public.participes FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "participes_insert" ON public.participes FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "participes_update" ON public.participes FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "participes_delete" ON public.participes FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));

-- studies
CREATE POLICY "studies_select" ON public.studies FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "studies_insert" ON public.studies FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "studies_update" ON public.studies FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "studies_delete" ON public.studies FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));

-- installation_reservations
CREATE POLICY "reservations_select" ON public.installation_reservations FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "reservations_insert" ON public.installation_reservations FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "reservations_update" ON public.installation_reservations FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "reservations_delete" ON public.installation_reservations FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));

-- document_templates (solo admin puede modificar; todos leen los de su empresa)
CREATE POLICY "templates_select" ON public.document_templates FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "templates_insert" ON public.document_templates FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));
CREATE POLICY "templates_update" ON public.document_templates FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));
CREATE POLICY "templates_delete" ON public.document_templates FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));

-- documents
CREATE POLICY "documents_select" ON public.documents FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "documents_insert" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "documents_update" ON public.documents FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "documents_delete" ON public.documents FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));

-- acuerdo_versiones (cerrar versión / crear nueva = gestor+; anular = admin)
CREATE POLICY "acuerdo_versiones_select" ON public.acuerdo_versiones FOR SELECT TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()));
CREATE POLICY "acuerdo_versiones_insert" ON public.acuerdo_versiones FOR INSERT TO authenticated
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "acuerdo_versiones_update" ON public.acuerdo_versiones FOR UPDATE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'))
  WITH CHECK (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'gestor'));
CREATE POLICY "acuerdo_versiones_delete" ON public.acuerdo_versiones FOR DELETE TO authenticated
  USING (empresa_id = ANY(public.current_empresa_ids()) AND public.has_min_role(empresa_id,'admin'));

-- ============================================================
-- Policies: audit_log (solo SELECT, nunca UPDATE/DELETE)
-- ============================================================
CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT TO authenticated
  USING (
    empresa_id = ANY(public.current_empresa_ids())
    AND public.has_min_role(empresa_id,'admin')  -- solo admins leen auditoría
  );
-- Sin INSERT/UPDATE/DELETE: el trigger SECURITY DEFINER es el único que escribe.

COMMIT;
