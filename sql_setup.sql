-- ============================================================
-- PROSUMIDORES — Script de configuración de base de datos
-- Ejecutar en Supabase → SQL Editor → New query
-- ============================================================

-- 1. Tabla distribuidoras
CREATE TABLE IF NOT EXISTS public.distribuidoras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  codigo text NOT NULL UNIQUE,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO public.distribuidoras (nombre, codigo) VALUES
  ('Endesa Distribución', 'endesa'),
  ('I-DE (Iberdrola)', 'ide'),
  ('Naturgy Distribución', 'naturgy'),
  ('UFD / Unión Fenosa', 'ufd')
ON CONFLICT (codigo) DO NOTHING;

-- 2. Añadir columnas a installations
ALTER TABLE public.installations
  ADD COLUMN IF NOT EXISTS cups_generador text,
  ADD COLUMN IF NOT EXISTS distribuidora_id uuid REFERENCES public.distribuidoras(id),
  ADD COLUMN IF NOT EXISTS tipo_reparto text DEFAULT 'fijo' CHECK (tipo_reparto IN ('fijo', 'dinamico')),
  ADD COLUMN IF NOT EXISTS fecha_activacion date;

-- 3. Tabla partícipes (relación instalación ↔ cliente con coeficiente)
CREATE TABLE IF NOT EXISTS public.participes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  coeficiente_reparto numeric(8,4) NOT NULL DEFAULT 0
    CHECK (coeficiente_reparto >= 0 AND coeficiente_reparto <= 100),
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(installation_id, client_id)
);

-- 4. Tabla plantillas de documentos
CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distribuidora_id uuid NOT NULL REFERENCES public.distribuidoras(id),
  tipo text NOT NULL CHECK (tipo IN ('acuerdo_reparto', 'autorizacion_gestor', 'mandamiento_sepa')),
  contenido text NOT NULL DEFAULT '',
  version integer DEFAULT 1,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(distribuidora_id, tipo)
);

-- 5. Tabla documentos generados
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL REFERENCES public.installations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('acuerdo_reparto', 'autorizacion_gestor', 'mandamiento_sepa')),
  estado text NOT NULL DEFAULT 'generado' CHECK (estado IN ('generado', 'enviado', 'firmado')),
  notas text,
  generado_en timestamptz DEFAULT now(),
  firmado_en timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 6. Tabla configuración de la empresa
CREATE TABLE IF NOT EXISTS public.empresa_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL DEFAULT 'Mi Empresa SL',
  cif text NOT NULL DEFAULT 'B00000000',
  direccion text NOT NULL DEFAULT '',
  municipio text NOT NULL DEFAULT '',
  codigo_postal text NOT NULL DEFAULT '',
  telefono text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  representante_legal text NOT NULL DEFAULT '',
  creditor_id_sepa text NOT NULL DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.empresa_config (nombre, cif, direccion, municipio, codigo_postal, representante_legal)
VALUES ('Mi Empresa SL', 'B00000000', 'C/ Ejemplo, 1', 'Madrid', '28001', 'Nombre Apellidos')
ON CONFLICT DO NOTHING;

-- 7. Trigger updated_at para participes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_participes_updated_at ON public.participes;
CREATE TRIGGER update_participes_updated_at
  BEFORE UPDATE ON public.participes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_document_templates_updated_at ON public.document_templates;
CREATE TRIGGER update_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_empresa_config_updated_at ON public.empresa_config;
CREATE TRIGGER update_empresa_config_updated_at
  BEFORE UPDATE ON public.empresa_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 8. Índices
