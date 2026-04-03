-- Misma semántica que public.leads.chat_activo: 0 = activo, 1 = inactivo
alter table public.leads_outbound
  add column if not exists chat_activo smallint not null default 0;

comment on column public.leads_outbound.chat_activo is '0 = chat activo, 1 = chat inactivo';
