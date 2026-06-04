-- Migration: llamadas-salientes
-- Adds 4 nullable Twilio columns to llamadas_agendadas.
-- All columns are nullable — existing rows are unaffected.

ALTER TABLE llamadas_agendadas
  ADD COLUMN IF NOT EXISTS agente_telefono  text,
  ADD COLUMN IF NOT EXISTS twilio_call_sid  text,
  ADD COLUMN IF NOT EXISTS estado_twilio    text,
  ADD COLUMN IF NOT EXISTS grabacion_url    text;
