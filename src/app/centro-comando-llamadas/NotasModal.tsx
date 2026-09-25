'use client';

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';

/**
 * Botón de notas por fila: muestra un avance de la nota y abre un modal con
 * un textarea para leerla y editarla completa. Cmd/Ctrl+Enter guarda.
 */
export default function NotasModal({
  valor,
  titulo,
  onGuardar,
}: {
  valor: string | null;
  titulo: string;
  onGuardar: (nuevo: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abrir = () => {
    setTexto(valor ?? '');
    setError(null);
    setOpen(true);
  };

  const guardar = async () => {
    const nuevo = texto.trim();
    if (nuevo === (valor ?? '').trim()) {
      setOpen(false);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onGuardar(nuevo || null);
      setOpen(false);
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo guardar la nota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!saving) setOpen(o); }}>
      <button
        type="button"
        onClick={abrir}
        title={valor ?? undefined}
        className={
          'block w-full max-w-[220px] rounded-md border px-2 py-1 text-left text-xs transition-colors ' +
          (valor
            ? 'border-border bg-background text-foreground hover:bg-slate-50'
            : 'border-dashed border-slate-300 text-muted-foreground hover:bg-slate-50')
        }
      >
        <span className="line-clamp-2 whitespace-pre-line break-words">
          {valor || '+ Agregar nota'}
        </span>
      </button>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[201] w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-foreground">Notas</Dialog.Title>
          <Dialog.Description className="mt-0.5 truncate text-xs text-muted-foreground">
            {titulo}
          </Dialog.Description>

          <textarea
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void guardar();
            }}
            rows={8}
            placeholder="Qué se habló, cuándo volver a llamar, etc."
            disabled={saving}
            className="mt-4 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
          />

          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
