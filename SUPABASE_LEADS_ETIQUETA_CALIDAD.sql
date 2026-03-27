-- Columnas para la tabla de edición en /leads/tabla (etiqueta + calidad 1–3)
-- Ejecutar en Supabase SQL editor si aún no existen.

alter table public.leads
  add column if not exists etiqueta text null;

alter table public.leads
  add column if not exists calidad smallint null;

alter table public.leads drop constraint if exists leads_calidad_range;

alter table public.leads
  add constraint leads_calidad_range
  check (calidad is null or (calidad >= 1 and calidad <= 3));
