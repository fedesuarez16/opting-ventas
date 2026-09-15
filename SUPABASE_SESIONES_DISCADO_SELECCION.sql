-- Selección manual de contactos para una tanda.
-- NULL = recorrer todos los pendientes del lote (comportamiento anterior).
ALTER TABLE public.sesiones_discado
  ADD COLUMN IF NOT EXISTS contacto_ids uuid[];
