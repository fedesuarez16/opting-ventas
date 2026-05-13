'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import AppLayout from '../components/AppLayout';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

let supabaseClient: ReturnType<typeof createClient> | null = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

type BatchStatus = 'procesando' | 'completado' | 'completado_con_errores';

interface Batch {
  id: string;
  template_key: string;
  total_seleccionado: number;
  total_efectivo: number;
  total_enviado: number;
  total_fallado: number;
  total_excluido: number;
  status: BatchStatus;
  created_at: string;
}

const STATUS_LABELS: Record<BatchStatus, string> = {
  procesando: 'Procesando',
  completado: 'Completado',
  completado_con_errores: 'Con errores',
};

const STATUS_CLASSES: Record<BatchStatus, string> = {
  procesando: 'bg-gray-100 text-gray-700',
  completado: 'bg-green-100 text-green-700',
  completado_con_errores: 'bg-amber-100 text-amber-700',
};

type FilterStatus = '' | BatchStatus;

function formatFecha(value: string): string {
  try {
    return new Date(value).toLocaleString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function EnviosMasivosPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('');

  const fetchBatches = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await (supabase as any)
      .from('envios_masivos_batch')
      .select('id, template_key, total_seleccionado, total_efectivo, total_enviado, total_fallado, total_excluido, status, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setBatches(data as Batch[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  useEffect(() => {
    const hasProcessing = batches.some((b) => b.status === 'procesando');
    if (!hasProcessing) return;
    const id = setInterval(fetchBatches, 5000);
    return () => clearInterval(id);
  }, [batches, fetchBatches]);

  const visible = filterStatus ? batches.filter((b) => b.status === filterStatus) : batches;

  return (
    <AppLayout>
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Envíos masivos</h1>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="">Todos los estados</option>
            <option value="procesando">Procesando</option>
            <option value="completado">Completado</option>
            <option value="completado_con_errores">Con errores</option>
          </select>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">Cargando…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-gray-500">No hay envíos masivos registrados.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Fecha</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Plantilla</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Selec.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Efect.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Enviado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Fallado</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Excluido</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((batch) => (
                  <tr
                    key={batch.id}
                    className="cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => router.push(`/envios-masivos/${batch.id}`)}
                  >
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatFecha(batch.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{batch.template_key}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{batch.total_seleccionado}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{batch.total_efectivo}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-700">{batch.total_enviado}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-700">{batch.total_fallado}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-500">{batch.total_excluido}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[batch.status]}`}>
                        {STATUS_LABELS[batch.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
