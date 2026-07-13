-- Agrega la columna de control para el tercer toque de seguimiento (19hs)
-- Espejo de followup_30min_sent / followup_18h_sent, usada por el workflow
-- n8n "Opting - Seguimiento 30min" (rama "Cron diario 19 AR").

ALTER TABLE seguimiento_whatsapp
  ADD COLUMN IF NOT EXISTS followup_19h_sent boolean NOT NULL DEFAULT false;
