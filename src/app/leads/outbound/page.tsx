'use client';

import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import AppLayout from '../../components/AppLayout';
import LeadCards from '../../components/LeadCards';
import LeadFilter from '../../components/LeadFilter';
import LeadEditSidebar from '../../components/LeadEditSidebar';
import AgentStatusToggle from '../../components/AgentStatusToggle';
import { Lead, FilterOptions, LeadStatus } from '../../types';
import {
  getAllOutboundLeads,
  filterOutboundLeads,
  getUniqueOutboundStatuses,
  updateOutboundLeadStatus,
  updateOutboundLead,
  createOutboundLead,
} from '../../services/leadOutboundService';
import { exportLeadsToCSV } from '../../utils/exportUtils';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

/** Columnas que se muestran por defecto en el Kanban outbound (puedes arrastrar leads a cualquiera) */
const DEFAULT_OUTBOUND_COLUMNS = [
  'active',
  'respondio',
  'llamada',
  'no_contesta',
  'cerrado',
];

const DEFAULT_OUTBOUND_COLORS: Record<string, string> = {
  active: '#3b82f6',
  responded: '#10b981',
  llamada: '#8b5cf6',
  visita: '#10b981',
  no_contesta: '#f59e0b',
  cerrado: '#6b7280',
};

function normalizeColumnName(col: string): string {
  return col.toLowerCase().trim();
}

