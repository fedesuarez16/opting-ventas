'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import LlamadaModal, { type LlamadaModalInitial } from '../calendario-llamadas/LlamadaModal';
import {
  getLlamadasAll,
  searchLeadsLite,
  type EstadoLlamada,
  type LeadLite,
  type LlamadaAgendada,
} from '../services/llamadasService';

let supabaseInstance: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (supabaseInstance) return supabaseInstance;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  supabaseInstance = createClient(url, key);
  return supabaseInstance;
}

const TERMINAL_ESTADOS_TWILIO = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);

function formatDateTime(value: string | undefined): string {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const ESTADO_PILL: Record<EstadoLlamada, string> = {
  agendada: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/25',
  realizada: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  cancelada: 'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/15',
};

const ESTADO_TWILIO_PILL: Record<string, string> = {
  'in-progress': 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20',
  queued: 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-600/15',
  ringing: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20',
  completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  failed: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20',
  busy: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20',
  'no-answer': 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-600/15',
  canceled: 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-600/15',
};

export default function CentroComandoLlamadasPage() {
  const [llamadas, setLlamadas] = useState<LlamadaAgendada[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<EstadoLlamada | 'todas'>('todas');
  const [dispatching, setDispatching] = useState<Set<string>>(new Set());
  const [leadQuery, setLeadQuery] = useState('');
  const [leadResults, setLeadResults] = useState<LeadLite[]>([]);
  const [modalInitial, setModalInitial] = useState<LlamadaModalInitial | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = async () => {
    try {
      const data = await getLlamadasAll();
      setLlamadas(data);
    } catch (err: any) {
      setError(err?.message ?? 'Error al cargar llamadas');
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();

    const supabase = getSupabase();

    const startPolling = () => {
      if (pollingRef.current) return;
      pollingRef.current = setInterval(reload, 15_000);
    };

    const channel = supabase
      .channel('centro-comando-llamadas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'llamadas_agendadas' }, () => {
        reload();
      })
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') {
          startPolling();
        }
      });

    return () => {
      supabase.removeChannel(channel);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // Lead search with 200ms debounce
  useEffect(() => {
    if (!leadQuery.trim()) {
      setLeadResults([]);
      return;
    }
    const t = setTimeout(async () => {
      const results = await searchLeadsLite(leadQuery);
      setLeadResults(results);
    }, 200);
    return () => clearTimeout(t);
  }, [leadQuery]);

  const filtered = useMemo(
    () =>
      estadoFilter === 'todas'
        ? llamadas
        : llamadas.filter((l) => l.estado === estadoFilter),
    [llamadas, estadoFilter],
  );

  const disparar = async (llamadaId: string) => {
    setDispatching((prev) => new Set(prev).add(llamadaId));
    setError(null);
    try {
      const res = await fetch('/api/llamadas/disparar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llamadaId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? `Error ${res.status}`);
      } else {
        await reload();
      }
    } catch (err: any) {
      setError(err?.message ?? 'Error de red');
    } finally {
      setDispatching((prev) => {
        const next = new Set(prev);
        next.delete(llamadaId);
        return next;
      });
    }
  };

  const openCreate = (lead: LeadLite) => {
    const now = new Date();
    setModalInitial({
      mode: 'create',
      inicio: now,
      fin: new Date(now.getTime() + 15 * 60_000),
    });
    // Pre-fill the modal's lead search by injecting the selected lead via leadQuery
    setLeadQuery(lead.nombre ?? '');
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="p-6">
          <Skeleton className="h-8 w-64 mb-6" />
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full mb-2" />
          <Skeleton className="h-10 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-semibold text-foreground">Centro de Llamadas</h1>
          <div className="flex items-center gap-2">
            <label htmlFor="estadoFilter" className="text-sm text-muted-foreground">
              Estado:
            </label>
            <select
              id="estadoFilter"
              value={estadoFilter}
              onChange={(e) => setEstadoFilter(e.target.value as EstadoLlamada | 'todas')}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="todas">Todas</option>
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-3 text-xs text-red-600 hover:underline"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Two-column layout */}
        <div className="flex gap-5">
          {/* Left: tabla */}
          <div className="flex-1 min-w-0">
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-full">
                <thead className="bg-slate-50/80 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Lead</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Teléfono</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Agente tel.</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Estado Twilio</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Inicio</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No hay llamadas para mostrar.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((row) => {
                      const isDispatching = dispatching.has(row.id);
                      const canDisparar =
                        row.estado === 'agendada' &&
                        !!row.agente_telefono &&
                        !isDispatching &&
                        row.twilio_call_sid === null;
                      const enCurso =
                        !!row.twilio_call_sid &&
                        !row.grabacion_url &&
                        !!row.estado_twilio &&
                        !TERMINAL_ESTADOS_TWILIO.has(row.estado_twilio);

                      return (
                        <tr key={row.id} className="hover:bg-slate-50/60 transition-colors">
                          <td className="px-4 py-3 text-sm font-medium text-foreground max-w-[160px]">
                            <span className="block truncate" title={row.lead?.nombre ?? row.nombre_contacto ?? '—'}>
                              {row.lead?.nombre ?? row.nombre_contacto ?? '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap tabular-nums">
                            {row.lead?.phone ?? '—'}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap tabular-nums">
                            {row.agente_telefono ?? '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${ESTADO_PILL[row.estado]}`}
                            >
                              {row.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {row.estado_twilio ? (
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_TWILIO_PILL[row.estado_twilio] ?? 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-600/15'}`}
                              >
                                {row.estado_twilio}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                            {formatDateTime(row.inicio)}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {row.grabacion_url ? (
                                <a
                                  href={row.grabacion_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline"
                                >
                                  Grabación
                                </a>
                              ) : enCurso ? (
                                <span className="text-xs text-sky-600 font-medium">en curso</span>
                              ) : null}
                              {row.estado === 'agendada' && (
                                <span title={!row.agente_telefono ? 'Sin teléfono de agente asignado' : undefined}>
                                  <Button
                                    size="sm"
                                    disabled={!canDisparar}
                                    onClick={() => disparar(row.id)}
                                  >
                                    {isDispatching ? 'Disparando…' : 'Disparar'}
                                  </Button>
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: lead search panel */}
          <div className="w-72 shrink-0">
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">Agendar llamada</p>
              <input
                type="text"
                placeholder="Buscar lead por nombre o tel…"
                value={leadQuery}
                onChange={(e) => setLeadQuery(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              {leadResults.length > 0 && (
                <ul className="mt-2 max-h-72 overflow-auto rounded-md border border-border bg-card shadow-sm">
                  {leadResults.map((lead) => (
                    <li key={lead.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
                        onClick={() => openCreate(lead)}
                      >
                        <div className="truncate font-medium text-foreground">
                          {lead.nombre ?? `Lead #${lead.id}`}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {lead.phone ?? '—'}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {leadQuery.trim() && leadResults.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Sin resultados.</p>
              )}
            </div>
          </div>
        </div>

        {modalInitial && (
          <LlamadaModal
            initial={modalInitial}
            onClose={() => setModalInitial(null)}
            onSaved={() => {
              reload();
              setModalInitial(null);
              setLeadQuery('');
            }}
          />
        )}
      </div>
    </AppLayout>
  );
}
