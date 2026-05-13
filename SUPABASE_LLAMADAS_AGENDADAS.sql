-- Migración: tabla llamadas_agendadas
-- Soporta la sección "Calendario de llamadas" (vista semanal en /calendario-llamadas)
-- Aplicar manualmente desde el dashboard Supabase (SQL editor).
-- pgcrypto is enabled by default in Supabase projects (gen_random_uuid available).

CREATE TABLE IF NOT EXISTS public.llamadas_agendadas (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         integer     REFERENCES public.leads(id) ON DELETE SET NULL,
  nombre_contacto text,
  titulo          text        NOT NULL,
  notas           text,
  inicio          timestamptz NOT NULL,
  fin             timestamptz NOT NULL,
  estado          text        NOT NULL DEFAULT 'agendada'
                  CHECK (estado IN ('agendada','realizada','cancelada')),
  resultado       text,
  agente          text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llamadas_agendadas_inicio
  ON public.llamadas_agendadas (inicio);

CREATE INDEX IF NOT EXISTS idx_llamadas_agendadas_lead_id
  ON public.llamadas_agendadas (lead_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_llamadas_agendadas_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_llamadas_agendadas_updated_at ON public.llamadas_agendadas;
CREATE TRIGGER trg_llamadas_agendadas_updated_at
  BEFORE UPDATE ON public.llamadas_agendadas
  FOR EACH ROW EXECUTE FUNCTION public.tg_llamadas_agendadas_set_updated_at();

-- RLS disabled for parity with the rest of the project's tables.
-- Frontend uses NEXT_PUBLIC_SUPABASE_ANON_KEY to read/write directly
-- (per llamadasService.ts); the new route handler is the only n8n entry point
-- and authenticates via X-Webhook-Secret.
ALTER TABLE public.llamadas_agendadas DISABLE ROW LEVEL SECURITY;
