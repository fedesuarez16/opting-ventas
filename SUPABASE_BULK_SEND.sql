CREATE TABLE IF NOT EXISTS envios_masivos_batch (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key        TEXT NOT NULL,
  template_hsm_name   TEXT NOT NULL,
  template_language   TEXT NOT NULL DEFAULT 'es',
  total_seleccionado  INT NOT NULL DEFAULT 0,
  total_efectivo      INT NOT NULL DEFAULT 0,
  total_excluido      INT NOT NULL DEFAULT 0,
  total_enviado       INT NOT NULL DEFAULT 0,
  total_fallado       INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'procesando'
                      CHECK (status IN ('procesando', 'completado', 'completado_con_errores')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  created_by          TEXT
);

CREATE INDEX IF NOT EXISTS idx_batch_created_at ON envios_masivos_batch(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_batch_status ON envios_masivos_batch(status) WHERE status = 'procesando';

CREATE TABLE IF NOT EXISTS cola_envio_masivo (
  id                BIGSERIAL PRIMARY KEY,
  batch_id          UUID NOT NULL REFERENCES envios_masivos_batch(id) ON DELETE CASCADE,
  lead_id           INT REFERENCES leads(id),
  phone             TEXT,
  phone_from        TEXT,
  template_key      TEXT NOT NULL,
  template_hsm_name TEXT NOT NULL,
  template_language TEXT NOT NULL DEFAULT 'es',
  status            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (status IN ('pendiente', 'enviando', 'enviado', 'fallado', 'excluido')),
  exclusion_reason  TEXT,
  error_message     TEXT,
  ycloud_message_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cola_batch_status ON cola_envio_masivo(batch_id, status);
CREATE INDEX IF NOT EXISTS idx_cola_status_pendiente ON cola_envio_masivo(status) WHERE status = 'pendiente';

CREATE OR REPLACE FUNCTION set_updated_at_now()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cola_envio_masivo_updated_at ON cola_envio_masivo;
CREATE TRIGGER trg_cola_envio_masivo_updated_at
BEFORE UPDATE ON cola_envio_masivo
FOR EACH ROW EXECUTE FUNCTION set_updated_at_now();
