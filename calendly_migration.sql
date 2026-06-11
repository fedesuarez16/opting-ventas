-- Migración: agregar soporte para Calendly en llamadas_agendadas
-- Ejecutar en Supabase SQL Editor

ALTER TABLE llamadas_agendadas
  ADD COLUMN IF NOT EXISTS calendly_uuid TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_llamadas_calendly_uuid
  ON llamadas_agendadas (calendly_uuid);
