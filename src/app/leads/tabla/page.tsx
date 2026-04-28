'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import AppLayout from '../../components/AppLayout';
import LeadEditSidebar from '../../components/LeadEditSidebar';
import LeadDetailSidebar from '../../components/LeadDetailSidebar';
import { Lead } from '../../types';
import {
  getAllLeads,
  updateLead,
} from '../../services/leadService';
import { exportLeadsToCSV } from '../../utils/exportUtils';
import { getLeadEstadoPillClass, normalizeLeadEstadoKey } from '../../utils/leadEstadoBadge';
import { getLeadBooleanEtiquetaLabels, leadHasAttentionEtiquetas } from '../../utils/leadEtiquetaTags';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

/** Número de origen (`phone_from`) usado en filtros de la tabla. */
const PHONE_FROM_FILTER_TARGET = '+5491141872290';

type PhoneFromTableFilter = '' | 'only_target' | 'exclude_target';

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

const ETIQUETA_COLOR_CLASSES: Record<string, string> = {
  'Llamada agendada': 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20',
  'Llamar': 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/25',
  'Deriva humano': 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20',
  'Presupuesto': 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20',
  'Inspección': 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20',
  'Empleado': 'bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-600/20',
  'Dueño': 'bg-fuchsia-50 text-fuchsia-700 ring-1 ring-inset ring-fuchsia-600/20',
};

function getEtiquetaColorClass(label: string): string {
  return (
    ETIQUETA_COLOR_CLASSES[label] ||
    'bg-slate-50 text-slate-700 ring-1 ring-inset ring-slate-600/15'
  );
}

function getServicioPillClass(servicio: string): string {
  if (servicio === 'Carnet') {
    return 'bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20';
  }
  return 'bg-cyan-50 text-cyan-700 ring-1 ring-inset ring-cyan-600/20';
}

