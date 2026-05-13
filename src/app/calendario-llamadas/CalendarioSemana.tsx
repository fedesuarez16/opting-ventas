'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getLlamadasInRange,
  type LlamadaAgendada,
} from '../services/llamadasService';
import LlamadaModal, { type LlamadaModalInitial } from './LlamadaModal';

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const HOUR_START = 8;
const HOUR_END = 20;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 28;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
const TOTAL_SLOTS = (HOUR_END - HOUR_START) * SLOTS_PER_HOUR;
const COLUMN_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT;

const STATE_STYLES: Record<string, string> = {
  agendada: 'bg-blue-500/90 hover:bg-blue-600 border-blue-700 text-white',
  realizada: 'bg-emerald-500/90 hover:bg-emerald-600 border-emerald-700 text-white',
  cancelada: 'bg-slate-300 hover:bg-slate-400 border-slate-500 text-slate-700 line-through',
};

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diff);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
}

function formatHour(h: number): string {
  return `${String(h).padStart(2, '0')}:00`;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateShort(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function formatRangeLabel(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${monthNames[start.getMonth()]} – ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
}

interface PositionedLlamada {
  llamada: LlamadaAgendada;
  top: number;
  height: number;
}

function computePosition(llamada: LlamadaAgendada): PositionedLlamada | null {
  const inicio = new Date(llamada.inicio);
  const fin = new Date(llamada.fin);
  const minutesFromTop = (inicio.getHours() - HOUR_START) * 60 + inicio.getMinutes();
  const durationMinutes = Math.max(15, (fin.getTime() - inicio.getTime()) / 60000);
  if (minutesFromTop < 0) return null;
  const top = (minutesFromTop / SLOT_MINUTES) * SLOT_HEIGHT;
  const height = Math.max(SLOT_HEIGHT - 2, (durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT - 2);
  return { llamada, top, height };
}

export default function CalendarioSemana() {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [llamadas, setLlamadas] = useState<LlamadaAgendada[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [modalInitial, setModalInitial] = useState<LlamadaModalInitial | null>(null);

  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const today = useMemo(() => new Date(), []);

  const fetchLlamadas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getLlamadasInRange(weekStart, weekEnd);
      setLlamadas(data);
    } catch (err: any) {
      setError(err?.message ?? 'Error cargando llamadas');
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    fetchLlamadas();
  }, [fetchLlamadas]);

  const llamadasPorDia = useMemo(() => {
    const map = new Map<string, PositionedLlamada[]>();
    for (const llamada of llamadas) {
      const inicio = new Date(llamada.inicio);
      const key = `${inicio.getFullYear()}-${inicio.getMonth()}-${inicio.getDate()}`;
      const positioned = computePosition(llamada);
      if (!positioned) continue;
      const list = map.get(key) ?? [];
      list.push(positioned);
      map.set(key, list);
    }
    return map;
  }, [llamadas]);

  const handleSlotClick = (day: Date, hour: number, slotIndex: number) => {
    const minute = slotIndex * SLOT_MINUTES;
    const inicio = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);
    const fin = new Date(inicio.getTime() + 30 * 60_000);
    setModalInitial({ mode: 'create', inicio, fin });
  };

  const handleLlamadaClick = (llamada: LlamadaAgendada, ev: React.MouseEvent) => {
    ev.stopPropagation();
    setModalInitial({ mode: 'edit', llamada });
  };

  const goPrev = () => setWeekStart((d) => addDays(d, -7));
  const goNext = () => setWeekStart((d) => addDays(d, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goPrev}>← Anterior</Button>
          <Button variant="outline" size="sm" onClick={goToday}>Hoy</Button>
          <Button variant="outline" size="sm" onClick={goNext}>Siguiente →</Button>
        </div>
        <div className="text-sm font-medium text-foreground">
          {formatRangeLabel(weekStart, addDays(weekEnd, -1))}
        </div>
        <div className="flex items-center gap-2">
          {loading && <span className="text-xs text-muted-foreground">Cargando…</span>}
          <Button
            size="sm"
            onClick={() => {
              const inicio = new Date();
              inicio.setMinutes(Math.ceil(inicio.getMinutes() / 30) * 30, 0, 0);
              const fin = new Date(inicio.getTime() + 30 * 60_000);
              setModalInitial({ mode: 'create', inicio, fin });
            }}
          >
            + Nueva llamada
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* Calendar */}
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        {/* Header con días */}
        <div
          className="grid border-b border-border bg-slate-50"
          style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
        >
          <div className="border-r border-border px-2 py-2 text-xs text-muted-foreground" />
          {days.map((day, idx) => {
            const isToday = isSameDay(day, today);
            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'border-r border-border px-2 py-2 text-center last:border-r-0',
                  isToday && 'bg-blue-50',
                )}
              >
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {DAY_NAMES[idx]}
                </div>
                <div
                  className={cn(
                    'mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium',
                    isToday ? 'bg-blue-600 text-white' : 'text-foreground',
                  )}
                >
                  {day.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Grid principal con horas + columnas de días */}
        <div className="overflow-auto">
          <div
            className="relative grid"
            style={{ gridTemplateColumns: '60px repeat(7, 1fr)' }}
          >
            {/* Columna de horas */}
            <div className="border-r border-border bg-slate-50">
              {HOURS.slice(0, -1).map((h) => (
                <div
                  key={h}
                  className="relative border-b border-border text-[11px] text-muted-foreground"
                  style={{ height: SLOT_HEIGHT * SLOTS_PER_HOUR }}
                >
                  <span className="absolute -top-1.5 right-1.5 bg-slate-50 px-1">
                    {formatHour(h)}
                  </span>
                </div>
              ))}
            </div>

            {/* Columnas de días */}
            {days.map((day) => {
              const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
              const dayLlamadas = llamadasPorDia.get(key) ?? [];
              return (
                <div
                  key={day.toISOString()}
                  className="relative border-r border-border last:border-r-0"
                  style={{ height: COLUMN_HEIGHT }}
                >
                  {/* Slots clickeables (background) */}
                  {HOURS.slice(0, -1).map((hour) =>
                    Array.from({ length: SLOTS_PER_HOUR }, (_, slotIdx) => (
                      <button
                        key={`${hour}-${slotIdx}`}
                        type="button"
                        onClick={() => handleSlotClick(day, hour, slotIdx)}
                        className={cn(
                          'absolute left-0 right-0 hover:bg-blue-50/60 transition-colors',
                          slotIdx === 0 ? 'border-t border-border' : 'border-t border-dashed border-border/50',
                        )}
                        style={{
                          top: ((hour - HOUR_START) * SLOTS_PER_HOUR + slotIdx) * SLOT_HEIGHT,
                          height: SLOT_HEIGHT,
                        }}
                        aria-label={`Agendar a las ${formatHour(hour).slice(0, 3)}${String(slotIdx * SLOT_MINUTES).padStart(2, '0')}`}
                      />
                    )),
                  )}

                  {/* Llamadas posicionadas */}
                  {dayLlamadas.map(({ llamada, top, height }) => (
                    <button
                      key={llamada.id}
                      type="button"
                      onClick={(ev) => handleLlamadaClick(llamada, ev)}
                      className={cn(
                        'absolute left-1 right-1 rounded-md border px-2 py-1 text-left text-[11px] shadow-sm transition-all overflow-hidden',
                        STATE_STYLES[llamada.estado] ?? STATE_STYLES.agendada,
                      )}
                      style={{ top, height }}
                    >
                      <div className="truncate font-semibold">
                        {formatTime(new Date(llamada.inicio))} · {llamada.titulo}
                      </div>
                      {(llamada.lead?.nombre || llamada.nombre_contacto) && (
                        <div className="truncate opacity-90">
                          {llamada.lead?.nombre || llamada.nombre_contacto}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 px-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-blue-500" /> Agendada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-emerald-500" /> Realizada
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-slate-300" /> Cancelada
        </span>
      </div>

      {modalInitial && (
        <LlamadaModal
          initial={modalInitial}
          onClose={() => setModalInitial(null)}
          onSaved={() => {
            setModalInitial(null);
            fetchLlamadas();
          }}
        />
      )}
    </div>
  );
}
