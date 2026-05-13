'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '../../components/AppLayout';
import LeadEditSidebar from '../../components/LeadEditSidebar';
import { Lead } from '../../types';
import { getAllLeads, updateLead } from '../../services/leadService';
import { getLeadEstadoPillClass, normalizeLeadEstadoKey } from '../../utils/leadEstadoBadge';
import { Skeleton } from '@/components/ui/skeleton';

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

export default function LeadsListaDifusionPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await getAllLeads();
        setLeads(data);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const listaDifusion = useMemo(
    () => leads.filter((l) => l.lista_difusion === true),
    [leads]
  );

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return listaDifusion;
    const q = searchTerm.toLowerCase().trim();
    const qRaw = searchTerm.trim();
    return listaDifusion.filter((l) => {
      const name = (l.nombreCompleto || (l as any).nombre || '').toLowerCase();
      const tel = String((l as any).phone || (l as any).whatsapp_id || l.telefono || '');
      const email = (l.email || '').toLowerCase();
      return name.includes(q) || tel.includes(qRaw) || email.includes(q);
    });
  }, [listaDifusion, searchTerm]);

  const getPhone = (l: Lead) => (l as any).phone || (l as any).whatsapp_id || l.telefono || '—';
  const getNombre = (l: Lead) => l.nombreCompleto || (l as any).nombre || '—';
  const getEtiqueta = (l: Lead) => (l as any).etiqueta ?? (l as any).propiedad_interes ?? '—';

  const handleSaveLead = async (data: Partial<Lead>) => {
    if (!leadToEdit) return;
    const updated = await updateLead(leadToEdit.id, data);
    if (updated) {
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setLeadToEdit(updated);
    } else {
      alert('No se pudo guardar. Revisá los datos.');
    }
  };

  const handleQuitar = async (lead: Lead) => {
    if (!confirm(`¿Quitar a "${getNombre(lead)}" de la lista de difusión?`)) return;
    setRemovingId(lead.id);
    try {
      const updated = await updateLead(lead.id, { lista_difusion: false });
      if (updated) {
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      } else {
        alert('No se pudo actualizar el lead.');
      }
    } finally {
      setRemovingId(null);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8">
          <div className="bg-white border border-gray-200 rounded-lg mb-4 px-4 sm:px-6 py-4">
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-10 w-64" />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-visible shadow-sm">
            <div className="p-8 space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8 sm:mx-1">
        <div className="bg-white border mt-2 border-gray-200/80 rounded-2xl shadow-sm ring-1 ring-black/[0.02] mb-4 mx-2 overflow-hidden">
          {/* Hero header */}
          <div className="px-6 pt-4 pb-4 bg-gradient-to-br from-white via-orange-50/40 to-amber-50/30 border-b border-gray-100">
            <nav className="flex mb-3" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1.5 text-xs">
                <li>
                  <Link href="/" className="inline-flex items-center font-medium text-slate-500 hover:text-orange-600 transition-colors">
                    Inicio
                  </Link>
                </li>
                <li className="flex items-center">
                  <svg className="h-3 w-3 mx-1 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <Link href="/leads/tabla" className="font-medium text-slate-500 hover:text-orange-600 transition-colors">
                    Leads
                  </Link>
                </li>
                <li className="flex items-center">
                  <svg className="h-3 w-3 mx-1 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-slate-700" aria-current="page">Lista de difusión</span>
                </li>
              </ol>
            </nav>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white shadow-sm">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-slate-900 leading-tight">Lista de difusión</h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    <span className="text-orange-600 font-medium">
                      {listaDifusion.length.toLocaleString('es-AR')}
                    </span>
                    {' '}
                    {listaDifusion.length === 1 ? 'lead marcado' : 'leads marcados'}
                    {searchTerm && (
                      <>
                        {' · '}
                        <span className="text-orange-600 font-medium">
                          {filtered.length.toLocaleString('es-AR')} {filtered.length === 1 ? 'resultado' : 'resultados'}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="px-6 py-3 flex items-center flex-wrap gap-2.5 bg-white">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Buscar por nombre, teléfono o email…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full pl-9 pr-9 py-2 bg-slate-50 border border-transparent rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-orange-300 focus:ring-2 focus:ring-orange-500/20 transition-all"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                  aria-label="Limpiar búsqueda"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Tabla */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Teléfono</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Etiqueta</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Contacto</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-500">
                      {listaDifusion.length === 0
                        ? 'Aún no hay leads marcados como lista de difusión. Marcá leads desde /leads/tabla.'
                        : 'No se encontraron resultados para tu búsqueda.'}
                    </td>
                  </tr>
                ) : (
                  filtered.map((lead) => {
                    const estadoKey = normalizeLeadEstadoKey(lead.estado);
                    return (
                      <tr key={lead.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="px-6 py-3 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              setLeadToEdit(lead);
                              setIsEditOpen(true);
                            }}
                            className="text-sm font-medium text-slate-900 hover:text-orange-600 transition-colors text-left"
                          >
                            {getNombre(lead)}
                          </button>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600 font-mono">
                          {getPhone(lead)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getLeadEstadoPillClass(estadoKey)}`}>
                            {lead.estado || '—'}
                          </span>
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-600">
                          {getEtiqueta(lead)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-sm text-slate-500">
                          {formatDateTime(lead.created_at)}
                        </td>
                        <td className="px-6 py-3 whitespace-nowrap text-right">
                          <button
                            type="button"
                            onClick={() => handleQuitar(lead)}
                            disabled={removingId === lead.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {removingId === lead.id ? 'Quitando…' : 'Quitar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <LeadEditSidebar
        lead={leadToEdit}
        onClose={() => setIsEditOpen(false)}
        onSave={handleSaveLead}
        isOpen={isEditOpen}
        variant="leads-table"
      />
    </AppLayout>
  );
}
