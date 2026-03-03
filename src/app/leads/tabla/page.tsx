'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '../../components/AppLayout';
import LeadTable from '../../components/LeadTable';
import LeadFilter from '../../components/LeadFilter';
import { Lead, FilterOptions } from '../../types';
import { 
  getAllLeads, 
  filterLeads, 
  getUniqueZones,
  getUniqueStatuses,
  getUniquePropertyTypes,
  getUniqueInterestReasons,
  getUniquePropertyInterests,
  updateLead
} from '../../services/leadService';
import { programarSeguimiento } from '../../services/mensajeService';
import { exportLeadsToCSV } from '../../utils/exportUtils';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';

export default function LeadsTablePage() {
  // Todos los hooks deben estar al inicio, antes de cualquier return condicional
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filteredLeads, setFilteredLeads] = useState<Lead[]>([]);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({});
  const [isFilterVisible, setIsFilterVisible] = useState(false); // Por defecto cerrado
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [zonas, setZonas] = useState<string[]>([]);
  const [estados, setEstados] = useState<string[]>([]);
  const [tiposPropiedad, setTiposPropiedad] = useState<string[]>([]);
  const [motivosInteres, setMotivosInteres] = useState<string[]>([]);
  const [propiedadesInteres, setPropiedadesInteres] = useState<string[]>([]);
  const [showAllCampaigns, setShowAllCampaigns] = useState(false);
  
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

  // Estado para columnas visibles (normalizadas)
  const [visibleColumns, setVisibleColumns] = useState<string[]>(['frío', 'tibio', 'caliente', 'llamada', 'visita']);
  const [isColumnSelectorVisible, setIsColumnSelectorVisible] = useState(false);
  const [customColumns, setCustomColumns] = useState<string[]>([]);
  const [isAddColumnModalVisible, setIsAddColumnModalVisible] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  
  // Estado para selección múltiple
  const [selectedLeads, setSelectedLeads] = useState<Lead[]>([]);
  const [isAddingToSeguimientos, setIsAddingToSeguimientos] = useState(false);
  
  // Normalizar todas las columnas para evitar "Fríos"
  const allColumns = ['frío', 'tibio', 'caliente', 'llamada', 'visita', ...customColumns]
    .map(normalizeColumnName)
    .filter((col, index, self) => self.indexOf(col) === index)
    .filter(col => col !== 'fríos' && col !== 'frios');
  
  // Normalizar visibleColumns al cargar para eliminar "Fríos" si existe
  useEffect(() => {
    const normalized = visibleColumns
      .map(normalizeColumnName)
      .filter((col, index, self) => self.indexOf(col) === index)
      .filter(col => col !== 'fríos' && col !== 'frios');
    
    // Si hay diferencias, actualizar el estado (solo una vez al montar)
    if (JSON.stringify(normalized.sort()) !== JSON.stringify(visibleColumns.sort())) {
      setVisibleColumns(normalized);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      
      // Simulamos una carga asíncrona para mostrar el efecto de carga
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const allLeads = await getAllLeads();
      
      // NORMALIZAR ESTADOS DE LEADS ANTES DE GUARDARLOS - convertir "Fríos" a "frío"
      const normalizedLeads = allLeads.map(lead => {
        const estado = lead.estado as string;
        if (estado) {
          const estadoLower = estado.toLowerCase().trim();
          if (estadoLower === 'fríos' || estadoLower === 'frios') {
            return { ...lead, estado: 'frío' as any };
          }
          if (estadoLower === 'tibios') {
            return { ...lead, estado: 'tibio' as any };
          }
          if (estadoLower === 'calientes') {
            return { ...lead, estado: 'caliente' as any };
          }
          if (estadoLower === 'llamadas') {
            return { ...lead, estado: 'llamada' as any };
          }
          if (estadoLower === 'visitas') {
            return { ...lead, estado: 'visita' as any };
          }
        }
        return lead;
      });
      
      setLeads(normalizedLeads);
      setFilteredLeads(normalizedLeads);
      
      // Cargar opciones para los filtros (usar los leads recién cargados)
      setZonas(getUniqueZones());
      setEstados(getUniqueStatuses());
      setTiposPropiedad(getUniquePropertyTypes());
      setMotivosInteres(getUniqueInterestReasons());
      
      // Obtener productos de interés directamente de los leads cargados
      const productosSet = new Set<string>();
      allLeads.forEach(lead => {
        const productoInteres = (lead as any).propiedad_interes;
        if (productoInteres && typeof productoInteres === 'string' && productoInteres.trim() !== '') {
          productosSet.add(productoInteres.trim());
        }
      });
      const productosArray = Array.from(productosSet).sort();
      setPropiedadesInteres(productosArray);
      
      setIsLoading(false);
    };
    
    loadData();
  }, []);

  // Nota: La calificación automática de leads (frío/tibio/caliente) se maneja desde n8n,
  // no desde el frontend. El workflow cuenta los mensajes del historial de Chatwoot
  // y actualiza el estado directamente en la base de datos.
  
  // Aplicar filtros y búsqueda cuando cambien las opciones
  useEffect(() => {
    // Validar que filterOptions y searchTerm sean válidos
    if (!filterOptions || typeof searchTerm !== 'string') {
      return;
    }
    
    try {
      let filtered = filterLeads(filterOptions);
      
      // Validar que filtered sea un array
      if (!Array.isArray(filtered)) {
        console.error('filterLeads did not return an array:', filtered);
        return;
      }
      
      // Aplicar búsqueda por texto si hay término de búsqueda
      if (searchTerm && searchTerm.trim()) {
        const searchLower = searchTerm.toLowerCase().trim();
        const searchTermTrimmed = searchTerm.trim();
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
      
      // NORMALIZAR ESTADOS DESPUÉS DE FILTRAR
      const normalizedFiltered = filtered.map(lead => {
        const estado = lead.estado as string;
        if (estado) {
          const estadoLower = estado.toLowerCase().trim();
          if (estadoLower === 'fríos' || estadoLower === 'frios') {
            return { ...lead, estado: 'frío' as any };
          }
          if (estadoLower === 'tibios') {
            return { ...lead, estado: 'tibio' as any };
          }
          if (estadoLower === 'calientes') {
            return { ...lead, estado: 'caliente' as any };
          }
          if (estadoLower === 'llamadas') {
            return { ...lead, estado: 'llamada' as any };
          }
          if (estadoLower === 'visitas') {
            return { ...lead, estado: 'visita' as any };
          }
        }
        return lead;
      });
      
      setFilteredLeads(normalizedFiltered);
    } catch (error) {
      console.error('Error in filter effect:', error);
      // En caso de error, mantener el estado anterior (no hacer nada)
    }
  }, [filterOptions, searchTerm]);
  
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

  const toggleColumnSelector = () => {
    setIsColumnSelectorVisible(!isColumnSelectorVisible);
  };

  const handleColumnToggle = (column: string) => {
    const normalizedColumn = normalizeColumnName(column);
    setVisibleColumns(prev => {
      const normalized = prev.map(normalizeColumnName);
      return normalized.includes(normalizedColumn)
        ? normalized.filter(col => col !== normalizedColumn)
        : [...normalized, normalizedColumn];
    });
  };

  const handleSelectAllColumns = () => {
    const normalized = allColumns
      .map(normalizeColumnName)
      .filter((col, index, self) => self.indexOf(col) === index)
      .filter(col => col !== 'fríos' && col !== 'frios');
    setVisibleColumns(normalized);
  };

  const handleDeselectAllColumns = () => {
    setVisibleColumns([]);
  };

  const handleAddColumn = () => {
    if (newColumnName.trim() && !allColumns.includes(newColumnName.trim().toLowerCase())) {
      const newColumn = normalizeColumnName(newColumnName.trim());
      // No permitir agregar columnas que sean variaciones de las existentes
      if (newColumn === 'frío' || newColumn === 'tibio' || newColumn === 'caliente' || newColumn === 'llamada' || newColumn === 'visita') {
        alert('Esta columna ya existe con otro nombre');
        return;
      }
      setCustomColumns(prev => [...prev, newColumn]);
      setVisibleColumns(prev => [...prev, newColumn]);
      setNewColumnName('');
      setIsAddColumnModalVisible(false);
    }
  };

  const handleDeleteCustomColumn = (columnName: string) => {
    setCustomColumns(prev => prev.filter(col => col !== columnName));
    setVisibleColumns(prev => prev.filter(col => col !== columnName));
  };

  const handleRenameCustomColumn = (oldName: string, newName: string) => {
    if (newName.trim() && !allColumns.includes(newName.trim().toLowerCase())) {
      setCustomColumns(prev => prev.map(col => col === oldName ? newName.trim().toLowerCase() : col));
      setVisibleColumns(prev => prev.map(col => col === oldName ? newName.trim().toLowerCase() : col));
    }
  };

  const handleSelectionChange = (leads: Lead[]) => {
    setSelectedLeads(leads);
  };

  const handleAddToSeguimientos = async () => {
    if (selectedLeads.length === 0) {
      alert('❌ Por favor selecciona al menos un lead');
      return;
    }

    if (!confirm(`¿Agregar ${selectedLeads.length} lead(s) a la cola de seguimientos?`)) {
      return;
    }

    setIsAddingToSeguimientos(true);
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const lead of selectedLeads) {
        try {
          // Obtener número de teléfono del lead (PRIORIZAR phone > whatsapp_id > telefono)
          const remoteJid = (lead as any).phone || (lead as any).whatsapp_id || lead.telefono || '';
          
          if (!remoteJid) {
            console.warn(`Lead ${lead.id} no tiene número de teléfono`);
            errorCount++;
            continue;
          }

          // Preparar datos del seguimiento
          const seguimientoData: any = {
            remote_jid: remoteJid,
            tipo_lead: lead.estado || null,
            seguimientos_count: (lead as any).seguimientos_count || 0
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
            // Solo incrementar el contador si se creó un nuevo seguimiento (no si se actualizó uno existente)
            if (!result.actualizado) {
              const newCount = ((lead as any).seguimientos_count || 0) + 1;
              await updateLead(lead.id, { seguimientos_count: newCount });
            }
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
        alert(`✅ ${successCount} lead(s) agregado(s) exitosamente a la cola de seguimientos`);
      } else {
        alert(`⚠️ ${successCount} lead(s) agregado(s), ${errorCount} con error(es)`);
      }

      // Limpiar selección
      setSelectedLeads([]);
      
      // Recargar leads para actualizar los contadores
      const allLeads = await getAllLeads();
      const normalizedLeads = allLeads.map(lead => {
        const estado = lead.estado as string;
        if (estado) {
          const estadoLower = estado.toLowerCase().trim();
          if (estadoLower === 'fríos' || estadoLower === 'frios') {
            return { ...lead, estado: 'frío' as any };
          }
          if (estadoLower === 'tibios') {
            return { ...lead, estado: 'tibio' as any };
          }
          if (estadoLower === 'calientes') {
            return { ...lead, estado: 'caliente' as any };
          }
          if (estadoLower === 'llamadas') {
            return { ...lead, estado: 'llamada' as any };
          }
          if (estadoLower === 'visitas') {
            return { ...lead, estado: 'visita' as any };
          }
        }
        return lead;
      });
      setLeads(normalizedLeads);
    } catch (error) {
      console.error('Error agregando leads a seguimientos:', error);
      alert('❌ Error al agregar leads a la cola de seguimientos');
    } finally {
      setIsAddingToSeguimientos(false);
    }
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mb-8">
          {/* Breadcrumbs skeleton */}
          <div className="bg-white shadow-sm border-b border-gray-200 mb-4">
            <div className="px-4 py-2">
              <Skeleton className="h-4 w-64" />
            </div>
            <div className="px-4 py-3 flex justify-between items-center border-t border-gray-100">
              <Skeleton className="h-6 w-32" />
              <div className="flex space-x-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
          </div>

          {/* Filter skeleton */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 p-4">
            <Skeleton className="h-4 w-24 mb-4" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>

          {/* Table skeleton */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <th key={i} className="px-6 py-3 text-left">
                        <Skeleton className="h-4 w-20" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((row) => (
                    <tr key={row}>
                      {[1, 2, 3, 4, 5, 6, 7].map((cell) => (
                        <td key={cell} className="px-6 py-4">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8">
        {/* Nueva topbar con breadcrumbs */}
        <div className="bg-white shadow-sm border-b border-gray-200 mb-4">
          {/* Breadcrumbs */}
          <div className="px-4 py-2">
            <nav className="flex" aria-label="Breadcrumb">
              <ol className="inline-flex items-center space-x-1 md:space-x-3">
                <li className="inline-flex items-center">
                  <Link href="/" className="inline-flex items-center text-sm font-medium text-gray-700 hover:text-indigo-600">
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
                    <Link href="/leads" className="ml-1 text-sm font-medium text-gray-700 hover:text-indigo-600 md:ml-2">Leads</Link>
                  </div>
                </li>
                <li aria-current="page">
                  <div className="flex items-center">
                    <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd"></path>
                    </svg>
                    <span className="ml-1 text-sm font-medium text-indigo-600 md:ml-2">Tabla</span>
                  </div>
                </li>
              </ol>
            </nav>
          </div>

          {/* Título y acciones */}
          <div className="px-4 py-3 flex justify-between items-center border-t border-gray-100">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-slate-800">Tabla de Leads</h1>
              {searchTerm && (
                <span className="text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded-full">
                  {filteredLeads.length} resultado{filteredLeads.length !== 1 ? 's' : ''}
                </span>
              )}
              
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
                  className="block w-64 pl-10 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
            <div className="flex space-x-3">
              {selectedLeads.length > 0 && (
                <button
                  onClick={handleAddToSeguimientos}
                  disabled={isAddingToSeguimientos}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm font-semibold flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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
                      Agregar {selectedLeads.length} a seguimientos
                    </>
                  )}
                </button>
              )}
              {selectedLeads.length > 0 && (
                <button
                  onClick={() => setSelectedLeads([])}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-md text-sm font-medium flex items-center justify-center"
                  title="Deseleccionar todos"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Limpiar
                </button>
              )}
              <button
                onClick={() => setIsAddColumnModalVisible(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Agregar Columna
              </button>
              <button
                onClick={toggleColumnSelector}
                className="bg-white hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md text-sm font-medium flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                {isColumnSelectorVisible ? 'Ocultar columnas' : 'Mostrar columnas'}
              </button>
              <button
                onClick={toggleFilterVisibility}
                className="bg-white hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md text-sm font-medium flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                {isFilterVisible ? 'Ocultar filtros' : 'Mostrar filtros'}
              </button>
              <button
                onClick={handleExportCSV}
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center justify-center"
                disabled={filteredLeads.length === 0}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Exportar a CSV
              </button>
            </div>
          </div>

          {/* Barra de productos/servicios */}
          {propiedadesInteres.length > 0 && (
            <div className="px-4 py-3 border-t border-gray-100 bg-white/50">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <span className="text-xs font-medium text-gray-600 mr-1 whitespace-nowrap">Productos:</span>
                <button
                  onClick={() => handleFilterChange({ ...filterOptions, propiedadInteres: undefined })}
                  className={`px-3 py-1 text-xs rounded-full border transition-colors whitespace-nowrap ${
                    !filterOptions.propiedadInteres
                      ? 'bg-indigo-600 text-white border-indigo-600'
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
                        ? 'bg-indigo-600 text-white border-indigo-600'
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
                    onClick={handleSelectAllColumns}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={handleDeselectAllColumns}
                    className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                  >
                    Deseleccionar todas
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                {allColumns.map((column) => (
                  <div key={column} className="flex items-center justify-between">
                    <label className="flex items-center space-x-2 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column)}
                        onChange={() => handleColumnToggle(column)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700 capitalize">{column}</span>
                    </label>
                    {customColumns.includes(column) && (
                      <div className="flex space-x-1">
                        <button
                          onClick={() => {
                            const newName = prompt('Nuevo nombre:', column);
                            if (newName) handleRenameCustomColumn(column, newName);
                          }}
                          className="text-xs text-indigo-600 hover:text-indigo-800"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDeleteCustomColumn(column)}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
        {/* Panel principal */}
        <div className="bg-white rounded-lg shadow-md mb-6 overflow-hidden border border-gray-100">
          <LeadTable 
            leads={filteredLeads.map(lead => {
              // NORMALIZAR ESTADOS DE LEADS ANTES DE PASARLOS A LeadTable
              const estado = lead.estado as string;
              if (estado) {
                const estadoLower = estado.toLowerCase().trim();
                if (estadoLower === 'fríos' || estadoLower === 'frios') {
                  return { ...lead, estado: 'frío' as any };
                }
                if (estadoLower === 'tibios') {
                  return { ...lead, estado: 'tibio' as any };
                }
                if (estadoLower === 'calientes') {
                  return { ...lead, estado: 'caliente' as any };
                }
                if (estadoLower === 'llamadas') {
                  return { ...lead, estado: 'llamada' as any };
                }
                if (estadoLower === 'visitas') {
                  return { ...lead, estado: 'visita' as any };
                }
              }
              return lead;
            })} 
            visibleColumns={visibleColumns
              .map(normalizeColumnName)
              .filter((col, index, self) => self.indexOf(col) === index)
              .filter(col => {
                const normalized = normalizeColumnName(col);
                return normalized !== 'fríos' && normalized !== 'frios' && col !== 'fríos' && col !== 'frios';
              })
            }
            onSelectionChange={handleSelectionChange}
            selectedLeadIds={new Set(selectedLeads.map(l => l.id))}
          />
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
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleAddColumn()}
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setIsAddColumnModalVisible(false);
                    setNewColumnName('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddColumn}
                  disabled={!newColumnName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
} 