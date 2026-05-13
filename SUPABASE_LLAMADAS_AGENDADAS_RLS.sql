-- Fix RLS para llamadas_agendadas.
-- Supabase habilita RLS por default en tablas nuevas y sin policies bloquea
-- todo desde el cliente con anon key.
--
-- ELEGIR UNA de las dos opciones:
--
-- Opción A (RECOMENDADA, alineada con el resto del CRM): deshabilitar RLS.
-- El frontend ya escribe directo con anon key como con leads / propiedades.

ALTER TABLE llamadas_agendadas DISABLE ROW LEVEL SECURITY;


-- Opción B: dejar RLS habilitado y crear policies abiertas para anon/authenticated.
-- Si preferís esta, comentá la línea de arriba y descomentá el bloque de abajo.

-- ALTER TABLE llamadas_agendadas ENABLE ROW LEVEL SECURITY;
--
-- DROP POLICY IF EXISTS "llamadas_select_all"  ON llamadas_agendadas;
-- DROP POLICY IF EXISTS "llamadas_insert_all"  ON llamadas_agendadas;
-- DROP POLICY IF EXISTS "llamadas_update_all"  ON llamadas_agendadas;
-- DROP POLICY IF EXISTS "llamadas_delete_all"  ON llamadas_agendadas;
--
-- CREATE POLICY "llamadas_select_all" ON llamadas_agendadas
--   FOR SELECT TO anon, authenticated USING (true);
--
-- CREATE POLICY "llamadas_insert_all" ON llamadas_agendadas
--   FOR INSERT TO anon, authenticated WITH CHECK (true);
--
-- CREATE POLICY "llamadas_update_all" ON llamadas_agendadas
--   FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
--
-- CREATE POLICY "llamadas_delete_all" ON llamadas_agendadas
--   FOR DELETE TO anon, authenticated USING (true);
