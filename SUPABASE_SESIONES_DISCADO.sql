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
