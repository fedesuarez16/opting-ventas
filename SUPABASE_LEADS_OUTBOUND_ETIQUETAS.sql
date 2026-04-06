-- Etiquetas booleanas en leads_outbound (mostrar en UI columna "Etiqueta" cuando true)
-- Ejecutar en Supabase SQL Editor.

alter table public.leads_outbound
  add column if not exists llamada_agendada boolean not null default false,
  add column if not exists llamar boolean not null default false,
  add column if not exists deriva_humano boolean not null default false,
  add column if not exists presupuesto boolean not null default false,
  add column if not exists inspeccion boolean not null default false;

comment on column public.leads_outbound.llamada_agendada is 'Etiqueta: llamada agendada';
comment on column public.leads_outbound.llamar is 'Etiqueta: llamar';
comment on column public.leads_outbound.deriva_humano is 'Etiqueta: deriva humano';
comment on column public.leads_outbound.presupuesto is 'Etiqueta: presupuesto (flag; no confundir con monto)';
comment on column public.leads_outbound.inspeccion is 'Etiqueta: inspección';

alter table public.leads_outbound
  add column if not exists empleado boolean not null default false,
  add column if not exists dueno boolean not null default false;

comment on column public.leads_outbound.empleado is 'Etiqueta: empleado';
comment on column public.leads_outbound.dueno is 'Etiqueta: dueño';
