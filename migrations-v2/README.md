# Migrations v2 — Schema unificado con multi-tenant y auditoría

Estas migraciones construyen desde cero el schema del proyecto Supabase **nuevo** (v2). No son aplicables al proyecto v1 — es una reescritura completa.

## Cómo aplicar

**Orden estricto** (no saltes ficheros). Cada uno es un bloque transaccional (BEGIN/COMMIT): si falla, no deja estado a medias.

1. Abre el **SQL Editor** del proyecto Supabase nuevo
2. Copia y pega el contenido del fichero
3. Ejecuta
4. Si sale OK, siguiente fichero

### Archivos en orden

| # | Archivo | Qué hace |
|---|---------|----------|
| 1 | `001_setup.sql` | Extensiones y funciones helper globales |
| 2 | `002_empresas_users.sql` | Tabla `empresas`, `user_empresas`, funciones de rol |
| 3 | `003_catalogos.sql` | `distribuidoras` (catálogo global con seeds) |
| 4 | `004_clients.sql` | Tabla `clients` con PII |
| 5 | `005_installations.sql` | `installations` y `participes` |
| 6 | `006_studies.sql` | `studies` y `installation_reservations` |
| 7 | `007_documents.sql` | `document_templates`, `documents`, `acuerdo_versiones` |
| 8 | `008_audit.sql` | `audit_log` y triggers de auditoría |
| 9 | `009_storage.sql` | Buckets de Storage y policies |
| 10 | `010_rls.sql` | Todas las RLS policies + GRANTs finales |
| 11 | `011_seed.sql` | Empresa Sapiens + tu usuario como admin + plantillas |

## Principios de diseño

- **Multi-tenant** con columna `empresa_id` en todas las tablas con PII, aunque por ahora solo exista Sapiens.
- **Auditoría completa**: `created_at`, `updated_at`, `created_by`, `updated_by` en todas las tablas, más un `audit_log` inmutable para acciones sensibles.
- **RLS real** basado en `user_empresas` (no más `USING (true)`).
- **Roles**: `admin`, `gestor`, `lectura` con jerarquía.
- **Sin GRANT a `anon`** — solo `authenticated`.
- **Constraints fuertes**: CHECK, UNIQUE, FK con ON DELETE apropiado.
- **Idempotencia**: las migrations fallan limpias si ya se han aplicado (no se rehacen silenciosamente).

## Rollback

Si algo sale mal en medio, ejecuta al final del SQL Editor:

```sql
-- EMERGENCIA: borra todo el schema public y empieza de cero
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO authenticated;
```

> ⚠️ Esto borra también `supabase`-specific objects que viven en `public`. Si ocurre en producción, Supabase Soporte puede restaurar desde PITR. Pero en el proyecto v2 actual no hay datos: empezar de cero es seguro.
