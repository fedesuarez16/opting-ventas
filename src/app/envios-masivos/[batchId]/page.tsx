'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import AppLayout from '../../components/AppLayout';
import { LINE_LABELS, isAllowedPhoneFrom } from '@/lib/whatsapp-lines';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

let supabaseClient: ReturnType<typeof createClient> | null = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

type BatchStatus = 'procesando' | 'completado' | 'completado_con_errores';
type ColaStatus = 'pendiente' | 'enviando' | 'enviado' | 'fallado' | 'excluido';

interface Batch {
  id: string;
  template_key: string;
  template_hsm_name: string;
  total_seleccionado: number;
  total_efectivo: number;
  total_enviado: number;
  total_fallado: number;
  total_excluido: number;
  status: BatchStatus;
  created_at: string;
  completed_at: string | null;
}

interface ColaRow {
  id: number;
  lead_id: number | null;
  phone: string | null;
  phone_from: string | null;
  status: ColaStatus;
  exclusion_reason: string | null;
  error_message: string | null;
  ycloud_message_id: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  leads: { nombre: string | null } | null;
}

const STATUS_COLA_LABELS: Record<ColaStatus, string> = {
  pendiente: 'Pendiente',
  enviando: 'Enviando',
  enviado: 'Enviado',
  fallado: 'Fallado',
  excluido: 'Excluido',
};

const STATUS_COLA_CLASSES: Record<ColaStatus, string> = {
  pendiente: 'bg-gray-100 text-gray-600',
  enviando: 'bg-blue-100 text-blue-700',
  enviado: 'bg-green-100 text-green-700',
  fallado: 'bg-red-100 text-red-700',
  excluido: 'bg-gray-100 text-gray-500',
};

const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  procesando: 'Procesando',
  completado: 'Completado',
  completado_con_errores: 'Con errores',
};

const BATCH_STATUS_CLASSES: Record<BatchStatus, string> = {
  procesando: 'bg-gray-100 text-gray-700',
  completado: 'bg-green-100 text-green-700',
  completado_con_errores: 'bg-amber-100 text-amber-700',
};

type FilterCola = '' | ColaStatus;

function formatFecha(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return value;
  }
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

function isStuck(row: ColaRow): boolean {
  return (
    row.status === 'enviando' &&
    !!row.updated_at &&
    Date.now() - new Date(row.updated_at).getTime() > TEN_MINUTES_MS
  );
}

function getPhoneLabel(phone_from: string | null): string {
  if (!phone_from) return '—';
  if (isAllowedPhoneFrom(phone_from)) return LINE_LABELS[phone_from];
  return phone_from;
}

export default function BatchDetailPage() {
  const params = useParams();
  const batchId = params.batchId as string;

  const [batch, setBatch] = useState<Batch | null>(null);
  const [rows, setRows] = useState<ColaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterCola>('');

  const fetchData = useCallback(async () => {
    const supabase = getSupabase();
    const [batchRes, rowsRes] = await Promise.all([
      (supabase as any)
        .from('envios_masivos_batch')
        .select('id, template_key, template_hsm_name, total_seleccionado, total_efectivo, total_enviado, total_fallado, total_excluido, status, created_at, completed_at')
        .eq('id', batchId)
        .single(),
      (supabase as any)
        .from('cola_envio_masivo')
        .select('id, lead_id, phone, phone_from, status, exclusion_reason, error_message, ycloud_message_id, created_at, updated_at, sent_at, leads:lead_id(nombre)')
        .eq('batch_id', batchId)
        .order('id', { ascending: true }),
    ]);
    if (batchRes.data) setBatch(batchRes.data as Batch);
    if (rowsRes.data) setRows(rowsRes.data as ColaRow[]);
    setLoading(false);
  }, [batchId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const hasActive = rows.some((r) => r.status === 'pendiente' || r.status === 'enviando');
    if (!hasActive) return;
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [rows, fetchData]);

  const visible = filterStatus ? rows.filter((r) => r.status === filterStatus) : rows;

  if (loading) {
    return (
      <AppLayout>
        <div className="px-6 py-6">
          <p className="text-sm text-gray-500">Cargando…</p>
        </div>
      </AppLayout>
    );
  }

  if (!batch) {
    return (
      <AppLayout>
        <div className="px-6 py-6">
          <p className="text-sm text-red-600">Envío masivo no encontrado.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="px-6 py-6">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-2xl font-semibold text-gray-900">Detalle de envío masivo</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${BATCH_STATUS_CLASSES[batch.status]}`}>
              {BATCH_STATUS_LABELS[batch.status]}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-4 text-sm sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Plantilla</p>
              <p className="font-medium text-gray-900">{batch.template_key}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Fecha</p>
              <p className="font-medium text-gray-900">{formatFecha(batch.created_at)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Seleccionados / Efectivos</p>
              <p className="font-medium text-gray-900">{batch.total_seleccionado} / {batch.total_efectivo}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Enviados / Fallados</p>
              <p className="font-medium text-gray-900">
                <span className="text-green-700">{batch.total_enviado}</span>
                {' / '}
                <span className="text-red-700">{batch.total_fallado}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-gray-600">{rows.length} filas en cola</p>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterCola)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="enviando">Enviando</option>
            <option value="enviado">Enviado</option>
            <option value="fallado">Fallado</option>
            <option value="excluido">Excluido</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Lead</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Teléfono</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Línea</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Detalle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Enviado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No hay filas con ese estado.
                    </td>
                  </tr>
                ) : (
                  visible.map((row) => {
                    const stuck = isStuck(row);
                    const nombre = row.leads?.nombre ?? `Lead #${row.lead_id ?? row.id}`;
                    return (
                      <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{nombre}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{row.phone ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{getPhoneLabel(row.phone_from)}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLA_CLASSES[row.status]}`}>
                              {STATUS_COLA_LABELS[row.status]}
                            </span>
                            {stuck && (
                              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                                colgada
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                          {row.status === 'excluido' && row.exclusion_reason
                            ? row.exclusion_reason
                            : row.status === 'fallado' && row.error_message
                            ? row.error_message
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatFecha(row.sent_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
