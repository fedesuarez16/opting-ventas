-- Migración: agrega flag booleano `lista_difusion` a public.leads
-- Aplicar manualmente desde el dashboard de Supabase (SQL Editor) o vía supabase CLI.
-- Idempotente: usa IF NOT EXISTS.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lista_difusion BOOLEAN NOT NULL DEFAULT false;

-- Índice parcial: la lista de difusión es siempre un subconjunto chico del total,
-- así que indexamos sólo los marcados true para acelerar el filtro de la página dedicada.
CREATE INDEX IF NOT EXISTS idx_leads_lista_difusion
  ON public.leads (id)
  WHERE lista_difusion = true;
