'use client';

import React, { useState, useEffect, useMemo, useDeferredValue, useRef } from 'react';
import AppLayout from '../../components/AppLayout';
import LeadFilter from '../../components/LeadFilter';
import LeadEditSidebar from '../../components/LeadEditSidebar';
import LeadDetailSidebar from '../../components/LeadDetailSidebar';
import AgentStatusToggle from '../../components/AgentStatusToggle';
import { Lead, FilterOptions } from '../../types';
import {
  getAllOutboundLeads,
  filterOutboundLeads,
  getUniqueOutboundStatuses,
  matchesOutboundTablePhoneFrom,
  updateOutboundLead,
  updateOutboundLeadStatus,
  createOutboundLead,
} from '../../services/leadOutboundService';
import { exportLeadsToCSV } from '../../utils/exportUtils';
import { getLeadEstadoPillClass } from '../../utils/leadEstadoBadge';
import { getLeadBooleanEtiquetaLabels, leadHasAttentionEtiquetas } from '../../utils/leadEtiquetaTags';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

const DEFAULT_OUTBOUND_COLUMNS = ['active', 'respondio', 'llamada', 'no_contesta', 'cerrado'];
const DEFAULT_OUTBOUND_COLORS: Record<string, string> = {
  active: '#3b82f6',
  responded: '#10b981',
  llamada: '#8b5cf6',
  no_contesta: '#f59e0b',
  cerrado: '#6b7280',
};
function normalizeColumnName(col: string): string {
  return col.toLowerCase().trim();
}

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

