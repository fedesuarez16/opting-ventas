'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  buildConversacionUrl,
  createLlamada,
  deleteLlamada,
  searchLeadsLite,
  updateLlamada,
  type EstadoLlamada,
  type LeadLite,
  type LlamadaAgendada,
} from '../services/llamadasService';

export type LlamadaModalInitial =
  | { mode: 'create'; inicio: Date; fin: Date }
  | { mode: 'edit'; llamada: LlamadaAgendada };

interface LlamadaModalProps {
  initial: LlamadaModalInitial;
  onClose: () => void;
  onSaved: () => void;
}

const DURACION_OPCIONES = [
  { label: '15 min', minutes: 15 },
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '60 min', minutes: 60 },
  { label: '90 min', minutes: 90 },
];

const ESTADO_OPCIONES: { value: EstadoLlamada; label: string }[] = [
  { value: 'agendada', label: 'Agendada' },
  { value: 'realizada', label: 'Realizada' },
  { value: 'cancelada', label: 'Cancelada' },
];

function toLocalDateInput(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toLocalTimeInput(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function combineDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm);
}

export default function LlamadaModal({ initial, onClose, onSaved }: LlamadaModalProps) {
  const isEdit = initial.mode === 'edit';

  const initialInicio = useMemo(
    () => (initial.mode === 'edit' ? new Date(initial.llamada.inicio) : initial.inicio),
    [initial],
  );
  const initialFin = useMemo(
    () => (initial.mode === 'edit' ? new Date(initial.llamada.fin) : initial.fin),
    [initial],
  );
  const initialDuration = Math.max(
    15,
    Math.round((initialFin.getTime() - initialInicio.getTime()) / 60_000),
  );

  const conversacionUrl = useMemo(() => {
    if (!isEdit) return null;
    return buildConversacionUrl((initial as { mode: 'edit'; llamada: LlamadaAgendada }).llamada.lead?.phone);
  }, [isEdit, initial]);

  const [titulo, setTitulo] = useState<string>(
    isEdit ? initial.llamada.titulo : 'Llamada',
  );
  const [fecha, setFecha] = useState<string>(toLocalDateInput(initialInicio));
  const [hora, setHora] = useState<string>(toLocalTimeInput(initialInicio));
  const [duracion, setDuracion] = useState<number>(initialDuration);
  const [notas, setNotas] = useState<string>(isEdit ? (initial.llamada.notas ?? '') : '');
  const [estado, setEstado] = useState<EstadoLlamada>(
    isEdit ? initial.llamada.estado : 'agendada',
  );
  const [resultado, setResultado] = useState<string>(
    isEdit ? (initial.llamada.resultado ?? '') : '',
  );
  const [agenteTelefono, setAgenteTelefono] = useState<string>(
    isEdit ? (initial.llamada.agente_telefono ?? '') : '',
  );

  const initialLeadLibre = isEdit && !initial.llamada.lead_id;
  const [modoLead, setModoLead] = useState<'existente' | 'libre'>(
    initialLeadLibre ? 'libre' : 'existente',
  );
  const [selectedLead, setSelectedLead] = useState<LeadLite | null>(
    isEdit && initial.llamada.lead
      ? {
          id: initial.llamada.lead.id,
          nombre: initial.llamada.lead.nombre,
          phone: initial.llamada.lead.phone,
        }
      : null,
  );
  const [nombreLibre, setNombreLibre] = useState<string>(
    isEdit && !initial.llamada.lead_id ? (initial.llamada.nombre_contacto ?? '') : '',
  );
  const [leadQuery, setLeadQuery] = useState<string>('');
  const [leadResults, setLeadResults] = useState<LeadLite[]>([]);
  const [leadOpen, setLeadOpen] = useState<boolean>(false);
  const [leadLoading, setLeadLoading] = useState<boolean>(false);

  const [saving, setSaving] = useState<boolean>(false);
  const [deleting, setDeleting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Búsqueda de leads con debounce. Carga lista inicial al abrir el dropdown.
  useEffect(() => {
    if (modoLead !== 'existente' || !leadOpen) return;
    let cancelled = false;
    setLeadLoading(true);
    const t = setTimeout(async () => {
      const data = await searchLeadsLite(leadQuery, 25);
      if (!cancelled) {
        setLeadResults(data);
        setLeadLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [leadQuery, leadOpen, modoLead]);

  const handleSave = async () => {
    setError(null);

    if (modoLead === 'existente' && !selectedLead) {
      setError('Seleccioná un lead o cambiá a "Nombre libre".');
      return;
    }
    if (modoLead === 'libre' && !nombreLibre.trim()) {
      setError('Escribí un nombre o seleccioná un lead.');
      return;
    }
    if (!titulo.trim()) {
      setError('El título es obligatorio.');
      return;
    }

    const inicio = combineDateTime(fecha, hora);
    const fin = new Date(inicio.getTime() + duracion * 60_000);

    const payload = {
      lead_id: modoLead === 'existente' ? selectedLead!.id : null,
      nombre_contacto: modoLead === 'libre' ? nombreLibre.trim() : null,
      titulo: titulo.trim(),
      notas: notas.trim() || null,
      inicio: inicio.toISOString(),
      fin: fin.toISOString(),
      estado,
      agente_telefono: agenteTelefono.trim() || null,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await updateLlamada(initial.llamada.id, {
          ...payload,
          resultado: resultado.trim() || null,
        });
      } else {
        await createLlamada(payload);
      }
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo guardar la llamada.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    if (!confirm('¿Eliminar esta llamada agendada?')) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteLlamada(initial.llamada.id);
      onSaved();
    } catch (err: any) {
      setError(err?.message ?? 'No se pudo eliminar la llamada.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[200] bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[201] w-[95vw] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-card p-5 shadow-xl">
          <Dialog.Title className="text-lg font-semibold text-foreground">
            {isEdit ? 'Editar llamada' : 'Nueva llamada'}
          </Dialog.Title>
          <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">
            {isEdit ? 'Actualizá los datos o cambiá el estado de la llamada.' : 'Agendá una llamada asociada a un lead.'}
          </Dialog.Description>

          <div className="mt-4 space-y-3">
            {/* Lead */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Contacto *</label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setModoLead('existente')}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                      modoLead === 'existente'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-muted-foreground hover:bg-slate-100',
                    )}
                  >
                    Lead existente
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoLead('libre')}
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors',
                      modoLead === 'libre'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-muted-foreground hover:bg-slate-100',
                    )}
                  >
                    Nombre libre
                  </button>
                </div>
              </div>

              {modoLead === 'libre' ? (
                <input
                  type="text"
                  placeholder="Nombre del contacto"
                  value={nombreLibre}
                  onChange={(e) => setNombreLibre(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              ) : selectedLead ? (
                <div className="flex items-center justify-between rounded-md border border-border bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-foreground">
                      {selectedLead.nombre || 'Sin nombre'}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {selectedLead.phone || `Lead #${selectedLead.id}`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setSelectedLead(null); setLeadQuery(''); setLeadOpen(true); }}
                    className="ml-2 text-xs text-blue-600 hover:underline"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Buscar por nombre o teléfono…"
                    value={leadQuery}
                    onChange={(e) => { setLeadQuery(e.target.value); setLeadOpen(true); }}
                    onFocus={() => setLeadOpen(true)}
                    onBlur={() => setTimeout(() => setLeadOpen(false), 150)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  {leadOpen && (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-auto rounded-md border border-border bg-card shadow-lg">
                      {leadLoading && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">Buscando…</div>
                      )}
                      {!leadLoading && leadResults.length === 0 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground">
                          Sin resultados. Probá con &quot;Nombre libre&quot;.
                        </div>
                      )}
                      {leadResults.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { setSelectedLead(lead); setLeadOpen(false); }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-100"
                        >
                          <div className="truncate font-medium text-foreground">
                            {lead.nombre || `Lead #${lead.id}`}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {lead.phone || '—'}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Título */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Título *</label>
              <input
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* Fecha + hora + duración */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Fecha</label>
                <input
                  type="date"
                  value={fecha}
                  onChange={(e) => setFecha(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Hora</label>
                <input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Duración</label>
                <select
                  value={duracion}
                  onChange={(e) => setDuracion(Number(e.target.value))}
                  className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {DURACION_OPCIONES.map((opt) => (
                    <option key={opt.minutes} value={opt.minutes}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Estado */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Estado</label>
              <div className="flex gap-2">
                {ESTADO_OPCIONES.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEstado(opt.value)}
                    className={cn(
                      'flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors',
                      estado === opt.value
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-border bg-background text-muted-foreground hover:bg-slate-50',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notas */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Notas</label>
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                placeholder="Contexto previo, qué hay que tratar, etc."
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            {/* Teléfono del agente */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Teléfono del agente</label>
              <input
                type="tel"
                value={agenteTelefono}
                onChange={(e) => setAgenteTelefono(e.target.value)}
                placeholder="+5492215551234"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-[11px] text-muted-foreground">
                Número al que se bridgeará la llamada (formato E.164 o solo dígitos).
              </p>
            </div>

            {/* Resultado (solo edit) */}
            {isEdit && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-foreground">Resultado</label>
                <textarea
                  value={resultado}
                  onChange={(e) => setResultado(e.target.value)}
                  rows={2}
                  placeholder="Qué pasó en la llamada (post-llamada)."
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              {isEdit && (
                <Button
                  variant="outline"
                  onClick={handleDelete}
                  disabled={saving || deleting}
                  className="border-red-300 text-red-700 hover:bg-red-50"
                >
                  {deleting ? 'Eliminando…' : 'Eliminar'}
                </Button>
              )}
              {conversacionUrl && (
                <Link
                  href={conversacionUrl}
                  className="text-xs text-blue-600 hover:underline"
                  onClick={onClose}
                >
                  Ir a la conversación
                </Link>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} disabled={saving || deleting}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || deleting}>
                {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agendar'}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
