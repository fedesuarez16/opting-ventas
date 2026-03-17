import React, { useState, useEffect, useMemo } from 'react';
import { Lead, Property, LeadStatus } from '../types';
import { findMatchingPropertiesForLead } from '../services/matchingService';
import LeadDetailSidebar from './LeadDetailSidebar';

interface LeadCardsProps {
  leads: Lead[];
  onLeadStatusChange?: (leadId: string, newStatus: LeadStatus) => void;
  onEditLead?: (lead: Lead) => void;
  visibleColumns?: string[];
  columnColors?: Record<string, string>;
  onSelectionChange?: (selectedLeads: Lead[]) => void;
  selectedLeadIds?: Set<string>;
  isSelectionMode?: boolean;
  onSelectionModeChange?: (enabled: boolean) => void;
}

const LeadCards: React.FC<LeadCardsProps> = ({ leads, onLeadStatusChange, onEditLead, visibleColumns, columnColors = {}, onSelectionChange, selectedLeadIds: externalSelectedIds, isSelectionMode: externalIsSelectionMode, onSelectionModeChange }) => {
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [matchingProperties, setMatchingProperties] = useState<Map<string, Property[]>>(new Map());
  const [isDraggingOver, setIsDraggingOver] = useState<Record<string, boolean>>({});
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  const [internalIsSelectionMode, setInternalIsSelectionMode] = useState(false);
  
  // Usar selectedLeadIds si viene como prop, sino usar el estado interno
  const isControlled = !!externalSelectedIds;
  const selectedIds = externalSelectedIds || internalSelectedIds;
  
  // Usar isSelectionMode si viene como prop, sino usar el estado interno
  const isSelectionMode = externalIsSelectionMode !== undefined ? externalIsSelectionMode : internalIsSelectionMode;
  
  // Función para normalizar estados (convertir "Fríos" a "frío", etc.)
  const normalizeEstado = (estado: string | undefined): string => {
    if (!estado) return '';
    const estadoLower = estado.toLowerCase().trim();
    // Normalizar variaciones comunes
    if (estadoLower === 'fríos' || estadoLower === 'frios') return 'frío';
    if (estadoLower === 'tibios') return 'tibio';
    if (estadoLower === 'calientes') return 'caliente';
    if (estadoLower === 'llamadas') return 'llamada';
    if (estadoLower === 'visitas') return 'visita';
    return estadoLower;
  };

  const defaultStatusOrder = ['frío', 'tibio', 'caliente', 'llamada', 'visita'];
  // Normalizar las columnas visibles para eliminar "Fríos" si existe
  const normalizedVisibleColumns = visibleColumns && visibleColumns.length > 0 
    ? visibleColumns.map(normalizeEstado).filter((col, index, self) => self.indexOf(col) === index)
    : defaultStatusOrder;
  const statusOrder = normalizedVisibleColumns;
  
  // Memo para agrupar los leads por estado y ordenarlos por ultima_interaccion
  const groupedLeads = useMemo(() => {
    try {
      const result: Record<string, Lead[]> = {};
      
      // Validar que leads sea un array
      if (!Array.isArray(leads)) {
        console.error('Leads is not an array:', leads);
        return {};
      }
      
      // Inicializar todas las columnas visibles
      if (Array.isArray(statusOrder)) {
        statusOrder.forEach(status => {
          result[status] = [];
        });
      }
      
      leads.forEach(lead => {
        try {
          const leadStatus = lead?.estado;
          if (!leadStatus) return;
          
          // Normalizar el estado del lead antes de agrupar
          const normalizedStatus = normalizeEstado(leadStatus);
          
          // Si el estado normalizado coincide con alguna de nuestras columnas visibles, lo añadimos ahí
          if (statusOrder.includes(normalizedStatus)) {
            if (!result[normalizedStatus]) {
              result[normalizedStatus] = [];
            }
            result[normalizedStatus].push(lead);
          } else {
            // Si el estado no existe en nuestras columnas visibles, crear una nueva columna para él
            // Esto permite que los estados personalizados se muestren correctamente
            // Pero NO crear columnas para estados normalizados que ya existen
            if (normalizedStatus !== 'frío' && normalizedStatus !== 'tibio' && normalizedStatus !== 'caliente' && normalizedStatus !== 'llamada' && normalizedStatus !== 'visita') {
              if (!result[normalizedStatus]) {
                result[normalizedStatus] = [];
              }
              result[normalizedStatus].push(lead);
            }
          }
        } catch (e) {
          console.error('Error processing lead:', e, lead);
        }
      });
      
      // Ordenar cada columna por ultima_interaccion (más reciente primero)
      Object.keys(result).forEach(status => {
        try {
          result[status].sort((a: Lead, b: Lead) => {
            try {
              // Priorizar ultima_interaccion sobre fechaContacto
              const dateA = new Date(a.ultima_interaccion || a.created_at || a.fechaContacto || 0).getTime();
              const dateB = new Date(b.ultima_interaccion || b.created_at || b.fechaContacto || 0).getTime();
              return dateB - dateA; // Orden descendente (más reciente primero)
            } catch (e) {
              console.error('Error sorting leads:', e);
              return 0;
            }
          });
        } catch (e) {
          console.error('Error sorting column:', e, status);
        }
      });
      
      return result;
    } catch (e) {
      console.error('Error in groupedLeads useMemo:', e);
      return {};
    }
  }, [leads, statusOrder]);
  
  // Cargar propiedades coincidentes para todos los leads
  useEffect(() => {
    const loadMatchingProperties = async () => {
      const matchesMap = new Map<string, Property[]>();
      for (const lead of leads) {
        const matches = await findMatchingPropertiesForLead(lead.id);
        matchesMap.set(lead.id, matches);
      }
      setMatchingProperties(matchesMap);
    };
    loadMatchingProperties();
  }, [leads]);

  // Combinar columnas visibles con columnas que tienen leads (debe ir antes de cualquier return para cumplir reglas de hooks)
  const allColumnsToShow = useMemo(() => {
    const visibleSet = new Set(statusOrder);
    const columnsWithLeads = Object.keys(groupedLeads)
      .filter(status => groupedLeads[status].length > 0)
      .map(normalizeEstado)
      .filter((status, index, self) => self.indexOf(status) === index);
    const filteredColumns = columnsWithLeads.filter(status =>
      status !== 'fríos' && status !== 'frios' && status !== 'tibios' && status !== 'calientes' && status !== 'llamadas' && status !== 'visitas'
    );
    const customColumns = filteredColumns.filter(status => !visibleSet.has(status));
    return [...statusOrder, ...customColumns];
  }, [statusOrder, groupedLeads]);

  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-42 px bg-white ">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-slate-700 text-lg font-medium">No se encontraron leads</p>
        <p className="text-slate-500 text-sm mt-1">Prueba modificando los filtros de búsqueda</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'frío':
        return 'border-gray-500';
      case 'tibio':
        return 'border-gray-500';
      case 'caliente':
        return 'border-gray-500';
      case 'llamada':
        return 'border-gray-500';
      case 'visita':
        return 'border-gray-500';
      default:
        return 'border-gray-300';
    }
  };

  const getStatusBadgeColor = (status: string) => {
    // Si hay un color personalizado para esta columna, usarlo
    if (columnColors[status]) {
      const color = columnColors[status];
      // Convertir hex a RGB para calcular el color de fondo más claro
      const hex = color.replace('#', '');
      const r = parseInt(hex.substr(0, 2), 16);
      const g = parseInt(hex.substr(2, 2), 16);
      const b = parseInt(hex.substr(4, 2), 16);
      // Crear un color de fondo más claro (20% de opacidad)
      const bgColor = `rgba(${r}, ${g}, ${b}, 0.15)`;
      // Determinar si el texto debe ser oscuro o claro basado en la luminosidad
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const textColor = luminance > 0.5 ? color : color;
      
      return {
        backgroundColor: bgColor,
        color: textColor,
        borderColor: color
      };
    }
    
    // Fallback a colores por defecto
    switch (status) {
      case 'frío':
        return {
          backgroundColor: 'rgb(219, 234, 254)',
          color: '#1e40af',
          borderColor: '#3b82f6'
        };
      case 'tibio':
        return {
          backgroundColor: 'rgb(254, 249, 195)',
          color: '#854d0e',
          borderColor: '#eab308'
        };
      case 'caliente':
        return {
          backgroundColor: 'rgb(254, 226, 226)',
          color: '#991b1b',
          borderColor: '#ef4444'
        };
      case 'llamada':
        return {
          backgroundColor: 'rgb(237, 233, 254)',
          color: '#5b21b6',
          borderColor: '#8b5cf6'
        };
      case 'visita':
        return {
          backgroundColor: 'rgb(209, 250, 229)',
          color: '#065f46',
          borderColor: '#10b981'
        };
      default:
        return {
          backgroundColor: 'rgb(243, 244, 246)',
          color: '#1f2937',
          borderColor: '#9ca3af'
        };
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(date);
  };
  
  const handleLeadClick = (lead: Lead, e: React.MouseEvent) => {
    // No abrir el modal si estamos arrastrando
    if (e.currentTarget.getAttribute('dragging') === 'true') {
      return;
    }
    
    setSelectedLead(lead);
    setShowSidebar(true);
  };

  const handleToggleSelection = (lead: Lead) => {
    const newSelectedIds = new Set(selectedIds);
    
    if (newSelectedIds.has(lead.id)) {
      newSelectedIds.delete(lead.id);
    } else {
      newSelectedIds.add(lead.id);
    }
    
    // Si es controlado externamente, solo notificar. Si no, actualizar estado interno
    if (!isControlled) {
      setInternalSelectedIds(newSelectedIds);
    }
    
    // Notificar al padre sobre la selección
    if (onSelectionChange) {
      const selectedLeads = leads.filter(l => newSelectedIds.has(l.id));
      onSelectionChange(selectedLeads);
    }
  };

  const handleSelectAll = () => {
    const newSelectedIds = new Set(selectedIds);
    leads.forEach(lead => {
      newSelectedIds.add(lead.id);
    });
    
    if (!isControlled) {
      setInternalSelectedIds(newSelectedIds);
    }
    
    if (onSelectionChange) {
      onSelectionChange(leads);
    }
  };

  const handleDeselectAll = () => {
    const newSelectedIds = new Set<string>();
    
    if (!isControlled) {
      setInternalSelectedIds(newSelectedIds);
    }
    
    if (onSelectionChange) {
      onSelectionChange([]);
    }
  };

  const handleSelectByStatus = (status: string) => {
    // Obtener todos los leads de este estado
    const leadsInStatus = groupedLeads[status] || [];
    const newSelectedIds = new Set(selectedIds);
    
    // Agregar todos los leads de este estado a la selección
    leadsInStatus.forEach(lead => {
      newSelectedIds.add(lead.id);
    });
    
    // Si es controlado externamente, solo notificar. Si no, actualizar estado interno
    if (!isControlled) {
      setInternalSelectedIds(newSelectedIds);
    }
    
    // Notificar al padre sobre la selección
    if (onSelectionChange) {
      const selectedLeads = leads.filter(l => newSelectedIds.has(l.id));
      onSelectionChange(selectedLeads);
    }
  };

  const handleDeselectByStatus = (status: string) => {
    // Obtener todos los leads de este estado
    const leadsInStatus = groupedLeads[status] || [];
    const newSelectedIds = new Set(selectedIds);
    
    // Remover todos los leads de este estado de la selección
    leadsInStatus.forEach(lead => {
      newSelectedIds.delete(lead.id);
    });
    
    // Si es controlado externamente, solo notificar. Si no, actualizar estado interno
    if (!isControlled) {
      setInternalSelectedIds(newSelectedIds);
    }
    
    // Notificar al padre sobre la selección
    if (onSelectionChange) {
      const selectedLeads = leads.filter(l => newSelectedIds.has(l.id));
      onSelectionChange(selectedLeads);
    }
  };

  // Verificar si todos los leads de un estado están seleccionados
  const areAllLeadsInStatusSelected = (status: string) => {
    const leadsInStatus = groupedLeads[status] || [];
    if (leadsInStatus.length === 0) return false;
    return leadsInStatus.every(lead => selectedIds.has(lead.id));
  };

  // Verificar si algunos leads de un estado están seleccionados
  const areSomeLeadsInStatusSelected = (status: string) => {
    const leadsInStatus = groupedLeads[status] || [];
    return leadsInStatus.some(lead => selectedIds.has(lead.id));
  };
  
  // Calcular si todos los leads visibles están seleccionados
  const allVisibleLeadsSelected = leads.length > 0 && leads.every(lead => selectedIds.has(lead.id));
  const someLeadsSelected = leads.some(lead => selectedIds.has(lead.id));

  const closeSidebar = () => {
    setShowSidebar(false);
    setSelectedLead(null);
  };
  
  // Handlers para HTML5 Drag and Drop
  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    e.currentTarget.setAttribute('dragging', 'true');
    e.dataTransfer.setData('leadId', lead.id);
    e.dataTransfer.setData('sourceStatus', lead.estado);
    e.dataTransfer.effectAllowed = 'move';
    
    // Añadir una imagen de arrastre personalizada (opcional)
    const dragImage = document.createElement('div');
    dragImage.textContent = lead.nombreCompleto;
    dragImage.style.backgroundColor = 'white';
    dragImage.style.padding = '8px';
    dragImage.style.borderRadius = '4px';
    dragImage.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    dragImage.style.position = 'absolute';
    dragImage.style.top = '-1000px';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, 0, 0);
    
    // Eliminar el elemento después de un breve retraso
    setTimeout(() => {
      document.body.removeChild(dragImage);
    }, 0);
  };
  
  const handleDragEnd = (e: React.DragEvent) => {
    e.currentTarget.setAttribute('dragging', 'false');
    // Restablecer todos los estados de arrastrar sobre
    const resetState: Record<string, boolean> = {};
    statusOrder.forEach(status => {
      resetState[status] = false;
    });
    setIsDraggingOver(resetState);
  };
  
  const handleDragOver = (e: React.DragEvent, status: string) => {
    e.preventDefault(); // Necesario para permitir soltar
    e.dataTransfer.dropEffect = 'move';
    
    // Actualizar el estado de dragging over
    if (!isDraggingOver[status]) {
      setIsDraggingOver(prev => ({
        ...prev,
        [status]: true
      }));
    }
  };
  
  const handleDragLeave = (e: React.DragEvent, status: string) => {
    setIsDraggingOver(prev => ({
      ...prev,
      [status]: false
    }));
  };
  
  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    
    const leadId = e.dataTransfer.getData('leadId');
    const sourceStatus = e.dataTransfer.getData('sourceStatus');
    
    // Restablecer el estado de dragging over
    setIsDraggingOver(prev => ({
      ...prev,
      [targetStatus]: false
    }));
    
    // No hacer nada si el estado de origen y destino son iguales
    if (sourceStatus === targetStatus) {
      return;
    }
    
    // Llamar a la función de cambio de estado si está disponible
    if (onLeadStatusChange) {
      onLeadStatusChange(leadId, targetStatus as LeadStatus);
    }
  };

  const getStatusTitle = (status: string) => {
    const titleMap: Record<string, string> = {
      'caliente': 'Calientes',
      'tibio': 'Tibios',
      'frío': 'Fríos',
      'llamada': 'Llamadas',
      'visita': 'Visitas'
    };
    return titleMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getStatusBackgroundColor = (status: string, isDragging: boolean) => {
    if (!isDragging) return 'bg-transparent';
    
    // Color más visible cuando se arrastra sobre la columna
    return 'bg-blackborder-2 border-dashed border-black';
  };

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case 'caliente':
        return 'border-gray-400 text-red-700';
      case 'tibio':
        return 'border-gray-400 text-yellow-700';
      case 'frío':
        return 'border-gray-400 text-blue-700';
        case 'llamada':
        return 'border-gray-400 text-green-700';
      case 'visita':
        return 'border-gray-400 text-gray-700';
      default:
        return 'border-gray-400 text-gray-700';
    }
  };

  const handleToggleSelectionMode = () => {
    const newMode = !isSelectionMode;
    if (externalIsSelectionMode === undefined) {
      setInternalIsSelectionMode(newMode);
    }
    if (onSelectionModeChange) {
      onSelectionModeChange(newMode);
    }
    // Si se desactiva el modo de selección, limpiar selección
    if (!newMode) {
      handleDeselectAll();
    }
  };

  return (
    <>
      {/* Barra de selección múltiple - SOLO VISIBLE EN MODO SELECCIÓN */}
      {isSelectionMode && (
        <div className="mb-3 px-4 py-2.5 bg-gradient-to-r from-gray-50 to-blue-50 border-2 border-gray-400 rounded-lg flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allVisibleLeadsSelected}
              onChange={() => {
                if (allVisibleLeadsSelected) {
                  handleDeselectAll();
                } else {
                  handleSelectAll();
                }
              }}
              className="h-5 w-5 rounded border-2 border-gray-500 text-black focus:ring-2 focus:ring-black cursor-pointer"
              style={{ 
                width: '20px', 
                height: '20px',
                minWidth: '20px', 
                minHeight: '20px',
                accentColor: '#4f46e5',
                cursor: 'pointer'
              }}
            />
            <span className="text-sm font-bold text-gray-900">
              {selectedIds.size > 0 ? `✓ ${selectedIds.size} lead(s) seleccionado(s)` : '☐ Seleccionar todos los leads'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={handleDeselectAll}
                className="text-xs text-black hover:text-black font-bold px-3 py-1.5 rounded-md hover:bg-black transition-colors border border-black"
              >
                ✕ Deseleccionar todos
              </button>
            )}
            <button
              onClick={handleToggleSelectionMode}
              className="text-xs text-gray-700 hover:text-gray-900 font-bold px-3 py-1.5 rounded-md hover:bg-gray-200 transition-colors border border-gray-300"
            >
              ✕ Cancelar selección
            </button>
          </div>
        </div>
      )}
      
      <div className="w-full  overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max pr-2">
          {allColumnsToShow.map((status) => (
            <div 
              key={status} 
              className="min-w-[240px] bg-slate-100 border-gray-400 rounded-xl flex flex-col"
              onDragOver={(e) => handleDragOver(e, status)}
              onDragLeave={(e) => handleDragLeave(e, status)}
              onDrop={(e) => handleDrop(e, status)}
            >
              {/* Header de la columna */}
              <div className={`m-2 bg-white p-1.5 rounded-xl flex items-center justify-between`}>
                <h3 className="text-xs font-semibold text-slate-700">
                  {getStatusTitle(status)}
                </h3>
                <div className="flex items-center gap-2">
                  {isSelectionMode && groupedLeads[status].length > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (areAllLeadsInStatusSelected(status)) {
                          handleDeselectByStatus(status);
                        } else {
                          handleSelectByStatus(status);
                        }
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        areAllLeadsInStatusSelected(status)
                          ? 'bg-black text-white border-black'
                          : areSomeLeadsInStatusSelected(status)
                          ? 'bg-gray-200 text-gray-700 border-gray-400'
                          : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'
                      }`}
                      title={areAllLeadsInStatusSelected(status) ? 'Deseleccionar todos' : 'Seleccionar todos'}
                    >
                      {areAllLeadsInStatusSelected(status) ? '✓ Todos' : '☐ Todos'}
                    </button>
                  )}
                  <span className={` items-center px-1.5 py-0.5 rounded-xl text-[10px] border ${getStatusBorderColor(status).split(' ')[0]} text-slate-500`}>
                    {groupedLeads[status].length}
                  </span>
                </div>
              </div>
              
              {/* Área de drop que cubre toda la altura */}
              <div
                className={`flex-1 min-h-[400px] p-1 rounded-xl transition-colors duration-200 ${
                  getStatusBackgroundColor(status, isDraggingOver[status])
                }`}
              >
                <div className="space-y-1.5 h-full">
                  {groupedLeads[status].length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                      <div className="text-center py-10 border border-dashed border-slate-200 rounded-lg bg-slate-50 w-full">
                        <p className="text-slate-500 text-sm">No hay leads en esta categoría</p>
                        <p className="text-slate-400 text-xs mt-1">Arrastra aquí para cambiar estado</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      {groupedLeads[status].map((lead: Lead) => {
                        const matchCount = matchingProperties.get(lead.id)?.length || 0;
                        const isSelected = selectedIds.has(lead.id);
                        
                        return (
                          <div
                            key={lead.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, lead)}
                            onDragEnd={handleDragEnd}
                            className={`relative rounded-xl border-l-4 shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer bg-white/90 backdrop-blur ${
                              isSelected 
                                ? 'border-black ring-2 ring-black' 
                                : 'border-slate-200'
                            } ${getStatusColor(lead.estado)}`}
                            onClick={(e) => {
                              // Si se clickea en el checkbox, no abrir el sidebar
                              const target = e.target as HTMLElement;
                              if (target.tagName === 'INPUT' && target.getAttribute('type') === 'checkbox') {
                                return;
                              }
                              handleLeadClick(lead, e);
                            }}
                          >
                            {/* Contadores absolutos - esquina superior derecha */}
                            {matchCount > 0 && (
                              <div className="absolute top-1 right-9 bg-emerald-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center shadow-md z-20 pointer-events-none">
                                {matchCount}
                              </div>
                            )}
                            {((lead.seguimientos_count !== undefined && lead.seguimientos_count !== null && lead.seguimientos_count > 0) || true) && (
                              <div 
                                className="absolute top-1 right-1 z-50"
                                style={{
                                  position: 'absolute',
                                  top: '4px',
                                  right: '4px',
                                  color: '#6b7280',
                                  fontSize: '10px',
                                  fontWeight: '700',
                                  borderRadius: '4px',
                                  minWidth: '18px',
                                  height: '18px',
                                  paddingLeft: '4px',
                                  paddingRight: '4px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: '#f3f4f6',
                                  border: '1px solid #e5e7eb',
                                  zIndex: 50,
                                  pointerEvents: 'none'
                                }}
                              >
                                {lead.seguimientos_count || 1}
                              </div>
                            )}
                            
                            {/* CHECKBOX - SOLO VISIBLE EN MODO SELECCIÓN */}
                            {isSelectionMode && (
                              <div 
                                className="absolute top-2 left-2 z-50"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleToggleSelection(lead);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-5 w-5 rounded border-2 border-gray-500 cursor-pointer"
                                  style={{ 
                                    width: '20px', 
                                    height: '20px',
                                    minWidth: '20px', 
                                    minHeight: '20px',
                                    cursor: 'pointer',
                                    accentColor: '#4f46e5'
                                  } as React.CSSProperties}
                                />
                              </div>
                            )}
                            
                            <div className={`p-2 max-w-[150px] space-y-1.5 ${isSelectionMode ? 'pl-8' : ''}`}>
                              <div className="pr-6">
                                <h4 className="text-xs font-semibold text-slate-900 leading-tight truncate">
                                  {(() => {
                                    // PRIORIDAD: nombre (campo directo de la BD) > nombreCompleto > whatsapp_id
                                    // El campo 'nombre' viene directamente de la tabla leads en la BD
                                    const nombreBD = (lead as any).nombre;
                                    const nombreCompleto = lead.nombreCompleto;
                                    
                                    // Verificar nombre de la BD primero (puede ser string, null, undefined)
                                    let nombreFinal = '';
                                    if (nombreBD != null && nombreBD !== '') {
                                      const nombreStr = String(nombreBD).trim();
                                      if (nombreStr.length > 0) {
                                        nombreFinal = nombreStr;
                                      }
                                    }
                                    
                                    // Si no hay nombre de BD, verificar nombreCompleto
                                    if (!nombreFinal && nombreCompleto) {
                                      const nombreCompletoStr = String(nombreCompleto).trim();
                                      if (nombreCompletoStr.length > 0) {
                                        nombreFinal = nombreCompletoStr;
                                      }
                                    }
                                    
                                    // Si no hay nombre, mostrar teléfono
                                    if (!nombreFinal) {
                                      const telefono = (lead as any).whatsapp_id || lead.telefono;
                                      if (telefono) {
                                        nombreFinal = String(telefono).trim();
                                      } else {
                                        nombreFinal = 'Sin nombre';
                                      }
                                    }
                                    
                                    return nombreFinal;
                                  })()}
                                </h4>
                              </div>
                              <div className="flex items-center gap-1">
                                <span 
                                  className="inline-flex items-center px-1 py-0.5 rounded-md text-[10px] font-medium border"
                                  style={getStatusBadgeColor(lead.estado)}
                                >
                                  {lead.estado}
                                </span>
                              </div>
                              <div className="h-px bg-slate-100"></div>
                              <div className="text-[10px] text-gray-600 space-y-1">
                                <div className="flex items-center">
                                  <svg className="h-2.5 w-2.5 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 12l4.243-4.243m-9.9 9.9L3.414 12l4.243-4.243" />
                                  </svg>
                                  <span className="truncate">{(lead as any).zona || lead.zonaInteres}</span>
                                </div>
                                <div className="flex items-center">
                                  <svg className="h-2.5 w-2.5 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h18M3 10h18M7 15h10M9 20h6" />
                                  </svg>
                                  <span className="truncate">{(lead as any).tipo_propiedad || (lead as any).tipoPropiedad} · {formatCurrency(Number(lead.presupuesto ?? 0))}</span>
                                </div>
                                <div className="flex items-center">
                                  <svg className="h-2.5 w-2.5 text-gray-400 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                  </svg>
                                  <span className="truncate">{(lead as any).whatsapp_id || lead.telefono}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Área de drop adicional para llenar el espacio restante */}
                      <div className="flex-1 min-h-[100px]"></div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sidebar de detalles usando el componente LeadDetailSidebar */}
      <LeadDetailSidebar
        lead={selectedLead}
        onClose={closeSidebar}
        matchingProperties={selectedLead ? matchingProperties.get(selectedLead.id) || [] : []}
        isOpen={showSidebar}
        onEditLead={onEditLead}
        columnColors={columnColors}
      />
    </>
  );
};

export default LeadCards; 