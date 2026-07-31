-- SUPABASE_PREVIO_PAGO_SEGUIMIENTO.sql
-- APLICADA en producción el 2026-07-31 (verificada: timestamp with time zone, nullable).
-- Marca en qué momento se le mandó a un lead el seguimiento de previo pago
-- (plantilla template_utility_20260730160029, cron de las 15hs AR).
--
-- Timestamp y no booleano: con la fecha sabés CUÁNDO salió y el filtro del cron
-- sigue siendo un simple IS NULL. NULL = todavía no se le mandó.
-- Sin backfill: los leads históricos quedan en NULL y el cron solo mira los del día.
-- Idempotente.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS seguimiento_previo_pago_enviado timestamptz;

-- El cron filtra por (etiqueta, created_at, seguimiento_previo_pago_enviado IS NULL).
CREATE INDEX IF NOT EXISTS idx_leads_previo_pago_seguimiento
  ON leads (etiqueta, created_at)
  WHERE seguimiento_previo_pago_enviado IS NULL;
