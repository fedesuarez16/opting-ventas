-- PATCH para quien ya corrió la versión inicial de SUPABASE_LLAMADAS_AGENDADAS.sql.
-- Hace dos cosas:
--   1. Permite que lead_id sea NULL (para llamadas con "nombre libre" sin lead asociado).
--   2. Agrega la columna nombre_contacto y un CHECK que asegura que al menos uno de los dos esté presente.
-- Aplicar manualmente desde el dashboard Supabase (SQL editor).

ALTER TABLE llamadas_agendadas
  ALTER COLUMN lead_id DROP NOT NULL;

ALTER TABLE llamadas_agendadas
  ADD COLUMN IF NOT EXISTS nombre_contacto TEXT;

-- El CHECK no se puede agregar si ya hay filas que violarían la regla.
-- Como la versión anterior exigía lead_id NOT NULL, todas las filas existentes lo tienen,
-- así que el CHECK es seguro.
ALTER TABLE llamadas_agendadas
  DROP CONSTRAINT IF EXISTS llamadas_lead_o_nombre_check;

ALTER TABLE llamadas_agendadas
  ADD CONSTRAINT llamadas_lead_o_nombre_check
  CHECK (lead_id IS NOT NULL OR nombre_contacto IS NOT NULL);
