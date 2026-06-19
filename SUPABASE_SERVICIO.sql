-- SUPABASE_SERVICIO.sql
-- Agrega la columna servicio a leads. Poblada por el classifier LLM (n8n),
-- no por phone_from. Valores canonicos: 'carnet' | 's&h' | NULL.
-- Idempotente. Sin CHECK: el parser de classifierParser.ts normaliza/valida
-- el dominio antes de escribir (single gate). Ver ADR-1 del design.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS servicio text;
