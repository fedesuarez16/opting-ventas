-- Migración: tabla seguimientos_syh
-- Cadencia multi-toque (T1 audio, T2/T3 HSM) para leads SYH (phone_from IS NULL)
-- Aplicar manualmente desde el dashboard Supabase (SQL editor).

CREATE TABLE IF NOT EXISTS public.seguimientos_syh (
  id                bigserial   PRIMARY KEY,
  lead_id           integer     NOT NULL
                      REFERENCES public.leads(id) ON DELETE CASCADE,
  phone             text        NOT NULL,
  toque             smallint    NOT NULL
                      CHECK (toque IN (1, 2, 3)),
  programado_para   timestamptz NOT NULL,
  estado            text        NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente','enviado','cerrado','error')),
  enviado_en        timestamptz,
  cerrado_en        timestamptz,
  cerrado_motivo    text,
  template_usado    text,
  ycloud_message_id text,
  retry_count       integer     NOT NULL DEFAULT 0,
  error_detalle     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seguimientos_syh_lead_toque_uniq UNIQUE (lead_id, toque)
);

CREATE INDEX IF NOT EXISTS idx_seguimientos_syh_pendientes
  ON public.seguimientos_syh (programado_para)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_seguimientos_syh_lead
  ON public.seguimientos_syh (lead_id);

-- updated_at trigger (mirror llamadas_agendadas)
CREATE OR REPLACE FUNCTION public.tg_seguimientos_syh_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seguimientos_syh_updated_at ON public.seguimientos_syh;
CREATE TRIGGER trg_seguimientos_syh_updated_at
  BEFORE UPDATE ON public.seguimientos_syh
  FOR EACH ROW EXECUTE FUNCTION public.tg_seguimientos_syh_set_updated_at();

-- RLS disabled for parity (matches llamadas_agendadas, leads, seguimientos)
ALTER TABLE public.seguimientos_syh DISABLE ROW LEVEL SECURITY;
