-- SUPABASE_PREVIO_PAGO_RESENA.sql
-- PENDIENTE DE APLICAR en producción.
-- Marca en qué momento se le pidió la reseña a un lead que SÍ completó el pago
-- (estado `approved` en optingsha.com.ar/estado.log). La manda el mismo cron de
-- previo pago (15hs y 21hs AR), fase 2.
--
-- Columna separada de `seguimiento_previo_pago_enviado` a propósito: son dos mensajes
-- distintos a dos poblaciones opuestas. Un mismo lead puede tener las dos columnas
-- llenas — abandonó el pago, recibió el recupero, después compró y recibió la reseña.
--
-- Timestamp y no booleano: con la fecha sabés CUÁNDO salió y el filtro del cron sigue
-- siendo un simple IS NULL. NULL = todavía no se le pidió.
-- Sin backfill: los compradores históricos quedan en NULL y el cron sólo mira la
-- ventana de compra (hoy + ayer), así que no se les va a pedir nada retroactivo.
-- Idempotente.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS resena_previo_pago_enviada timestamptz;

-- El claim de reseñas filtra por (id IN (...), resena_previo_pago_enviada IS NULL), y el
-- diagnóstico de fugas del recupero suma esta columna a su WHERE.
CREATE INDEX IF NOT EXISTS idx_leads_previo_pago_resena
  ON leads (etiqueta, created_at)
  WHERE resena_previo_pago_enviada IS NULL;
