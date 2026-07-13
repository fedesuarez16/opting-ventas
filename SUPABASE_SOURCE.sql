-- SUPABASE_SOURCE.sql
-- Agrega la columna source a leads. Poblada por n8n (Parsear Mensaje1):
-- 'meta' si el inbound YCloud trae whatsappInboundMessage.referral (Meta CTWA),
-- 'google' en cualquier otro caso. NULL = histórico sin captura (sin backfill).
-- Idempotente. Sin CHECK: dominio validado en n8n. Ver ADR-1/ADR-2.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source text;
