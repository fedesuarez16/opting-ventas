-- ===========================================================================
-- Migración completa del discador — correr TODO de una vez, en este orden.
-- Supabase → SQL Editor → pegar → Run.
--
-- Todo es idempotente (IF NOT EXISTS / OR REPLACE): si algún bloque ya se
-- aplicó antes, correrlo de nuevo no rompe nada.
-- ===========================================================================

-- ###########################################################################
-- ## SUPABASE_LLAMADAS_SALIENTES.sql
-- ###########################################################################

-- Migration: llamadas-salientes
-- Adds 4 nullable Twilio columns to llamadas_agendadas.
-- All columns are nullable — existing rows are unaffected.

ALTER TABLE llamadas_agendadas
  ADD COLUMN IF NOT EXISTS agente_telefono  text,
  ADD COLUMN IF NOT EXISTS twilio_call_sid  text,
  ADD COLUMN IF NOT EXISTS estado_twilio    text,
  ADD COLUMN IF NOT EXISTS grabacion_url    text;


-- ###########################################################################
-- ## SUPABASE_CONTACTOS_DISCADO.sql
-- ###########################################################################

-- Migración: base de discado (solapa "Base de discado" en /centro-comando-llamadas)
-- Aplicar manualmente desde el dashboard Supabase (SQL editor).
--
-- Los contactos importados NO son leads: `leadService.getAllLeads()` trae la
-- tabla `leads` COMPLETA a memoria del navegador en cada carga del CRM, así que
-- meter una base de discado ahí degrada kanban, dashboard y tabla de leads.
-- Por eso viven en su propia tabla.

CREATE TABLE IF NOT EXISTS public.contactos_discado (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text        NOT NULL,
  direccion       text,
  telefono_crudo  text        NOT NULL,
  -- NULL = no se pudo normalizar a un número argentino válido: no se puede discar.
  telefono_e164   text,
  tipo            text        CHECK (tipo IN ('movil','fijo')),
  -- true = hubo que adivinar (área faltante, o móvil/fijo no explícito en el origen).
  asumido         boolean     NOT NULL DEFAULT false,
  -- Nombre del lote de importación, para poder filtrar por tanda.
  lote            text,
  estado          text        NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','llamando','llamado','error','descartado')),
  ultima_llamada_id uuid      REFERENCES public.llamadas_agendadas(id) ON DELETE SET NULL,
  ultimo_error    text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Un mismo número no se importa dos veces, aunque venga en otro lote o formato.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contactos_discado_telefono
  ON public.contactos_discado (telefono_e164)
  WHERE telefono_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contactos_discado_estado
  ON public.contactos_discado (estado);

CREATE INDEX IF NOT EXISTS idx_contactos_discado_lote
  ON public.contactos_discado (lote);

CREATE OR REPLACE FUNCTION public.tg_contactos_discado_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contactos_discado_updated_at ON public.contactos_discado;
CREATE TRIGGER trg_contactos_discado_updated_at
  BEFORE UPDATE ON public.contactos_discado
  FOR EACH ROW EXECUTE FUNCTION public.tg_contactos_discado_set_updated_at();

-- RLS deshabilitado, igual que el resto de las tablas del proyecto.
ALTER TABLE public.contactos_discado DISABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Teléfono propio en llamadas_agendadas.
--
-- Hasta ahora el destino salía SIEMPRE de `leads.phone` vía el join. Un contacto
-- de la base de discado no tiene lead, así que la llamada necesita su propio
-- número. `lead_id` y `nombre_contacto` ya eran nullable: sólo faltaba esto.
-- ---------------------------------------------------------------------------

ALTER TABLE public.llamadas_agendadas
  ADD COLUMN IF NOT EXISTS telefono_destino  text,
  ADD COLUMN IF NOT EXISTS contacto_discado_id uuid
    REFERENCES public.contactos_discado(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_llamadas_agendadas_contacto_discado
  ON public.llamadas_agendadas (contacto_discado_id);


-- ###########################################################################
-- ## SUPABASE_SESIONES_DISCADO.sql
-- ###########################################################################

-- Migración: sesiones de discado con conferencia
-- Aplicar manualmente desde el dashboard Supabase (SQL editor).
-- Requiere SUPABASE_CONTACTOS_DISCADO.sql aplicado antes.
--
-- Una sesión = el agente entra UNA vez a una conferencia de Twilio y se queda.
-- El sistema disca contactos de a uno por atrás; el que atiende entra a la misma
-- conferencia. El agente nunca vuelve a escuchar un tono de llamada.

CREATE TABLE IF NOT EXISTS public.sesiones_discado (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agente_telefono   text        NOT NULL,
  -- Nombre de la sala en Twilio. Se deriva del id para que sea único.
  conference_name   text        NOT NULL UNIQUE,
  -- CallSid del leg del agente: sirve para colgarlo al detener la sesión.
  agente_call_sid   text,
  -- Lote de `contactos_discado` a recorrer. NULL = todos los pendientes.
  lote              text,
  estado            text        NOT NULL DEFAULT 'iniciando'
                    CHECK (estado IN ('iniciando','esperando_agente','activa','finalizada','error')),
  contacto_actual_id uuid       REFERENCES public.contactos_discado(id) ON DELETE SET NULL,
  llamadas_hechas   integer     NOT NULL DEFAULT 0,
  ultimo_error      text,
  finalizada_at     timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sesiones_discado_estado
  ON public.sesiones_discado (estado);

-- Cada llamada de la tanda queda atada a su sesión, para poder auditarla después.
ALTER TABLE public.llamadas_agendadas
  ADD COLUMN IF NOT EXISTS sesion_discado_id uuid
    REFERENCES public.sesiones_discado(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_llamadas_agendadas_sesion_discado
  ON public.llamadas_agendadas (sesion_discado_id);

CREATE OR REPLACE FUNCTION public.tg_sesiones_discado_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sesiones_discado_updated_at ON public.sesiones_discado;
CREATE TRIGGER trg_sesiones_discado_updated_at
  BEFORE UPDATE ON public.sesiones_discado
  FOR EACH ROW EXECUTE FUNCTION public.tg_sesiones_discado_set_updated_at();

ALTER TABLE public.sesiones_discado DISABLE ROW LEVEL SECURITY;