export default function LeadsTablePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  /** '' = todos; valores alineados con normalizeLeadEstadoKey */
  const [filterEstado, setFilterEstado] = useState<string>('');
  /** Filtrar solo leads con etiquetas Inspección / Presupuesto / Deriva humano */
  const [attentionEtiquetasFilter, setAttentionEtiquetasFilter] = useState(false);
  /** Filtro por `phone_from`: solo ese número, o todos menos ese (incluye null). */
  const [filterPhoneFrom, setFilterPhoneFrom] = useState<PhoneFromTableFilter>('');

  const statusOptions: string[] = ['frío', 'tibio', 'caliente', 'llamada', 'llamada realizada', 'lista de difusion'];
  const estadoFilterOptions: { value: string; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'frío', label: 'Frío' },
    { value: 'tibio', label: 'Tibio' },
    { value: 'caliente', label: 'Caliente' },
    { value: 'llamada', label: 'Llamada' },
  ];
  const [statusDropdownOpenFor, setStatusDropdownOpenFor] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [isEditSidebarOpen, setIsEditSidebarOpen] = useState(false);
  const [leadForDetail, setLeadForDetail] = useState<Lead | null>(null);
  const [isDetailSidebarOpen, setIsDetailSidebarOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        await fetch('/api/leads/recalificar-estados', { method: 'POST' });
      } catch (e) {
        console.warn('No se pudo recalificar estados antes de cargar la tabla:', e);
      }
      const data = await getAllLeads();
      setLeads(data);
      setFilteredLeads(data);
      setIsLoading(false);
    };
    load();
  }, []);

  const attentionEtiquetasCount = useMemo(
    () => leads.filter((l) => leadHasAttentionEtiquetas(l)).length,
    [leads]
  );

  const matchesEstadoFilter = (lead: Lead, selected: string): boolean => {
    if (!selected) return true;
    const want = normalizeLeadEstadoKey(selected);
    const leadKey = normalizeLeadEstadoKey(lead.estado);
    if (want === 'llamada') {
      return leadKey === 'llamada' || leadKey === 'llamada realizada';
    }
    return leadKey === want;
  };

  const filtered = useMemo(() => {
    let out = leads;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      const qRaw = searchTerm.trim();
      out = out.filter((l) => {
        const name = (l.nombreCompleto || (l as any).nombre || '').toLowerCase();
        const tel = String((l as any).phone || (l as any).whatsapp_id || l.telefono || '');
        const email = (l.email || '').toLowerCase();
        return name.includes(q) || tel.includes(qRaw) || email.includes(q);
      });
    }
    if (filterEstado) {
      out = out.filter((l) => matchesEstadoFilter(l, filterEstado));
    }
    if (attentionEtiquetasFilter) {
      out = out.filter((l) => leadHasAttentionEtiquetas(l));
    }
    if (filterPhoneFrom === 'only_target') {
      out = out.filter((l) => (l.phone_from ?? '') === PHONE_FROM_FILTER_TARGET);
    } else if (filterPhoneFrom === 'exclude_target') {
      out = out.filter((l) => (l.phone_from ?? '') !== PHONE_FROM_FILTER_TARGET);
    }
    return out;
  }, [leads, searchTerm, filterEstado, attentionEtiquetasFilter, filterPhoneFrom]);

  useEffect(() => {
    setFilteredLeads(filtered);
  }, [filtered]);

  const handleExportCSV = () => exportLeadsToCSV(filteredLeads, 'leads');
  const handleSaveLead = async (data: Partial<Lead>) => {
    if (!leadToEdit) return;
    const updated = await updateLead(leadToEdit.id, data);
    if (updated) {
      setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setFilteredLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      setLeadToEdit(updated);
    } else {
      alert('No se pudo guardar. Revisá el teléfono (único) y los datos.');
    }
  };

  useEffect(() => {
    if (!statusDropdownOpenFor) return;
    const onMouseDown = (e: MouseEvent) => {
      if (!statusDropdownRef.current) return;
      const target = e.target as Node;
      if (!statusDropdownRef.current.contains(target)) {
        setStatusDropdownOpenFor(null);
      }
    };

    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [statusDropdownOpenFor]);

  const handleUpdateEstado = async (leadId: string, estado: string) => {
    setStatusUpdatingId(leadId);
    try {
      const updated = await updateLead(leadId, { estado });
      if (updated) {
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        setFilteredLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        setStatusDropdownOpenFor(null);
      } else {
        alert('Error al actualizar el estado del lead.');
      }
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const getPhone = (l: Lead) => (l as any).phone || (l as any).whatsapp_id || l.telefono || '';
  const getNombre = (l: Lead) => l.nombreCompleto || (l as any).nombre || '—';
  const getEtiqueta = (l: Lead) => (l as any).etiqueta ?? (l as any).propiedad_interes ?? '—';
  const getServicioLabel = (l: Lead) =>
    (l.phone_from ?? '') === PHONE_FROM_FILTER_TARGET ? 'Carnet' : 'S&H';

  const toggleRowSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedIds.has(l.id));
  const someVisibleSelected =
    !allVisibleSelected && filteredLeads.some((l) => selectedIds.has(l.id));

  const toggleSelectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const l of filteredLeads) next.delete(l.id);
      } else {
        for (const l of filteredLeads) next.add(l.id);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8 ">
          <div className="bg-white border border-gray-200 rounded-lg mb-4 px-4 sm:px-6 py-4">
            <Skeleton className="h-4 w-48 mb-2" />
            <Skeleton className="h-10 w-64" />
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-visible shadow-sm">
            <div className="p-8">
              <Skeleton className="h-8 w-full mb-2" />
              <Skeleton className="h-8 w-full mb-2" />
              <Skeleton className="h-8 w-full mb-2" />
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
          <div className="px-6 pt-4  pb- bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/30 border-b border-gray-100">
            <nav className="flex mb-3" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1.5 text-xs">
                <li>
                  <Link href="/" className="inline-flex items-center font-medium text-slate-500 hover:text-indigo-600 transition-colors">
                    Inicio
                  </Link>
                </li>
                <li className="flex items-center">
                  <svg className="h-3 w-3 mx-1 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  <span className="font-medium text-slate-700" aria-current="page">Leads</span>
                </li>
              </ol>
            </nav>

            <div className="flex items-center  justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                
                <div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {(searchTerm || filterEstado || attentionEtiquetasFilter || filterPhoneFrom) && (
                      <>
                        {' · '}
                        <span className="text-indigo-600 font-medium">
                          {filteredLeads.length.toLocaleString('es-AR')} {filteredLeads.length === 1 ? 'resultado' : 'resultados'}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {(searchTerm || filterEstado || attentionEtiquetasFilter || filterPhoneFrom) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterEstado('');
                    setFilterPhoneFrom('');
                    setAttentionEtiquetasFilter(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-gray-200 hover:border-gray-300 rounded-lg shadow-sm transition-colors"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Limpiar filtros
                </button>
              )}
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
                className="block w-full pl-9 pr-9 py-2 bg-slate-50 border border-transparent rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 transition-all"
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

            <div className="hidden md:block h-6 w-px bg-gray-200" aria-hidden />

            <div className="relative">
              <select
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                className={`appearance-none cursor-pointer pl-8 pr-8 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  filterEstado
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                aria-label="Filtrar por estado"
              >
                {estadoFilterOptions.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <svg className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${filterEstado ? 'text-indigo-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            <div className="relative">
              <select
                value={filterPhoneFrom}
                onChange={(e) => setFilterPhoneFrom((e.target.value || '') as PhoneFromTableFilter)}
                className={`appearance-none cursor-pointer pl-8 pr-8 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                  filterPhoneFrom
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-900'
                    : 'border-gray-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                aria-label="Filtrar por origen"
              >
                <option value="">Todos los orígenes</option>
                <option value="only_target">Carnet</option>
                <option value="exclude_target">S&H</option>
              </select>
              <svg className={`absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none ${filterPhoneFrom ? 'text-indigo-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18" />
              </svg>
              <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            <button
              type="button"
              onClick={() => setAttentionEtiquetasFilter((v) => !v)}
              className={[
                'relative inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-all',
                attentionEtiquetasFilter
                  ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-sm ring-2 ring-amber-500/20'
                  : 'border-gray-200 bg-white text-slate-700 hover:bg-slate-50',
              ].join(' ')}
              title={
                attentionEtiquetasFilter
                  ? 'Quitar filtro de etiquetas (inspección, presupuesto, deriva humano)'
                  : 'Ver solo leads con inspección, presupuesto o deriva humano'
              }
              aria-pressed={attentionEtiquetasFilter}
              aria-label={`Alertas de etiquetas: ${attentionEtiquetasCount} leads`}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              <span className="hidden sm:inline">Atención</span>
              {attentionEtiquetasCount > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full text-[10px] font-bold tabular-nums ${
                    attentionEtiquetasFilter
                      ? 'bg-amber-600 text-white'
                      : 'bg-red-500 text-white'
                  }`}
                >
                  {attentionEtiquetasCount > 99 ? '99+' : attentionEtiquetasCount}
                </span>
              )}
            </button>

            <div className="ml-auto">
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-gray-200 rounded-lg hover:bg-slate-50 transition-colors"
                title="Exportar resultados a CSV"
              >
                <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                </svg>
                <span className="hidden sm:inline">Exportar</span>
              </button>
            </div>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="mx-2 mb-2 flex items-center justify-between rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-2.5 shadow-sm">
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-indigo-600 text-white text-xs font-semibold tabular-nums">
                {selectedIds.size}
              </span>
              <span className="text-sm text-indigo-900">
                {selectedIds.size === 1 ? 'lead seleccionado' : 'leads seleccionados'}
              </span>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              Limpiar selección
            </button>
          </div>
        )}

        <div className="bg-white border m-2 border-gray-200/80 rounded-xl overflow-visible shadow-sm ring-1 ring-black/[0.02]">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full">
              <thead className="bg-slate-50/80 backdrop-blur sticky top-0 z-10">
                <tr className="border-b border-gray-200">
                  <th scope="col" className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleSelectAllVisible}
                      aria-label="Seleccionar todos los leads visibles"
                    />
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[1%] max-w-[9rem] sm:max-w-[11rem]"
                  >
                    Nombre
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Teléfono
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    Servicio
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Fecha/Hora Contacto
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Etiquetas
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-gray-500 text-sm">
                      No hay leads para mostrar. Ajustá los filtros o la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const booleanTags = getLeadBooleanEtiquetaLabels(lead);
                    const legacyEtiqueta = getEtiqueta(lead);
                    const legacyOk = legacyEtiqueta && legacyEtiqueta !== '—';
                    const isSelected = selectedIds.has(lead.id);
                    const servicio = getServicioLabel(lead);
                    return (
                    <tr
                      key={lead.id}
                      className={`group transition-colors ${
                        isSelected ? 'bg-indigo-50/50 hover:bg-indigo-50/70' : 'hover:bg-slate-50/70'
                      }`}
                    >
                      <td className="px-4 py-3.5 w-10">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={isSelected}
                          onChange={() => toggleRowSelected(lead.id)}
                          aria-label={`Seleccionar lead ${getNombre(lead)}`}
                        />
                      </td>
                      <td className="px-3 py-3.5 text-sm font-medium text-slate-900 max-w-[9rem] sm:max-w-[11rem]">
                        <span className="block truncate" title={getNombre(lead)}>
                          {getNombre(lead)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-600 tabular-nums">
                        {getPhone(lead) || '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full ${getServicioPillClass(servicio)}`}
                        >
                          {servicio}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-600">
                        {formatDateTime(lead.fechaContacto || lead.created_at)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              setStatusDropdownOpenFor((cur) => (cur === lead.id ? null : lead.id))
                            }
                            disabled={!!statusUpdatingId && statusUpdatingId !== lead.id}
                            className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${getLeadEstadoPillClass(lead.estado)} cursor-pointer select-none transition-shadow hover:shadow-sm`}
                            aria-haspopup="listbox"
                            aria-expanded={statusDropdownOpenFor === lead.id}
                            title="Cambiar estado"
                          >
                            {lead.estado || '—'}
                          </button>

                          {statusDropdownOpenFor === lead.id && (
                            <div
                              ref={statusDropdownRef}
                              className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-30 max-h-72 overflow-y-auto"
                              role="listbox"
                              aria-label="Opciones de estado"
                            >
                              {statusOptions.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 whitespace-nowrap ${
                                    opt === lead.estado ? 'bg-gray-100 font-medium' : ''
                                  }`}
                                  onClick={() => handleUpdateEstado(lead.id, opt)}
                                  disabled={statusUpdatingId === lead.id}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 max-w-[280px]">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {booleanTags.map((label) => (
                            <span
                              key={label}
                              className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${getEtiquetaColorClass(label)}`}
                            >
                              {label}
                            </span>
                          ))}
                          {legacyOk && (
                            <span className="text-xs text-slate-500 truncate max-w-[160px]" title={legacyEtiqueta}>
                              {legacyEtiqueta}
                            </span>
                          )}
                          {booleanTags.length === 0 && !legacyOk && (
                            <span className="text-gray-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-sm">
                        <span className="inline-flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => {
                              setLeadForDetail(lead);
                              setIsDetailSidebarOpen(true);
                            }}
                            className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 transition-colors"
                            title="Ver perfil"
                            aria-label="Ver perfil"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </button>
                          <Link
                            href={`/chat?phoneNumber=${encodeURIComponent(getPhone(lead).replace(/^\++/, ''))}`}
                            className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 inline-flex transition-colors"
                            title="Ver chat"
                            aria-label="Ver chat"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a10.4 10.4 0 01-4-.8L3 20l1.2-3.2A7.6 7.6 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </Link>
                          <button
                            type="button"
                            onClick={() => {
                              setLeadToEdit(lead);
                              setIsEditSidebarOpen(true);
                            }}
                            className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                        </span>
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
        isOpen={isEditSidebarOpen}
        onClose={() => {
          setIsEditSidebarOpen(false);
          setLeadToEdit(null);
        }}
        onSave={handleSaveLead}
        variant="leads-table"
      />
      <LeadDetailSidebar
        lead={leadForDetail}
        onClose={() => {
          setIsDetailSidebarOpen(false);
          setLeadForDetail(null);
        }}
        matchingProperties={[]}
        isOpen={isDetailSidebarOpen}
        onEditLead={(lead) => {
          setLeadToEdit(lead);
          setIsDetailSidebarOpen(false);
          setLeadForDetail(null);
          setIsEditSidebarOpen(true);
        }}
      />
    </AppLayout>
  );
}
