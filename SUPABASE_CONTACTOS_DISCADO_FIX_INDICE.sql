-- Fix: el índice único de teléfono no puede ser PARCIAL.
-- Aplicar manualmente desde el dashboard Supabase (SQL editor).
--
-- Se había creado con `WHERE telefono_e164 IS NOT NULL`. Postgres no acepta un
-- índice parcial para `ON CONFLICT (telefono_e164)` a menos que el INSERT
-- repita el mismo predicado, y supabase-js no lo manda: el upsert de la
-- importación fallaba con
--   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- El WHERE tampoco hacía falta: Postgres ya permite múltiples NULL en un índice
-- único, y la importación descarta los contactos sin teléfono válido.

DROP INDEX IF EXISTS public.uq_contactos_discado_telefono;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contactos_discado_telefono
  ON public.contactos_discado (telefono_e164);
