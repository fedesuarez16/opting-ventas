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
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

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

export default function LeadsTablePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  /** '' = todos; valores alineados con normalizeLeadEstadoKey */
  const [filterEstado, setFilterEstado] = useState<string>('');
  /** '' = todas; 1 | 2 | 3 = estrellas exactas en calidad */
  const [filterCalidadStars, setFilterCalidadStars] = useState<string>('');

  const statusOptions: string[] = ['frío', 'tibio', 'caliente', 'llamada', 'llamada realizada', 'lista de difusion'];
  const estadoFilterOptions: { value: string; label: string }[] = [
    { value: '', label: 'Todos los estados' },
    { value: 'frío', label: 'Frío' },
    { value: 'tibio', label: 'Tibio' },
    { value: 'caliente', label: 'Caliente' },
    { value: 'llamada', label: 'Llamada' },
  ];
  const calidadFilterOptions: { value: string; label: string }[] = [
    { value: '', label: 'Todas las calidades' },
    { value: '1', label: '1 estrella' },
    { value: '2', label: '2 estrellas' },
    { value: '3', label: '3 estrellas' },
  ];
  const [statusDropdownOpenFor, setStatusDropdownOpenFor] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);

  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  const [isEditSidebarOpen, setIsEditSidebarOpen] = useState(false);
  const [leadForDetail, setLeadForDetail] = useState<Lead | null>(null);
  const [isDetailSidebarOpen, setIsDetailSidebarOpen] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const data = await getAllLeads();
      setLeads(data);
      setFilteredLeads(data);
      setIsLoading(false);
    };
    load();
  }, []);

  const getLeadQuality = (l: Lead): number => {
    const raw =
      (l as any).calidad ??
      (l as any).calidad_lead ??
      (l as any).lead_quality ??
      (l as any).quality ??
      (l as any).rating ??
      (l as any).estrellas ??
      (l as any).stars ??
      (l as any).score;
    const n = Number(raw);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(3, Math.trunc(n)));
  };

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
    if (filterCalidadStars) {
      const n = Number(filterCalidadStars);
      if (Number.isFinite(n)) {
        out = out.filter((l) => getLeadQuality(l) === n);
      }
    }
    return out;
  }, [leads, searchTerm, filterEstado, filterCalidadStars]);

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
  const renderQualityStars = (l: Lead) => {
    const q = getLeadQuality(l);
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={`Calidad ${q}/3`}>
        {[1, 2, 3].map((i) => (
          <span key={i} className={i <= q ? 'text-yellow-500' : 'text-gray-300'}>
            ★
          </span>
        ))}
      </span>
    );
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8 mx-1 sm:mx-1">
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
      <div className="mb-8 mx-4 sm:mx-1">
        <div className="bg-white shadow-sm border border-gray-200 rounded-lg mb-4 px-4 sm:px-2">
          <div className="px-4 py-2">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1 md:space-x-3">
                <li>
                  <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-indigo-600">
                    Inicio
                  </Link>
                </li>
                <li>
                  <span className="mx-1 text-gray-400">/</span>
                  <span className="text-sm font-medium text-indigo-600" aria-current="page">Leads</span>
                </li>
              </ol>
            </nav>
          </div>

          <div className="px-6 py-3 flex justify-between items-center border-t border-gray-100 flex-wrap gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <h1 className="text-xl font-bold text-slate-800">Tabla de Leads</h1>
              {(searchTerm || filterEstado || filterCalidadStars) && (
                <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                  {filteredLeads.length} resultado{filteredLeads.length !== 1 ? 's' : ''}
                </span>
              )}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Buscar por nombre o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-64 pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <span className="sr-only md:not-sr-only md:inline whitespace-nowrap">Estado</span>
                <select
                  value={filterEstado}
                  onChange={(e) => setFilterEstado(e.target.value)}
                  className="border border-gray-300 rounded-lg text-sm py-2 pl-2 pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[140px]"
                  aria-label="Filtrar por estado"
                >
                  {estadoFilterOptions.map((opt) => (
                    <option key={opt.value || 'all'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <span className="sr-only md:not-sr-only md:inline whitespace-nowrap">Calidad</span>
                <select
                  value={filterCalidadStars}
                  onChange={(e) => setFilterCalidadStars(e.target.value)}
                  className="border border-gray-300 rounded-lg text-sm py-2 pl-2 pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[160px]"
                  aria-label="Filtrar por estrellas de calidad"
                >
                  {calidadFilterOptions.map((opt) => (
                    <option key={opt.value || 'all-cal'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="px-3 py-2 text-sm font-medium rounded-lg border border-gray-200 bg-white hover:bg-gray-50"
              >
                Exportar CSV
              </button>
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg overflow-visible shadow-sm">
          <div className="overflow-x-auto overflow-y-visible">
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
                    Etiqueta
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Calidad
                  </th>
                  <th scope="col" className="px-5 py-3.5 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredLeads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-gray-500 text-sm">
                      No hay leads para mostrar. Ajustá los filtros o la búsqueda.
                    </td>
                  </tr>
                ) : (
                  filteredLeads.map((lead) => (
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
                              setStatusDropdownOpenFor((cur) => (cur === lead.id ? null : lead.id))
                            }
                            disabled={!!statusUpdatingId && statusUpdatingId !== lead.id}
                            className={`inline-flex px-2.5 py-0.5 text-xs font-medium rounded-full capitalize ${getLeadEstadoPillClass(lead.estado)} cursor-pointer select-none`}
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
                      <td className="px-5 py-3.5 text-sm text-gray-600 max-w-[180px] truncate" title={getEtiqueta(lead)}>
                        {getEtiqueta(lead)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap text-sm">
                        {renderQualityStars(lead)}
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
                  ))
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
