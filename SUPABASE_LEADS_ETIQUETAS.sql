-- Etiquetas booleanas en public.leads (tabla inbound).
-- `presupuesto` en leads es numérico; el flag de etiqueta va en presupuesto_etiqueta.

alter table public.leads
  add column if not exists llamada_agendada boolean not null default false,
  add column if not exists llamar boolean not null default false,
  add column if not exists deriva_humano boolean not null default false,
  add column if not exists presupuesto_etiqueta boolean not null default false,
  add column if not exists inspeccion boolean not null default false;

comment on column public.leads.llamada_agendada is 'Etiqueta: llamada agendada';
comment on column public.leads.llamar is 'Etiqueta: llamar';
comment on column public.leads.deriva_humano is 'Etiqueta: deriva humano';
comment on column public.leads.presupuesto_etiqueta is 'Etiqueta presupuesto (flag); ver columna presupuesto para monto';
comment on column public.leads.inspeccion is 'Etiqueta: inspección';
