-- Migración: observación del contacto en la base de discado.
-- Aplicar manualmente desde el dashboard Supabase (SQL editor).
--
-- Las bases exportadas de la planilla traen una columna con el resultado de
-- llamadas anteriores ("no atiende", "mal numero", "no es el numero"). Ese es
-- trabajo ya hecho: se importa en vez de tirarse.

ALTER TABLE public.contactos_discado
  ADD COLUMN IF NOT EXISTS observacion text;
