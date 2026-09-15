-- Fix RLS para las tablas del discador.
-- Mismo caso que SUPABASE_LLAMADAS_AGENDADAS_RLS.sql: Supabase habilita RLS por
-- default en tablas nuevas y sin policies bloquea todo desde el cliente con
-- anon key ("new row violates row-level security policy").
--
-- ELEGIR UNA de las dos opciones:
--
-- Opción A (RECOMENDADA, alineada con el resto del CRM): deshabilitar RLS.
-- El frontend escribe directo con anon key, como con leads / propiedades /
-- llamadas_agendadas.

ALTER TABLE public.contactos_discado  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sesiones_discado   DISABLE ROW LEVEL SECURITY;


-- Verificación: las dos filas tienen que salir con rowsecurity = false.
--   select tablename, rowsecurity
--   from pg_tables
--   where schemaname = 'public'
--     and tablename in ('contactos_discado','sesiones_discado','llamadas_agendadas');


-- Opción B: dejar RLS habilitado y crear policies abiertas para anon/authenticated.
-- Si preferís esta, comentá las dos líneas de arriba y descomentá este bloque.

-- ALTER TABLE public.contactos_discado ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.sesiones_discado  ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "contactos_discado_all" ON public.contactos_discado;
-- CREATE POLICY "contactos_discado_all" ON public.contactos_discado
--   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
--
-- DROP POLICY IF EXISTS "sesiones_discado_all" ON public.sesiones_discado;
-- CREATE POLICY "sesiones_discado_all" ON public.sesiones_discado
--   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
