import React, { useState, useEffect, useRef } from 'react';
import { Lead } from '../types';

interface LeadTableProps {
  leads: Lead[];
  visibleColumns?: string[];
  onSelectionChange?: (selectedLeads: Lead[]) => void;
  selectedLeadIds?: Set<string>;
}

const LeadTable: React.FC<LeadTableProps> = ({ leads, visibleColumns, onSelectionChange, selectedLeadIds: externalSelectedIds }) => {
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set());
  
  // Usar selectedLeadIds si viene como prop, sino usar el estado interno
  const isControlled = !!externalSelectedIds;
  const selectedIds = externalSelectedIds || internalSelectedIds;
  if (leads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-44 bg-white">
        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-gray-500 text-lg font-medium">No se encontraron leads</p>
        <p className="text-gray-400 text-sm mt-1">Prueba modificando los filtros de búsqueda</p>
      </div>
    );
  }

  const defaultStatuses = ['frío', 'tibio', 'caliente', 'llamada', 'visita'] as const;
  
  // Función para normalizar nombres de columnas (eliminar "Fríos", "Tibios", etc.)
  const normalizeColumnName = (col: string): string => {
    const colLower = col.toLowerCase().trim();
    if (colLower === 'fríos' || colLower === 'frios') return 'frío';
    if (colLower === 'tibios') return 'tibio';
    if (colLower === 'calientes') return 'caliente';
    if (colLower === 'llamadas') return 'llamada';
    if (colLower === 'visitas') return 'visita';
    return colLower;
  };
  
  // FORZAR normalización agresiva - NUNCA permitir "Fríos"
  const statusOrder = (visibleColumns && visibleColumns.length > 0 
    ? visibleColumns
        .map(col => {
          const normalized = normalizeColumnName(col);
          // FORZAR conversión de "fríos" a "frío" antes de filtrar
          return (normalized === 'fríos' || normalized === 'frios') ? 'frío' : normalized;
        })
        .filter(col => col !== 'activo' && col !== 'inicial' && col !== 'fríos' && col !== 'frios') // Filtrar estados temporales y variaciones
        .filter((col, index, self) => self.indexOf(col) === index) // Eliminar duplicados
    : defaultStatuses)
    .map(col => {
      // NORMALIZACIÓN FINAL: convertir cualquier variante de "fríos" a "frío"
      const normalized = normalizeColumnName(col);
      return (normalized === 'fríos' || normalized === 'frios') ? 'frío' : normalized;
    })
    .filter((col, index, self) => self.indexOf(col) === index) // Eliminar duplicados después de normalizar
    .filter(col => col !== 'fríos' && col !== 'frios'); // FILTRO FINAL AGRESIVO - eliminar cualquier rastro de "Fríos"

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

  // Agrupar por estado según el orden solicitado
  // También filtrar leads con estados 'activo' o 'inicial' que no deberían mostrarse
  // Y normalizar estados para evitar duplicados (ej: "Fríos" -> "frío")
  const filteredLeads = leads.filter(l => {
    const estado = normalizeEstado(l.estado as unknown as string);
    return estado !== 'activo' && estado !== 'inicial' && estado !== '';
  });
  
  // Normalizar estados de los leads antes de agrupar
  // FORZAR normalización estricta para evitar duplicados (ej: "Fríos" vs "frío")
  const normalizedLeads = filteredLeads.map(lead => {
    const estadoRaw = lead.estado as unknown as string;
    const estadoNormalizado = normalizeEstado(estadoRaw);
    
    // Asegurar que "Fríos" y "frios" siempre se conviertan a "frío"
    const estadoFinal = (estadoNormalizado === 'fríos' || estadoNormalizado === 'frios') 
      ? 'frío' 
      : estadoNormalizado;
    
    return {
      ...lead,
      estado: estadoFinal as any
    };
  });
  
  // Agrupar por estado normalizado, asegurando que solo exista "frío" y no "Fríos"
  const grouped = statusOrder.map(status => {
    // Normalizar el status también para comparación
    const normalizedStatus = normalizeEstado(status);
    const statusFinal = (normalizedStatus === 'fríos' || normalizedStatus === 'frios') 
      ? 'frío' 
      : normalizedStatus;
    
    return normalizedLeads.filter(l => {
      const leadEstado = normalizeEstado(l.estado as unknown as string);
      const leadEstadoFinal = (leadEstado === 'fríos' || leadEstado === 'frios') 
        ? 'frío' 
        : leadEstado;
      return leadEstadoFinal === statusFinal;
    });
  });

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

  const renderLead = (lead: Lead) => {
    // PRIORIDAD: nombre (campo directo de la BD) > nombreCompleto > whatsapp_id/telefono
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
    
    // Obtener teléfono (prioridad: phone > whatsapp_id > telefono)
    const telefonoRaw = (lead as any).phone || (lead as any).whatsapp_id || lead.telefono;
    const telefono = (telefonoRaw && String(telefonoRaw).trim().length > 0) 
      ? String(telefonoRaw).trim() 
      : '';
    
    // Mostrar nombre si existe y no está vacío, sino mostrar teléfono
    const displayName = (nombreFinal && nombreFinal.length > 0) ? nombreFinal : (telefono || 'Sin nombre');
    
    const isSelected = selectedIds.has(lead.id);
    
    return (
      <div 
        className={`rounded-lg border-2 p-2.5 shadow-md transition-all ${
          isSelected 
            ? 'border-indigo-600 bg-indigo-100 ring-2 ring-indigo-400' 
            : 'border-slate-400 bg-white hover:border-indigo-500 hover:bg-indigo-50'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* CHECKBOX - SIEMPRE VISIBLE Y GRANDE - FORZAR VISIBILIDAD */}
          <div className="flex-shrink-0" style={{ width: '24px', height: '24px' }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                handleToggleSelection(lead);
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleSelection(lead);
              }}
              className="!w-6 !h-6 !min-w-6 !min-h-6 !cursor-pointer !border-2 !border-gray-500 !rounded !block !visible !opacity-100 !relative !z-10"
              style={{ 
                width: '24px', 
                height: '24px',
                minWidth: '24px', 
                minHeight: '24px',
                cursor: 'pointer',
                flexShrink: 0,
                marginTop: '2px',
                border: '2px solid #6b7280',
                borderRadius: '4px',
                backgroundColor: isSelected ? '#4f46e5' : 'white',
                display: 'block',
                visibility: 'visible',
                opacity: 1,
                position: 'relative',
                zIndex: 10,
                appearance: 'auto',
                WebkitAppearance: 'checkbox',
                MozAppearance: 'checkbox'
              } as React.CSSProperties}
            />
          </div>
          <div 
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => handleToggleSelection(lead)}
          >
            <div className="text-xs font-medium text-gray-900 truncate leading-tight">{displayName}</div>
            {nombreFinal && nombreFinal.length > 0 && telefono && telefono !== displayName && (
              <div className="text-gray-600 text-xs truncate leading-tight">{telefono}</div>
            )}
            <div className="text-gray-500 text-xs truncate leading-tight">{(lead as any).zona || lead.zonaInteres || ''}</div>
          </div>
        </div>
    </div>
  );
  };

  // Calcular si todos los leads visibles están seleccionados
  const allVisibleLeadsSelected = normalizedLeads.length > 0 && normalizedLeads.every(lead => selectedIds.has(lead.id));
  const someLeadsSelected = normalizedLeads.some(lead => selectedIds.has(lead.id));
  
  // Ref para el checkbox de "seleccionar todos"
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);
  
  // Actualizar estado indeterminate del checkbox
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someLeadsSelected && !allVisibleLeadsSelected;
    }
  }, [someLeadsSelected, allVisibleLeadsSelected]);

  const handleSelectAll = () => {
    const newSelectedIds = new Set(selectedIds);
    normalizedLeads.forEach(lead => {
      newSelectedIds.add(lead.id);
    });
    
    if (!isControlled) {
      setInternalSelectedIds(newSelectedIds);
    }
    
    if (onSelectionChange) {
      const selectedLeads = leads.filter(l => newSelectedIds.has(l.id));
      onSelectionChange(selectedLeads);
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

  return (
    <div className="overflow-x-auto">
      {/* Barra de selección múltiple - SIEMPRE VISIBLE */}
      <div className="mb-3 px-4 py-2.5 bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-400 rounded-lg flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            ref={selectAllCheckboxRef}
            checked={allVisibleLeadsSelected}
            onChange={() => {
              if (allVisibleLeadsSelected) {
                handleDeselectAll();
              } else {
                handleSelectAll();
              }
            }}
            className="h-5 w-5 rounded border-2 border-gray-500 text-indigo-600 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
        {selectedIds.size > 0 && (
          <button
            onClick={handleDeselectAll}
            className="text-xs text-indigo-700 hover:text-indigo-900 font-bold px-3 py-1.5 rounded-md hover:bg-indigo-200 transition-colors border border-indigo-300"
          >
            ✕ Deseleccionar todos
          </button>
        )}
      </div>
      
      <div className={`min-w-max grid gap-1 ${statusOrder.length <= 3 ? 'grid-cols-3' : statusOrder.length === 4 ? 'grid-cols-4' : statusOrder.length === 5 ? 'grid-cols-5' : 'grid-cols-1'}`}>
        {statusOrder.map((col, idx) => (
          <div key={col} className="min-w-[160px] bg-white">
            <div className="mb-1 px-1 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">{col}</div>
            <div className="space-y-0.5">
              {grouped[idx].length === 0 ? (
                <div className="text-xs text-slate-400 rounded py-2 text-center">Vacío</div>
              ) : (
                grouped[idx].map(lead => (
                  <div key={lead.id}>{renderLead(lead)}</div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LeadTable; 