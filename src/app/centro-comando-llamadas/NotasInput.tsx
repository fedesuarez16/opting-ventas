'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

/**
 * Input de notas por fila. Guarda al salir del campo (o con Enter) sólo si el
 * texto cambió; Escape descarta. Mientras tiene foco no se pisa con los
 * refrescos de la tabla.
 */
export default function NotasInput({
  valor,
  onGuardar,
}: {
  valor: string | null;
  onGuardar: (nuevo: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(valor ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const focused = useRef(false);
  const cancelar = useRef(false);

  useEffect(() => {
    if (!focused.current) setValue(valor ?? '');
  }, [valor]);

  const guardar = async () => {
    focused.current = false;
    if (cancelar.current) {
      cancelar.current = false;
      setValue(valor ?? '');
      return;
    }
    const nuevo = value.trim();
    if (nuevo === (valor ?? '').trim()) return;
    setSaving(true);
    setError(false);
    try {
      await onGuardar(nuevo || null);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Input
      value={value}
      placeholder="Notas…"
      disabled={saving}
      title={error ? 'No se pudo guardar la nota' : value || undefined}
      className={`h-8 min-w-[180px] text-sm ${error ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setValue(e.target.value)}
      onBlur={guardar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          cancelar.current = true;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
