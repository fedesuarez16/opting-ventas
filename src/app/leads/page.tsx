'use client';

import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react';
import AppLayout from '../components/AppLayout';
import LeadCards from '../components/LeadCards';
import LeadFilter from '../components/LeadFilter';
import LeadEditSidebar from '../components/LeadEditSidebar';
import AgentStatusToggle from '../components/AgentStatusToggle';
import { Lead, FilterOptions, LeadStatus } from '../types';
import { 
  getAllLeads, 
  filterLeads, 
  getUniqueZones,
  getUniqueStatuses,
  getUniquePropertyTypes,
  getUniqueInterestReasons,
  getUniquePropertyInterests,
  updateLeadStatus,
  createLead,
  updateLead
} from '../services/leadService';
import { exportLeadsToCSV } from '../utils/exportUtils';
import { getKanbanColumns, saveKanbanColumns, migrateColumnsFromLocalStorage } from '../services/columnService';
import { programarSeguimiento } from '../services/mensajeService';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

export default function LeadsKanbanPage() {
  // Todos los hooks deben estar al inicio, antes de cualquier return condicional
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({});
  const [isFilterVisible, setIsFilterVisible] = useState(false); // Por defecto cerrado
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  
  const [zonas, setZonas] = useState<string[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [tiposPropiedad, setTiposPropiedad] = useState<string[]>([]);
  const [motivosInteres, setMotivosInteres] = useState<string[]>([]);
  const [propiedadesInteres, setPropiedadesInteres] = useState<string[]>([]);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  
  // Estados para el sidebar de edición
  const [isEditSidebarOpen, setIsEditSidebarOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<Lead | null>(null);
  
  // Estado para selección múltiple
  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);
  const [isAddingToSeguimientos, setIsAddingToSeguimientos] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedToque, setSelectedToque] = useState<number>(1);
  const [showToqueSelector, setShowToqueSelector] = useState(false);
  
  // Estados para columnas personalizadas
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [isAddColumnModalVisible, setIsAddColumnModalVisible] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [newColumnColor, setNewColumnColor] = useState('#3b82f6'); // Color por defecto (azul)
  const [isColumnSelectorVisible, setIsColumnSelectorVisible] = useState(false);
  // Siempre excluir "frío" de las columnas visibles
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['tibio', 'caliente', 'llamada', 'visita']);
  const [columnColors, setColumnColors] = useState<Record<string, string>>({});

  // Función para normalizar nombres de columnas
  const normalizeColumnName = (col: string): string => {
    const colLower = col.toLowerCase().trim();
    if (colLower === 'fríos' || colLower === 'frios') return 'frío';
    if (colLower === 'tibios') return 'tibio';
    if (colLower === 'calientes') return 'caliente';
    if (colLower === 'llamadas') return 'llamada';
    if (colLower === 'visitas') return 'visita';
    return colLower;
  };

  // Cargar columnas personalizadas desde Supabase al inicializar
  useEffect(() => {
    const loadColumns = async () => {
      try {
        // Primero intentar migrar desde localStorage si existe
        await migrateColumnsFromLocalStorage();
        
        // Cargar columnas desde Supabase
        const { customColumns: loadedCustom, visibleColumns: loadedVisible, columnColors: loadedColors } = await getKanbanColumns();
        
        // Normalizar las columnas visibles para eliminar "Fríos" y "frío"
        const normalizedVisible = loadedVisible
          .map(normalizeColumnName)
          .filter((col, index, self) => self.indexOf(col) === index) // Eliminar duplicados
          .filter(col => col !== 'fríos' && col !== 'frios' && col !== 'frío'); // Filtrar explícitamente "Fríos" y "frío"
        
        setCustomColumns(loadedCustom);
        // Siempre excluir "frío" de las columnas visibles
        setVisibleColumns(normalizedVisible.length > 0 ? normalizedVisible : ['tibio', 'caliente', 'llamada', 'visita']);
        setColumnColors(loadedColors);
      } catch (error) {
        console.error('Error loading columns from Supabase:', error);
        // Fallback a valores por defecto (sin "frío")
        setCustomColumns([]);
        setVisibleColumns(['tibio', 'caliente', 'llamada', 'visita']);
      }
    };
    
    loadColumns();
  }, []);
  
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      // Simulamos una carga asíncrona para mostrar el efecto de carga
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const allLeads = await getAllLeads();
      setLeads(allLeads);
      setFilteredLeads(allLeads);
      
      // Cargar opciones para los filtros
      setZonas(getUniqueZones());
      setEstados(getUniqueStatuses());
      setTiposPropiedad(getUniquePropertyTypes());
      setMotivosInteres(getUniqueInterestReasons());
      setPropiedadesInteres(getUniquePropertyInterests());
      
      setIsLoading(false);
    };
    
    loadData();
  }, []);
  
  // Usar useMemo con deferredSearchTerm para evitar recálculos excesivos
  const filteredLeadsMemo = useMemo(() => {
    try {
      // Validar que leads sea un array
      if (!Array.isArray(leads)) {
        return [];
      }
      
      // Si no hay leads, retornar array vacío
      if (leads.length === 0) {
        return [];
      }
      
      // Validar que filterOptions y deferredSearchTerm sean válidos
      if (!filterOptions || typeof deferredSearchTerm !== 'string') {
        return leads;
      }
      
      let filtered = filterLeads(filterOptions);
      
      // Validar que filtered sea un array
      if (!Array.isArray(filtered)) {
        console.error('filterLeads did not return an array:', filtered);
        return leads;
      }
      
      // Aplicar búsqueda por texto si hay término de búsqueda
      if (deferredSearchTerm && deferredSearchTerm.trim()) {
        const searchLower = deferredSearchTerm.toLowerCase().trim();
        const searchTermTrimmed = deferredSearchTerm.trim();
        filtered = filtered.filter(lead => {
          try {
            if (!lead) return false;
            
            const nombre = (lead.nombreCompleto || (lead as any).nombre || '').toLowerCase();
            const telefono = String((lead as any).whatsapp_id || lead.telefono || '');
            const email = (lead.email || '').toLowerCase();
            
            return nombre.includes(searchLower) || 
                   telefono.includes(searchTermTrimmed) ||
                   email.includes(searchLower);
          } catch (e) {
            console.error('Error filtering lead:', e, lead);
            return false;
          }
        });
      }
      
      // Asegurar que siempre retornamos un array
      return Array.isArray(filtered) ? filtered : [];
    } catch (error) {
      console.error('Error in filter memo:', error);
      // Siempre retornar un array válido
      return Array.isArray(leads) ? leads : [];
    }
  }, [leads, filterOptions, deferredSearchTerm]);

  // Actualizar filteredLeads cuando cambie el memo
  useEffect(() => {
    if (Array.isArray(filteredLeadsMemo)) {
      setFilteredLeads(filteredLeadsMemo);
    }
  }, [filteredLeadsMemo]);
  
  const handleFilterChange = (newFilterOptions: FilterOptions) => {
    setFilterOptions(newFilterOptions);
  };
  
  const handleResetFilters = () => {
    setFilterOptions({});
    setSearchTerm('');
  };

  const handleExportCSV = () => {
    exportLeadsToCSV(filteredLeads, 'leads');
  };

  const toggleFilterVisibility = () => {
    setIsFilterVisible(!isFilterVisible);
  };

  const handleLeadStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    try {
      console.log(`Updating lead ${leadId} from status to ${newStatus}`);
      
      // Normalizar el estado antes de actualizar
      const normalizedStatus = normalizeColumnName(newStatus);
      
      // Si el estado normalizado es "frío", no permitir el cambio
      if (normalizedStatus === 'frío') {
        alert('No se puede cambiar el estado a "frío". Esta columna está deshabilitada.');
        return;
      }
      
      // Actualizar el estado del lead en el servicio
      const success = await updateLeadStatus(leadId, normalizedStatus);
      
      if (success) {
        console.log(`Successfully updated lead ${leadId} to ${normalizedStatus}`);
        
        // Actualizar el estado local con el estado normalizado
        setLeads(prevLeads => 
          prevLeads.map(lead => 
            lead.id === leadId ? { ...lead, estado: normalizedStatus as LeadStatus } : lead
          )
        );
        
        // Actualizar los leads filtrados
        setFilteredLeads(prevLeads => 
          prevLeads.map(lead => 
            lead.id === leadId ? { ...lead, estado: normalizedStatus as LeadStatus } : lead
          )
        );
        
        // Actualizar estados únicos para incluir el nuevo estado personalizado
        setEstados(getUniqueStatuses());
      } else {
        console.error(`Failed to update lead ${leadId} status in database`);
        // Aquí podrías mostrar una notificación de error al usuario
      }
    } catch (error) {
      console.error('Error updating lead status:', error);
      // Aquí podrías mostrar una notificación de error al usuario
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

  const handleSelectionChange = (leads: Lead[]) => {
    setSelectedLeads(leads);
  };

  const handleAddToSeguimientos = async () => {
    if (selectedLeads.length === 0) {
      alert('❌ Por favor selecciona al menos un lead');
      return;
    }

    // Mostrar selector de toque si no se ha mostrado
    if (!showToqueSelector) {
      setShowToqueSelector(true);
      return;
    }

    if (!confirm(`¿Agregar ${selectedLeads.length} lead(s) a la cola de seguimientos con toque ${selectedToque}?`)) {
      return;
    }

    setIsAddingToSeguimientos(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const lead of selectedLeads) {
        try {
          // Obtener número de teléfono del lead
          const remoteJid = (lead as any).whatsapp_id || lead.telefono || '';
          
          if (!remoteJid) {
            console.warn(`Lead ${lead.id} no tiene número de teléfono`);
            errorCount++;
            continue;
          }

          // Preparar datos del seguimiento con el toque seleccionado
          const seguimientoData: any = {
            remote_jid: remoteJid,
            tipo_lead: lead.estado || null,
            seguimientos_count: selectedToque // Usar el toque seleccionado
          };

          // Agregar fecha_ultima_interaccion si existe
          if ((lead as any).ultima_interaccion) {
            seguimientoData.fecha_ultima_interaccion = (lead as any).ultima_interaccion;
          } else if (lead.fechaContacto) {
            seguimientoData.fecha_ultima_interaccion = lead.fechaContacto;
          }

          // Agregar chatwoot_conversation_id si existe
          if ((lead as any).chatwoot_conversation_id) {
            seguimientoData.chatwoot_conversation_id = (lead as any).chatwoot_conversation_id;
          }

          const result = await programarSeguimiento(seguimientoData);

          if (result.success) {
            successCount++;
            // Actualizar el contador de seguimientos en el lead con el toque seleccionado
            // Tanto si se creó nuevo como si se actualizó existente (porque el seguimientos_count se actualiza en ambos casos)
            await updateLead(lead.id, { seguimientos_count: selectedToque });
          } else {
            errorCount++;
          }
        } catch (error) {
          console.error(`Error agregando lead ${lead.id} a seguimientos:`, error);
          errorCount++;
        }
      }

      // Mostrar resultado
      if (errorCount === 0) {
        alert(`✅ ${successCount} lead(s) agregado(s) exitosamente a la cola de seguimientos con toque ${selectedToque}`);
      } else {
        alert(`⚠️ ${successCount} lead(s) agregado(s), ${errorCount} con error(es)`);
      }

      // Limpiar selección y resetear
      setSelectedLeads([]);
      setShowToqueSelector(false);
      setSelectedToque(1);
      
      // Recargar leads para actualizar los contadores
      const allLeads = await getAllLeads();
      setLeads(allLeads);
    } catch (error) {
      console.error('Error agregando leads a seguimientos:', error);
      alert('❌ Error al agregar leads a la cola de seguimientos');
    } finally {
      setIsAddingToSeguimientos(false);
    }
  };

  // Funciones para manejar columnas personalizadas
  const handleAddColumn = async () => {
    const normalizedColumn = normalizeColumnName(newColumnName.trim().toLowerCase());
    
    // Nunca permitir agregar "frío" o sus variaciones
    if (normalizedColumn === 'frío' || normalizedColumn === 'fríos' || normalizedColumn === 'frios') {
      alert('No se puede agregar la columna "frío"');
      return;
    }
    
    if (newColumnName.trim() && !visibleColumns.includes(normalizedColumn)) {
      const updatedCustomColumns = [...customColumns, normalizedColumn];
      const updatedVisibleColumns = [...visibleColumns, normalizedColumn];
      const updatedColumnColors = { ...columnColors, [normalizedColumn]: newColumnColor };
      
      setCustomColumns(updatedCustomColumns);
      setVisibleColumns(updatedVisibleColumns);
      setColumnColors(updatedColumnColors);
      
      // Guardar en Supabase
      const success = await saveKanbanColumns(updatedCustomColumns, updatedVisibleColumns, updatedColumnColors);
      if (!success) {
        console.error('Error saving columns to Supabase');
        alert('Error al guardar la columna. Por favor intenta nuevamente.');
        // Revertir cambios locales
        setCustomColumns(customColumns);
        setVisibleColumns(visibleColumns);
        setColumnColors(columnColors);
        return;
      }
      
      setNewColumnName('');
      setNewColumnColor('#3b82f6'); // Resetear a color por defecto
      setIsAddColumnModalVisible(false);
    }
  };

  const handleDeleteCustomColumn = async (columnName: string) => {
    const updatedCustomColumns = customColumns.filter(col => col !== columnName);
    const updatedVisibleColumns = visibleColumns.filter(col => col !== columnName);
    const updatedColumnColors = { ...columnColors };
    delete updatedColumnColors[columnName];
    
    setCustomColumns(updatedCustomColumns);
    setVisibleColumns(updatedVisibleColumns);
    setColumnColors(updatedColumnColors);
    
    // Guardar en Supabase
    const success = await saveKanbanColumns(updatedCustomColumns, updatedVisibleColumns, updatedColumnColors);
    if (!success) {
      console.error('Error saving columns to Supabase');
      alert('Error al eliminar la columna. Por favor intenta nuevamente.');
      // Revertir cambios locales
      setCustomColumns(customColumns);
      setVisibleColumns(visibleColumns);
      setColumnColors(columnColors);
    }
  };

  const handleColumnToggle = async (column: string) => {
    // Nunca permitir agregar "frío"
    if (column === 'frío' || column === 'fríos' || column === 'frios') {
      return;
    }
    
    const updatedVisibleColumns = visibleColumns.includes(column) 
      ? visibleColumns.filter(col => col !== column)
      : [...visibleColumns, column];
    
    // Asegurarse de que "frío" nunca esté en las columnas visibles
    const filteredColumns = updatedVisibleColumns.filter(col => 
      col !== 'frío' && col !== 'fríos' && col !== 'frios'
    );
    
    setVisibleColumns(filteredColumns);
    
    // Guardar en Supabase
    await saveKanbanColumns(customColumns, filteredColumns, columnColors);
  };

  const toggleColumnSelector = () => {
    setIsColumnSelectorVisible(!isColumnSelectorVisible);
  };

  // Siempre excluir "frío" de las columnas disponibles
  const allColumns = ['tibio', 'caliente', 'llamada', 'visita', ...customColumns];

  const handleSaveLead = async (leadData: Partial<Lead>) => {
    try {
      if (leadToEdit) {
        // Actualizar lead existente
        const updatedLead = await updateLead(leadToEdit.id, leadData);
        if (updatedLead) {
          // Actualizar en el estado local
          setLeads(prevLeads => 
            prevLeads.map(lead => lead.id === updatedLead.id ? updatedLead : lead)
          );
          setFilteredLeads(prevLeads => 
            prevLeads.map(lead => lead.id === updatedLead.id ? updatedLead : lead)
          );
          alert('Lead actualizado exitosamente');
        } else {
          alert('Error al actualizar el lead');
        }
      } else {
        // Crear nuevo lead
        const newLead = await createLead(leadData);
        if (newLead) {
          // Agregar al estado local
          setLeads(prevLeads => [newLead, ...prevLeads]);
          setFilteredLeads(prevLeads => [newLead, ...prevLeads]);
          
          // Actualizar opciones de filtros
          setZonas(getUniqueZones());
          setEstados(getUniqueStatuses());
          setTiposPropiedad(getUniquePropertyTypes());
          setMotivosInteres(getUniqueInterestReasons());
          
          alert('Lead creado exitosamente');
        } else {
          alert('Error al crear el lead');
        }
      }
    } catch (error) {
      console.error('Error saving lead:', error);
      alert('Error al guardar el lead');
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8">
          {/* Breadcrumbs skeleton */}
          <div className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200 mb-6">
            <div className="px-2 py-2">
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="px-6 py-2 flex justify-between items-center border-t border-gray-200">
              <Skeleton className="h-6 w-40" />
              <div className="flex space-x-2">
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-8 w-8 rounded-xl" />
                <Skeleton className="h-8 w-8 rounded-xl" />
              </div>
            </div>
          </div>

          {/* Kanban board skeleton */}
          <div className="w-full overflow-x-auto pb-1">
            <div className="flex gap-2 min-w-max pr-2">
              {[1, 2, 3, 4, 5].map((col) => (
                <div key={col} className="min-w-[240px] bg-slate-100 border-gray-400 rounded-xl flex flex-col">
                  {/* Column header skeleton */}
                  <div className="m-2 bg-white p-1.5 rounded-xl flex items-center justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-5 w-8 rounded-full" />
                  </div>
                  
                  {/* Cards skeleton */}
                  <div className="flex-1 px-2 pb-2 space-y-2">
                    {[1, 2, 3].map((card) => (
                      <div key={card} className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-3 w-24 mb-1" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8  ">
        {/* Nueva topbar con breadcrumbs */}
        <div className="sticky top-0 z-10 backdrop-blur bg-white border-b border-slate-200 mb-6">
          {/* Breadcrumbs */}
          <div className="px-2  bg-slate-100 py-3">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1 md:space-x-3">
                <li className="inline-flex items-center">
                  <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-gray-600">
                    <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path>
                    </svg>
                    Inicio
                  </Link>
                </li>
                <li>
                  <div className="flex items-center">
                    <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path>
                    </svg>
                    <span className="ml-1 text-sm font-medium text-gray-500 md:ml-2">Leads</span>
                  </div>
                </li>
                <li aria-current="page">
                  <div className="flex items-center">
                    <svg className="w-6 h-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path>
                    </svg>
                    <span className="ml-1 text-sm font-regular text-gray-600 md:ml-2">Tablero Kanban</span>
                  </div>
                </li>
              </ol>
            </nav>
          </div>

          {/* Solapas: Kanban | Tabla */}
          <div className="px-6 pt-1 border-t border-gray-200 flex gap-1">
            <Link
              href="/leads"
              className="px-4 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 border-gray-200 bg-white text-slate-800 shadow-sm -mb-px"
              aria-current="page"
            >
              Tablero Kanban
            </Link>
            <Link
              href="/leads/tabla"
              className="px-4 py-2.5 text-sm font-medium rounded-t-lg border border-transparent border-b-0 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            >
              Tabla
            </Link>
          </div>

          {/* Título y acciones */}
          <div className="px-6 py-2  flex justify-between items-center border-t border-gray-200">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <h1 className="text-md font-semibold text-slate-800 tracking-tight">Tablero de Leads</h1>
                {searchTerm && (
                  <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                    {filteredLeads.length} resultado{filteredLeads.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              
              {/* Barra de búsqueda */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Buscar por nombre o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="block w-64 pl-10 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    title="Limpiar búsqueda"
                  >
                    <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="flex space-x-2">
              {!isSelectionMode ? (
                <button
                  onClick={() => setIsSelectionMode(true)}
                  className="bg-black hover:bg-black text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center justify-center shadow-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  Seleccionar
                </button>
              ) : (
                <>
                  {selectedLeads.length > 0 && (
                    <div className="flex items-center gap-2">
                      {showToqueSelector && (
                        <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-md px-3 py-2">
                          <label className="text-sm font-medium text-gray-700">Toque:</label>
                          <select
                            value={selectedToque}
                            onChange={(e) => setSelectedToque(Number(e.target.value))}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                              <option key={num} value={num}>
                                {num}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => {
                              setShowToqueSelector(false);
                              setSelectedToque(1);
                            }}
                            className="text-gray-500 hover:text-gray-700"
                            title="Cancelar"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                      <button
                        onClick={handleAddToSeguimientos}
                        disabled={isAddingToSeguimientos}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                      >
                        {isAddingToSeguimientos ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Agregando...
                          </>
                        ) : (
                          <>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            {showToqueSelector ? `Agregar ${selectedLeads.length} con toque ${selectedToque}` : `Agregar ${selectedLeads.length} a seguimientos`}
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
              <AgentStatusToggle className="py-1 px-2 text-sm" />
              
              <button
                onClick={() => setIsAddColumnModalVisible(true)}
                className="bg-gray-600 hover:bg-gray-700 px-3 py-0.5 text-white p-2 rounded-xl flex items-center justify-center"
                title="Agregar Columna"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              
              <button
                onClick={handleOpenNewLead}
                className=" hover:bg-gray-800 text-BLACK p-2 rounded-xl text-black border border-gray-200 flex items-center justify-center"
                title="Nuevo Lead"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              
              <button
                onClick={toggleColumnSelector}
                className={`p-2 rounded-xl flex items-center justify-center border ${
                  isColumnSelectorVisible 
                    ? ' border-gray-300 text-gray-700' 
                    : 'bg-white/60 hover:bg-white border-gray-200 text-slate-700'
                }`}
                title={isColumnSelectorVisible ? 'Ocultar columnas' : 'Mostrar columnas'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
              
              <button
                onClick={toggleFilterVisibility}
                className={`p-2 rounded-lg flex items-center justify-center border ${
                  isFilterVisible 
                    ? 'bg-gray-100 border-gray-300 text-gray-700' 
                    : 'bg-white/60 hover:bg-white border-gray-200 text-slate-700'
                }`}
                title={isFilterVisible ? 'Ocultar filtros' : 'Mostrar filtros'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              </button>
              
            </div>
          </div>

          {/* Barra de productos/servicios */}
          {propiedadesInteres.length > 0 && (
            <div className="px-6 py-3 border-t border-gray-200 bg-white/70">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-xs font-medium text-gray-600 mr-1 whitespace-nowrap">Productos:</span>
                <button
                  onClick={() => handleFilterChange({ ...filterOptions, propiedadInteres: undefined })}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap ${
                    !filterOptions.propiedadInteres
                      ? 'bg-gray-600 text-white border-gray-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  Todas
                </button>
                {(showAllCampaigns ? propiedadesInteres : propiedadesInteres.slice(0, 5)).map((propiedad) => (
                  <button
                    key={propiedad}
                    onClick={() => handleFilterChange({ ...filterOptions, propiedadInteres: propiedad })}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap ${
                      filterOptions.propiedadInteres === propiedad
                        ? 'bg-gray-600 text-white border-gray-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {propiedad}
                  </button>
                ))}
                {propiedadesInteres.length > 5 && (
                  <button
                    onClick={() => setShowAllCampaigns(!showAllCampaigns)}
                    className="px-3 py-1 text-xs rounded-full border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap"
                  >
                    {showAllCampaigns ? 'Mostrar menos' : `Mostrar todas (${propiedadesInteres.length - 5})`}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Barra de filtros plegable */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isFilterVisible ? 'max-h-96' : 'max-h-0'}`}>
            <LeadFilter
              filterOptions={filterOptions}
              onFilterChange={handleFilterChange}
              zonas={zonas}
              estados={estados}
              tiposPropiedad={tiposPropiedad}
              motivosInteres={motivosInteres}
              propiedadesInteres={propiedadesInteres}
              onResetFilters={handleResetFilters}
            />
          </div>

          {/* Selector de columnas plegable */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isColumnSelectorVisible ? 'max-h-96' : 'max-h-0'}`}>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-700">Seleccionar columnas visibles</h3>
                <div className="flex space-x-2">
                  <button
                    onClick={async () => {
                      // Excluir "frío" al seleccionar todas
                      const columnsWithoutFrio = allColumns.filter(col => col !== 'frío' && col !== 'fríos' && col !== 'frios');
                      setVisibleColumns(columnsWithoutFrio);
                      await saveKanbanColumns(customColumns, columnsWithoutFrio);
                    }}
                    className="text-xs text-gray-600 hover:text-gray-800 font-medium"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={async () => {
                      setVisibleColumns([]);
                      await saveKanbanColumns(customColumns, []);
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Deseleccionar todas
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {/* Filtrar "frío" de las columnas mostradas en el selector */}
                {allColumns.filter(col => col !== 'frío' && col !== 'fríos' && col !== 'frios').map((column) => (
                  <div key={column} className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column)}
                        onChange={() => handleColumnToggle(column)}
                        className="rounded border-gray-300 text-gray-600 focus:ring-gray-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{column}</span>
                    </label>
                    {customColumns.includes(column) && (
                      <button
                        onClick={() => handleDeleteCustomColumn(column)}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Panel principal */}
        <div className="bg-white px-2 mb-8 overflow-hidden ">
          <div className="">
            <LeadCards 
              leads={filteredLeads} 
              onLeadStatusChange={handleLeadStatusChange}
              onEditLead={handleOpenEditLead}
              visibleColumns={visibleColumns.filter(col => col !== 'frío' && col !== 'fríos' && col !== 'frios')}
              columnColors={columnColors}
              onSelectionChange={handleSelectionChange}
              selectedLeadIds={new Set(selectedLeads.map(l => l.id))}
              isSelectionMode={isSelectionMode}
              onSelectionModeChange={(enabled) => {
                setIsSelectionMode(enabled);
                if (!enabled) {
                  setSelectedLeads([]);
                }
              }}
            />
          </div>
        </div>

        {/* Modal para agregar columnas */}
        {isAddColumnModalVisible && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Agregar Nueva Columna</h3>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre de la columna
                </label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color de la columna
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newColumnColor}
                    onChange={(e) => setNewColumnColor(e.target.value)}
                    className="h-10 w-20 border border-gray-300 rounded-md cursor-pointer"
                  />
                  <input
                    type="text"
                    value={newColumnColor}
                    onChange={(e) => setNewColumnColor(e.target.value)}
                    placeholder="#3b82f6"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 text-sm font-mono"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Selecciona un color para los badges de esta columna</p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setIsAddColumnModalVisible(false);
                    setNewColumnName('');
                    setNewColumnColor('#3b82f6');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddColumn}
                  disabled={!newColumnName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar de edición/creación */}
      <LeadEditSidebar
        lead={leadToEdit}
        isOpen={isEditSidebarOpen}
        onClose={handleCloseEditSidebar}
        onSave={handleSaveLead}
      />
    </AppLayout>
  );
}