CREATE INDEX IF NOT EXISTS idx_participes_installation ON public.participes(installation_id);
CREATE INDEX IF NOT EXISTS idx_participes_client ON public.participes(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_installation ON public.documents(installation_id);
CREATE INDEX IF NOT EXISTS idx_documents_client ON public.documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_estado ON public.documents(estado);
CREATE INDEX IF NOT EXISTS idx_document_templates_distribuidora ON public.document_templates(distribuidora_id);

-- 9. RLS (Row Level Security) — desactivado para uso interno
ALTER TABLE public.distribuidoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.participes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empresa_config ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para anon key (ajustar según autenticación)
CREATE POLICY "allow_all_distribuidoras" ON public.distribuidoras FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_participes" ON public.participes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_templates" ON public.document_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_empresa" ON public.empresa_config FOR ALL USING (true) WITH CHECK (true);

-- 10. Plantillas por defecto para todas las distribuidoras
DO $$
DECLARE
  dist_id uuid;
  dist_codigo text;
  dist_nombre text;
BEGIN
  FOR dist_id, dist_codigo, dist_nombre IN
    SELECT id, codigo, nombre FROM public.distribuidoras
  LOOP
    -- Acuerdo de reparto
    INSERT INTO public.document_templates (distribuidora_id, tipo, contenido)
    VALUES (dist_id, 'acuerdo_reparto',
'ACUERDO DE REPARTO DE ENERGÍA AUTOCONSUMIDA

En {{municipio}}, a {{fecha_generacion}}.

REUNIDOS

De una parte, D./Dña. {{nombre_participe}} {{apellidos_participe}}, con NIF/CIF {{dni_participe}}, titular del punto de suministro con CUPS {{cups_consumo}}, en adelante "el Consumidor Asociado".

De otra parte, {{nombre_empresa}}, con CIF {{cif_empresa}}, en calidad de promotor y gestor de la instalación de autoconsumo colectivo, en adelante "el Gestor".

EXPONEN

Que la instalación de generación con CUPS {{cups_generador}}, ubicada en {{direccion_instalacion}}, con una potencia instalada de {{potencia_kwp}} kWp, está acogida al régimen de autoconsumo colectivo según el Real Decreto 244/2019.

ACUERDAN

PRIMERO.- El Consumidor Asociado recibirá el {{coeficiente}}% de la energía horaria neta generada por la instalación compartida.

SEGUNDO.- El presente reparto tiene carácter {{tipo_reparto}} y será comunicado a {{nombre_distribuidora}} mediante los mecanismos establecidos en la normativa vigente.

TERCERO.- El presente acuerdo tendrá vigencia indefinida, pudiendo ser modificado o rescindido por cualquiera de las partes con un preaviso mínimo de 30 días.

Y en prueba de conformidad, firman el presente acuerdo en el lugar y fecha indicados.

_____________________________          _____________________________
El Consumidor Asociado                      El Gestor
{{nombre_participe}} {{apellidos_participe}}           {{representante_legal}}')
    ON CONFLICT (distribuidora_id, tipo) DO NOTHING;

    -- Autorización de gestor
    INSERT INTO public.document_templates (distribuidora_id, tipo, contenido)
    VALUES (dist_id, 'autorizacion_gestor',
'AUTORIZACIÓN DE GESTOR DE AUTOCONSUMO COLECTIVO

En {{municipio}}, a {{fecha_generacion}}.

DATOS DEL GESTOR
Empresa: {{nombre_empresa}}
CIF: {{cif_empresa}}
Dirección: {{direccion_empresa}}
Representante legal: {{representante_legal}}

DATOS DE LA INSTALACIÓN
CUPS generador: {{cups_generador}}
Dirección instalación: {{direccion_instalacion}}
Potencia instalada: {{potencia_kwp}} kWp
Distribuidora: {{nombre_distribuidora}}

AUTORIZACIÓN

El abajo firmante, D./Dña. {{nombre_participe}} {{apellidos_participe}}, con NIF {{dni_participe}}, titular del suministro con CUPS {{cups_consumo}}, como consumidor asociado a la instalación de autoconsumo colectivo indicada,

AUTORIZA

A {{nombre_empresa}}, con CIF {{cif_empresa}}, para que en su nombre y representación realice todas las gestiones necesarias ante {{nombre_distribuidora}} y demás organismos competentes relacionadas con la instalación de autoconsumo colectivo con CUPS {{cups_generador}}, incluyendo:

- La comunicación del acuerdo de reparto.
- La gestión de la compensación de excedentes.
- Cualquier trámite administrativo relacionado con el autoconsumo colectivo.

La presente autorización tiene vigencia indefinida y puede ser revocada mediante comunicación escrita con 30 días de antelación.

Firma del autorizante:

_____________________________
{{nombre_participe}} {{apellidos_participe}}
NIF: {{dni_participe}}')
    ON CONFLICT (distribuidora_id, tipo) DO NOTHING;

    -- Mandamiento SEPA
    INSERT INTO public.document_templates (distribuidora_id, tipo, contenido)
    VALUES (dist_id, 'mandamiento_sepa',
'MANDAMIENTO DE ADEUDO DIRECTO SEPA
Adeudo domiciliado básico (CORE)

REFERENCIA ÚNICA DE MANDATO (RUM): {{rum}}
Fecha de firma del mandato: {{fecha_generacion}}

DATOS DEL ACREEDOR
Nombre: {{nombre_empresa}}
Identificador de acreedor SEPA: {{creditor_id_sepa}}
Dirección: {{direccion_empresa}}

DATOS DEL DEUDOR
Nombre: {{nombre_participe}} {{apellidos_participe}}
NIF/CIF: {{dni_participe}}
Dirección: {{direccion_participe}}
IBAN: {{iban_participe}}
BIC/SWIFT: {{bic_participe}}

TIPO DE PAGO: Recurrente

AUTORIZACIÓN

Mediante la firma del presente mandato, el deudor autoriza al acreedor a enviar instrucciones a la entidad financiera del deudor para adeudar su cuenta, y a dicha entidad financiera para efectuar los adeudos en su cuenta, de conformidad con las instrucciones del acreedor.

El deudor tiene derecho a obtener el reembolso de dicho adeudo en su entidad financiera en los términos y condiciones del contrato suscrito con la misma. La solicitud de reembolso debe efectuarse en el plazo de 8 semanas a partir de la fecha del adeudo.

CONCEPTO: Cuota de gestión autoconsumo colectivo — Instalación {{cups_generador}}

Firma del deudor:

_____________________________
{{nombre_participe}} {{apellidos_participe}}
NIF: {{dni_participe}}')
    ON CONFLICT (distribuidora_id, tipo) DO NOTHING;
  END LOOP;
END $$;

-- ============================================================
-- FIN DEL SCRIPT
-- Tablas creadas: distribuidoras, participes, document_templates,
-- documents, empresa_config
-- Columnas añadidas a installations: cups_generador,
-- distribuidora_id, tipo_reparto, fecha_activacion
-- ============================================================