export default function LeadsOutboundPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({});
  const [isFilterVisible, setIsFilterVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const [zonas, setZonas] = useState<string[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [tiposPropiedad, setTiposPropiedad] = useState<string[]>([]);
  const [motivosInteres, setMotivosInteres] = useState<string[]>([]);
  const [propiedadesInteres, setPropiedadesInteres] = useState<string[]>([]);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);

  const [isEditSidebarOpen, setIsEditSidebarOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);

  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);
  const [isAddingToSeguimientos, setIsAddingToSeguimientos] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedToque, setSelectedToque] = useState<number>(1);
  const [showToqueSelector, setShowToqueSelector] = useState(false);

  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [isAddColumnModalVisible, setIsAddColumnModalVisible] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#3b82f6');
  const [isColumnSelectorVisible, setIsColumnSelectorVisible] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_OUTBOUND_COLUMNS);
  const [columnColors, setColumnColors] = useState<Record<string, string>>(DEFAULT_OUTBOUND_COLORS);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await new Promise((r) => setTimeout(r, 300));
      const allLeads = await getAllOutboundLeads();
      setLeads(allLeads);
      setFilteredLeads(allLeads);
      const statuses = getUniqueOutboundStatuses();
      setEstados(statuses);
      // Mantener las columnas por defecto y agregar cualquier estado que venga de los datos
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

  const filteredLeadsMemo = useMemo(() => {
    if (!Array.isArray(leads) || leads.length === 0) return [];
    if (!filterOptions && !deferredSearchTerm) return leads;
    let filtered = filterOutboundLeads(filterOptions ?? {});
    if (!Array.isArray(filtered)) filtered = leads;
    if (deferredSearchTerm?.trim()) {
      const searchLower = deferredSearchTerm.toLowerCase().trim();
      const searchTrimmed = deferredSearchTerm.trim();
      filtered = filtered.filter((lead) => {
        const nombre = (lead.nombreCompleto || (lead as any).nombre || '').toLowerCase();
        const telefono = String((lead as any).whatsapp_id ?? lead.telefono ?? lead.phone ?? '');
        return nombre.includes(searchLower) || telefono.includes(searchTrimmed);
      });
    }
    return filtered;
  }, [leads, filterOptions, deferredSearchTerm]);

  useEffect(() => {
    if (Array.isArray(filteredLeadsMemo)) setFilteredLeads(filteredLeadsMemo);
  }, [filteredLeadsMemo]);

  const handleFilterChange = (newFilterOptions: FilterOptions) => setFilterOptions(newFilterOptions);
  const handleResetFilters = () => {
    setFilterOptions({});
    setSearchTerm('');
  };
  const handleExportCSV = () => exportLeadsToCSV(filteredLeads, 'leads_outbound');
  const toggleFilterVisibility = () => setIsFilterVisible(!isFilterVisible);

  const handleLeadStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      const normalizedStatus = normalizeColumnName(newStatus);
      const success = await updateOutboundLeadStatus(leadId, normalizedStatus);
      if (success) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, estado: normalizedStatus as LeadStatus } : l))
        );
        setFilteredLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, estado: normalizedStatus as LeadStatus } : l))
        );
        setEstados(getUniqueOutboundStatuses());
      }
    } catch (e) {
      console.error('Error updating outbound lead status:', e);
    }
  };

  const handleOpenNewLead = () => {
    setLeadToEdit(null);
    setIsEditSidebarOpen(true);
  };
  const handleOpenEditLead = (lead: Lead) => {
    setLeadToEdit(lead);
    setIsEditSidebarOpen(true);
  };
  const handleCloseEditSidebar = () => {
    setIsEditSidebarOpen(false);
    setLeadToEdit(null);
  };
  const handleSelectionChange = (leads: Lead[]) => setSelectedLeads(leads);

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
  const handleColumnToggle = (column: string) => {
    setVisibleColumns((v) =>
      v.includes(column) ? v.filter((c) => c !== column) : [...v, column]
    );
  };
  const toggleColumnSelector = () => setIsColumnSelectorVisible(!isColumnSelectorVisible);

  const allColumns = [...new Set([...visibleColumns, ...customColumns])];

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

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8">
          <div className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200 mb-6">
            <div className="px-2 py-2">
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="px-6 py-2 flex justify-between items-center border-t border-gray-200">
              <Skeleton className="h-6 w-40" />
            </div>
          </div>
          <div className="w-full overflow-x-auto pb-1">
            <div className="flex gap-2 min-w-max pr-2">
              {[1, 2, 3].map((col) => (
                <div key={col} className="min-w-[240px] bg-slate-100 border-gray-400 rounded-xl h-64" />
              ))}
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
              <h1 className="text-md font-semibold text-slate-800 tracking-tight">Tablero Outbound</h1>
              {searchTerm && (
                <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                  {filteredLeads.length} resultado{filteredLeads.length !== 1 ? 's' : ''}
                </span>
              )}
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
            </div>
            <div className="flex space-x-2">
              {!isSelectionMode ? (
                <button onClick={() => setIsSelectionMode(true)} className="bg-black hover:bg-black text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center justify-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  Seleccionar
                </button>
              ) : (
                <button onClick={() => { setIsSelectionMode(false); setSelectedLeads([]); }} className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-md text-sm font-semibold">
                  Cancelar
                </button>
              )}
              <AgentStatusToggle className="py-1 px-2 text-sm" />
              <button onClick={() => setIsAddColumnModalVisible(true)} className="bg-gray-600 hover:bg-gray-700 px-3 py-2 text-white rounded-xl flex items-center justify-center" title="Agregar Columna">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <button onClick={handleOpenNewLead} className="hover:bg-gray-800 p-2 rounded-xl text-black border border-gray-200 flex items-center justify-center" title="Nuevo Lead">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <button onClick={toggleColumnSelector} className={`p-2 rounded-xl flex items-center justify-center border ${isColumnSelectorVisible ? 'border-gray-300 text-gray-700' : 'bg-white/60 hover:bg-white border-gray-200 text-slate-700'}`} title={isColumnSelectorVisible ? 'Ocultar columnas' : 'Mostrar columnas'}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
              </button>
              <button onClick={toggleFilterVisibility} className={`p-2 rounded-lg flex items-center justify-center border ${isFilterVisible ? 'bg-gray-100 border-gray-300 text-gray-700' : 'bg-white/60 hover:bg-white border-gray-200 text-slate-700'}`} title={isFilterVisible ? 'Ocultar filtros' : 'Mostrar filtros'}>
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
                      <input type="checkbox" checked={visibleColumns.includes(column)} onChange={() => handleColumnToggle(column)} className="rounded border-gray-300 text-gray-600 focus:ring-gray-500" />
                      <span className="text-sm text-gray-700 capitalize">{column}</span>
                    </label>
                    {customColumns.includes(column) && (
                      <button onClick={() => handleDeleteCustomColumn(column)} className="text-xs text-red-600 hover:text-red-800">Eliminar</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white px-2 mb-8 overflow-hidden">
          <LeadCards
            leads={filteredLeads}
            onLeadStatusChange={handleLeadStatusChange}
            onEditLead={handleOpenEditLead}
            visibleColumns={visibleColumns}
            columnColors={columnColors}
            onSelectionChange={handleSelectionChange}
            selectedLeadIds={new Set(selectedLeads.map((l) => l.id))}
            isSelectionMode={isSelectionMode}
            onSelectionModeChange={(enabled) => { setIsSelectionMode(enabled); if (!enabled) setSelectedLeads([]); }}
          />
        </div>
        {isAddColumnModalVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar columna</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre</label>
                <input value={newColumnName} onChange={(e) => setNewColumnName(e.target.value)} placeholder="Ej: responded" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500" onKeyDown={(e) => e.key === 'Enter' && handleAddColumn()} />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={newColumnColor} onChange={(e) => setNewColumnColor(e.target.value)} className="h-10 w-20 border border-gray-300 rounded-md cursor-pointer" />
                  <input value={newColumnColor} onChange={(e) => setNewColumnColor(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono" />
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button onClick={() => { setIsAddColumnModalVisible(false); setNewColumnName(''); setNewColumnColor('#3b82f6'); }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md">Cancelar</button>
                <button onClick={handleAddColumn} disabled={!newColumnName.trim()} className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-md disabled:opacity-50">Agregar</button>
              </div>
            </div>
          </div>
        )}
      </div>
      <LeadEditSidebar lead={leadToEdit} isOpen={isEditSidebarOpen} onClose={handleCloseEditSidebar} onSave={handleSaveLead} />
    </AppLayout>
  );
}