export default function LeadsOutboundPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({});
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [attentionEtiquetasFilter, setAttentionEtiquetasFilter] = useState(false);

  const [zonas, setZonas] = useState<string[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [tiposPropiedad, setTiposPropiedad] = useState<string[]>([]);
  const [motivosInteres, setMotivosInteres] = useState<string[]>([]);
  const [propiedadesInteres, setPropiedadesInteres] = useState<string[]>([]);

  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [isEditSidebarOpen, setIsEditSidebarOpen] = useState(false);
  const [leadForDetail, setLeadForDetail] = useState<Lead | null>(null);
  const [isDetailSidebarOpen, setIsDetailSidebarOpen] = useState(false);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [isAddColumnModalVisible, setIsAddColumnModalVisible] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#3b82f6');
  const [isColumnSelectorVisible, setIsColumnSelectorVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_OUTBOUND_COLUMNS);
  const [columnColors, setColumnColors] = useState<Record<string, string>>(DEFAULT_OUTBOUND_COLORS);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const [statusDropdownOpenFor, setStatusDropdownOpenFor] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await new Promise((r) => setTimeout(r, 300));
      const allLeads = await getAllOutboundLeads();
      setLeads(allLeads);
      setFilteredLeads(allLeads);
      const statuses = getUniqueOutboundStatuses();
      setEstados(statuses);
      if (statuses.length > 0) {
        setVisibleColumns((prev) => {
          const combined = [...new Set([...DEFAULT_OUTBOUND_COLUMNS, ...prev, ...statuses])];
          return combined.length > 0 ? combined : DEFAULT_OUTBOUND_COLUMNS;
        });
      }
      setZonas([]);
      setTiposPropiedad([]);
      setMotivosInteres([]);
      setPropiedadesInteres([]);
      setIsLoading(false);
    };
    loadData();
  }, []);

  const statusOptions = useMemo(() => {
    const base = ['active', 'respondio', 'llamada', 'no_contesta', 'cerrado'];
    const merged = [...new Set([...base, ...(estados || [])].filter(Boolean).map(String))];
    return merged.sort();
  }, [estados]);

  const attentionEtiquetasCount = useMemo(() => {
    return leads.filter((l) => matchesOutboundTablePhoneFrom(l) && leadHasAttentionEtiquetas(l)).length;
  }, [leads]);

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
      const ok = await updateOutboundLeadStatus(leadId, estado);
      if (ok) {
        setLeads((prev) => prev.map((l) => (String(l.id) === String(leadId) ? { ...l, estado } : l)));
        setFilteredLeads((prev) => prev.map((l) => (String(l.id) === String(leadId) ? { ...l, estado } : l)));
        setStatusDropdownOpenFor(null);
        setEstados(getUniqueOutboundStatuses());
      } else {
        alert('Error al actualizar el estado del lead outbound.');
      }
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const filtered = useMemo(() => {
    let out = filterOutboundLeads(filterOptions);
    if (!Array.isArray(out)) return leads;
    if (attentionEtiquetasFilter) {
      out = out.filter((l) => leadHasAttentionEtiquetas(l));
    }
    if (deferredSearchTerm?.trim()) {
      const q = deferredSearchTerm.toLowerCase().trim();
      const qRaw = deferredSearchTerm.trim();
      out = out.filter((l) => {
        const name = (l.nombreCompleto || (l as any).nombre || '').toLowerCase();
        const tel = String((l as any).phone ?? (l as any).whatsapp_id ?? l.telefono ?? '');
        return name.includes(q) || tel.includes(qRaw);
      });
    }
    return out;
  }, [leads, filterOptions, deferredSearchTerm, attentionEtiquetasFilter]);

  useEffect(() => {
    setFilteredLeads(filtered);
  }, [filtered]);

  const handleFilterChange = (opts: FilterOptions) => setFilterOptions(opts);
  const handleResetFilters = () => {
    setFilterOptions({});
    setSearchTerm('');
  };
  const handleExportCSV = () => exportLeadsToCSV(filteredLeads, 'leads_outbound');
  const handleSaveLead = async (leadData: Partial<Lead>) => {
    const phone = leadData.phone ?? leadData.telefono ?? '';
    const customer_name = leadData.nombreCompleto ?? leadData.nombre ?? '';
    if (leadToEdit) {
      const updated = await updateOutboundLead(leadToEdit.id, { customer_name, phone });
      if (updated) {
        setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        setFilteredLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
        setLeadToEdit(updated);
        alert('Lead actualizado');
      } else alert('Error al actualizar');
    } else {
      const created = await createOutboundLead({ phone, customer_name: customer_name || undefined });
      if (created) {
        setLeads((prev) => [created, ...prev]);
        setFilteredLeads((prev) => [created, ...prev]);
        setEstados(getUniqueOutboundStatuses());
        setIsEditSidebarOpen(false);
        setLeadToEdit(null);
        alert('Lead creado');
      } else alert('Error al crear. Revisa que el teléfono sea válido y no esté duplicado.');
    }
  };

  const getPhone = (l: Lead) => (l as any).phone || (l as any).whatsapp_id || l.telefono || '';
  const getNombre = (l: Lead) => l.nombreCompleto || (l as any).nombre || '—';
  const getEtiqueta = (l: Lead) => (l as any).etiqueta ?? (l as any).propiedad_interes ?? '—';

  const toggleColumnSelector = () => setIsColumnSelectorVisible((v) => !v);
  const handleAddColumn = () => {
    const normalized = normalizeColumnName(newColumnName.trim().toLowerCase());
    if (!newColumnName.trim() || visibleColumns.includes(normalized)) return;
    setCustomColumns((c) => [...c, normalized]);
    setVisibleColumns((v) => [...v, normalized]);
    setColumnColors((c) => ({ ...c, [normalized]: newColumnColor }));
    setNewColumnName('');
    setNewColumnColor('#3b82f6');
    setIsAddColumnModalVisible(false);
  };
  const handleDeleteCustomColumn = (columnName: string) => {
    setCustomColumns((c) => c.filter((col) => col !== columnName));
    setVisibleColumns((v) => v.filter((col) => col !== columnName));
    setColumnColors((c) => {
      const next = { ...c };
      delete next[columnName];
      return next;
    });
  };
  const allColumns = [...new Set([...visibleColumns, ...customColumns])];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8">
          <div className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200 mb-6">
            <div className="px-2 py-2"><Skeleton className="h-4 w-64" /></div>
            <div className="px-6 py-2 flex justify-between items-center border-t border-gray-200">
              <Skeleton className="h-6 w-40" />
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden mx-4 sm:mx-6">
            <div className="p-2">
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
      <div className="mb-8">
        <div className="sticky top-0 z-10 backdrop-blur bg-white border-b border-slate-200 mb-6">
          <div className="px-2 bg-slate-100 py-3">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1 md:space-x-3">
                <li className="inline-flex items-center">
                  <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>
                    Inicio
                  </Link>
                </li>
                <li>
                  <div className="flex items-center">
                    <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    <Link href="/leads" className="ml-1 text-sm font-medium text-gray-500 md:ml-2 hover:text-gray-700">Leads</Link>
                  </div>
                </li>
                <li aria-current="page">
                  <div className="flex items-center">
                    <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    <span className="ml-1 text-sm font-medium text-gray-600 md:ml-2">Outbound</span>
                  </div>
                </li>
              </ol>
            </nav>
          </div>

          <div className="px-6 py-2 flex justify-between items-center border-t border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <h1 className="text-md font-semibold text-slate-800 tracking-tight">Tablero Outbound</h1>
                {(searchTerm || filterOptions.estado || attentionEtiquetasFilter) && (
                  <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                    {filteredLeads.length} resultado{filteredLeads.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <input
                  type="text"
                  placeholder="Buscar por nombre o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-64 pl-10 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center" title="Limpiar búsqueda">
                    <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <span className="sr-only md:not-sr-only md:inline whitespace-nowrap">Estado</span>
                <select
                  value={String(filterOptions.estado ?? '')}
                  onChange={(e) =>
                    setFilterOptions((prev) => ({
                      ...prev,
                      estado: e.target.value ? (e.target.value as any) : undefined,
                    }))
                  }
                  className="border border-gray-300 rounded-lg text-sm py-1.5 pl-2 pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500 min-w-[140px]"
                  aria-label="Filtrar por estado"
                >
                  <option value="">Todos los estados</option>
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => setAttentionEtiquetasFilter((v) => !v)}
                className={[
                  'relative inline-flex items-center justify-center rounded-lg border p-2 transition-colors',
                  attentionEtiquetasFilter
                    ? 'border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-200'
                    : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
                ].join(' ')}
                title={
                  attentionEtiquetasFilter
                    ? 'Quitar filtro de etiquetas (inspección, presupuesto, deriva humano)'
                    : 'Ver solo leads con inspección, presupuesto o deriva humano'
                }
                aria-pressed={attentionEtiquetasFilter}
                aria-label={`Alertas de etiquetas: ${attentionEtiquetasCount} leads`}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                {attentionEtiquetasCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white tabular-nums">
                    {attentionEtiquetasCount > 99 ? '99+' : attentionEtiquetasCount}
                  </span>
                )}
              </button>
            </div>
            <div className="flex space-x-2">
              {!isSelectionMode ? (
                <button onClick={() => setIsSelectionMode(true)} className="p-2 rounded-lg flex items-center justify-center border border-gray-200 bg-white/60 hover:bg-white text-slate-700" title="Seleccionar">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  <span className="ml-1 text-sm">Seleccionar</span>
                </button>
              ) : (
                <button onClick={() => setIsSelectionMode(false)} className="p-2 rounded-lg flex items-center justify-center border border-gray-300 text-gray-700 bg-gray-100 hover:bg-gray-200" title="Cancelar">
                  Cancelar
                </button>
              )}
              <AgentStatusToggle className="py-1 px-2 text-sm" />
              <button onClick={() => setIsAddColumnModalVisible(true)} className="bg-gray-600 hover:bg-gray-700 px-3 py-0.5 text-white p-2 rounded-xl flex items-center justify-center" title="Agregar Columna">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <button onClick={() => { setLeadToEdit(null); setIsEditSidebarOpen(true); }} className="hover:bg-gray-100 p-2 rounded-xl text-black border border-gray-200 flex items-center justify-center" title="Nuevo Lead">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <button onClick={toggleColumnSelector} className={`p-2 rounded-xl flex items-center justify-center border ${isColumnSelectorVisible ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white/60 hover:bg-white border-gray-200 text-slate-700'}`} title={isColumnSelectorVisible ? 'Ocultar columnas' : 'Mostrar columnas'}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              </button>
              <button onClick={() => setIsFilterVisible((v) => !v)} className={`p-2 rounded-lg flex items-center justify-center border ${isFilterVisible ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white/60 hover:bg-white border-gray-200 text-slate-700'}`} title={isFilterVisible ? 'Ocultar filtros' : 'Mostrar filtros'}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
              </button>
            </div>
          </div>

          {propiedadesInteres.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-200 bg-white/70">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-xs font-medium text-gray-600 mr-1 whitespace-nowrap">Productos:</span>
                <button onClick={() => handleFilterChange({ ...filterOptions, propiedadInteres: undefined })} className={`px-3 py-1 text-xs rounded-full border ${!filterOptions.propiedadInteres ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>Todas</button>
                {(showAllCampaigns ? propiedadesInteres : propiedadesInteres.slice(0, 5)).map((p) => (
                  <button key={p} onClick={() => handleFilterChange({ ...filterOptions, propiedadInteres: p })} className={`px-3 py-1 text-xs rounded-full border ${filterOptions.propiedadInteres === p ? 'bg-gray-600 text-white border-gray-600' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>{p}</button>
                ))}
              </div>
            </div>
          )}

          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isFilterVisible ? 'max-h-96' : 'max-h-0'}`}>
            <LeadFilter filterOptions={filterOptions} onFilterChange={handleFilterChange} zonas={zonas} estados={estados} tiposPropiedad={tiposPropiedad} motivosInteres={motivosInteres} propiedadesInteres={propiedadesInteres} onResetFilters={handleResetFilters} />
          </div>
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isColumnSelectorVisible ? 'max-h-96' : 'max-h-0'}`}>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Columnas visibles</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {allColumns.map((column) => (
                  <div key={column} className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 cursor-pointer flex-1">
                      <input type="checkbox" checked={visibleColumns.includes(column)} readOnly className="rounded border-gray-300 text-gray-600 focus:ring-gray-500" />
                      <span className="text-sm text-gray-700 capitalize">{column}</span>
                    </label>
                    {customColumns.includes(column) && (
                      <button type="button" onClick={() => handleDeleteCustomColumn(column)} className="text-xs text-red-600 hover:text-red-800">Eliminar</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white px-2 mb-8 overflow-hidden">
          <div className="mx-1 sm:mx-2 bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Teléfono
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Fecha/Hora Contacto
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Estado
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Etiquetas
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-gray-500 text-sm">
                      No hay leads outbound. Ajustá los filtros o agregá un nuevo lead.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => {
                    const outboundTags = getLeadBooleanEtiquetaLabels(lead);
                    const legacyEtiqueta = getEtiqueta(lead);
                    const legacyOk = legacyEtiqueta && legacyEtiqueta !== '—';
                    return (
                    <tr key={lead.id} className="hover:bg-gray-50/80">
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium text-gray-900">
                        {getNombre(lead)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-600">
                        {getPhone(lead) || '—'}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm text-gray-600">
                        {formatDateTime(lead.fechaContacto || lead.created_at)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() =>
                              setStatusDropdownOpenFor((cur) => (cur === lead.id ? null : String(lead.id)))
                            }
                            disabled={!!statusUpdatingId && statusUpdatingId !== String(lead.id)}
                            className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${getLeadEstadoPillClass(lead.estado)} cursor-pointer select-none`}
                            aria-haspopup="listbox"
                            aria-expanded={statusDropdownOpenFor === String(lead.id)}
                            title="Cambiar estado"
                          >
                            {lead.estado || '—'}
                          </button>

                          {statusDropdownOpenFor === String(lead.id) && (
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
                                  onClick={() => handleUpdateEstado(String(lead.id), opt)}
                                  disabled={statusUpdatingId === String(lead.id)}
                                >
                                  {opt}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[280px]">
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {outboundTags.map((label) => (
                            <span
                              key={label}
                              className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-indigo-50 text-indigo-800 ring-1 ring-indigo-600/15 whitespace-nowrap"
                            >
                              {label}
                            </span>
                          ))}
                          {legacyOk && (
                            <span className="text-xs text-gray-500 truncate max-w-[160px]" title={legacyEtiqueta}>
                              {legacyEtiqueta}
                            </span>
                          )}
                          {outboundTags.length === 0 && !legacyOk && (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-right text-sm">
                        <span className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setLeadForDetail(lead);
                              setIsDetailSidebarOpen(true);
                            }}
                            className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50"
                            title="Ver perfil"
                            aria-label="Ver perfil"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </button>
                          <Link
                            href={`/chat?phoneNumber=${encodeURIComponent(getPhone(lead).replace(/^\++/, ''))}`}
                            className="p-1.5 rounded-md text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 inline-flex"
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
                            className="p-1.5 rounded-md text-gray-600 hover:text-gray-800 hover:bg-gray-100"
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
      </div>

        {/* Modal para agregar columnas */}
        {isAddColumnModalVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar Nueva Columna</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la columna</label>
                <input
                  type="text"
                  value={newColumnName}
                  onChange={(e) => setNewColumnName(e.target.value)}
                  placeholder="Ej: seguimiento, negociación, etc."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddColumn()}
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Color de la columna</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={newColumnColor} onChange={(e) => setNewColumnColor(e.target.value)} className="h-10 w-20 border border-gray-300 rounded-md cursor-pointer" />
                  <input type="text" value={newColumnColor} onChange={(e) => setNewColumnColor(e.target.value)} placeholder="#3b82f6" className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm font-mono" />
                </div>
                <p className="text-xs text-gray-500 mt-1">Selecciona un color para los badges de esta columna</p>
              </div>
              <div className="flex justify-end space-x-3">
                <button onClick={() => { setIsAddColumnModalVisible(false); setNewColumnName(''); setNewColumnColor('#3b82f6'); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">Cancelar</button>
                <button onClick={handleAddColumn} disabled={!newColumnName.trim()} className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">Agregar</button>
              </div>
            </div>
          </div>
        )}

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
        columnColors={columnColors}
      />

      <LeadEditSidebar
        lead={leadToEdit}
        isOpen={isEditSidebarOpen}
        onClose={() => {
          setIsEditSidebarOpen(false);
          setLeadToEdit(null);
        }}
        onSave={handleSaveLead}
      />
    </AppLayout>
  );
}
