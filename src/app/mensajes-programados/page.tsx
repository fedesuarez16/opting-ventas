'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '../components/AppLayout';
import { getMensajesProgramados, eliminarMensajeProgramado, actualizarPlantillaMensaje, actualizarFechaProgramada, ColaSeguimiento } from '../services/mensajeService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';

// Plantillas disponibles
// 8 toques fríos (1-8) → seguimientos_count = 1-8
// 8 toques tibios (1-8 en nombre) → seguimientos_count = 9-16
const PLANTILLAS = [
  // Toques fríos (1-8)
  { value: 'toque_1_frio', label: 'Toque 1 Frio' },
  { value: 'toque_2_frio', label: 'Toque 2 Frio' },
  { value: 'toque_3_frio', label: 'Toque 3 Frio' },
  { value: 'toque_4_frio', label: 'Toque 4 Frio' },
  { value: 'toque_5_frio', label: 'Toque 5 Frio' },
  { value: 'toque_6_frio', label: 'Toque 6 Frio' },
  { value: 'toque_7_frio', label: 'Toque 7 Frio' },
  { value: 'toque_8_frio', label: 'Toque 8 Frio' },
  // Toques tibios (1-8 en nombre, pero seguimientos_count = 9-16)
  { value: 'toque_1_tibio', label: 'Toque 1 Tibio' },
  { value: 'toque_2_tibio', label: 'Toque 2 Tibio' },
  { value: 'toque_3_tibio', label: 'Toque 3 Tibio' },
  { value: 'toque_4_tibio', label: 'Toque 4 Tibio' },
  { value: 'toque_5_tibio', label: 'Toque 5 Tibio' },
  { value: 'toque_6_tibio', label: 'Toque 6 Tibio' },
  { value: 'toque_7_tibio', label: 'Toque 7 Tibio' },
  { value: 'toque_8_tibio', label: 'Toque 8 Tibio' },
];

export default function MensajesProgramadosPage() {
  const [mensajes, setMensajes] = useState<ColaSeguimiento[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  const [updatingPlantilla, setUpdatingPlantilla] = useState<number | null>(null);
  const [editingFecha, setEditingFecha] = useState<number | null>(null);
  const [tempFecha, setTempFecha] = useState<string>('');
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadMensajes();
  }, []);

  const loadMensajes = async () => {
    setIsLoading(true);
    try {
      const data = await getMensajesProgramados();
      setMensajes(data);
    } catch (error) {
      console.error('Error loading mensajes programados:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: number, tablaOrigen?: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este mensaje programado?')) {
      return;
    }

    setIsDeleting(id);
    try {
      const success = await eliminarMensajeProgramado(id, tablaOrigen);
      if (success) {
        setMensajes(mensajes.filter(m => m.id !== id));
      } else {
        alert('Error al eliminar el mensaje');
      }
    } catch (error) {
      console.error('Error deleting mensaje:', error);
      alert('Error al eliminar el mensaje');
    } finally {
      setIsDeleting(null);
    }
  };

  const handleUpdatePlantilla = async (mensajeId: number, plantilla: string | null, tablaOrigen?: string) => {
    setUpdatingPlantilla(mensajeId);
    try {
      const plantillaValue = plantilla === 'none' || plantilla === null ? null : plantilla;
      const result = await actualizarPlantillaMensaje(mensajeId, plantillaValue, tablaOrigen);
      if (result.success) {
        // Si se movió entre tablas, necesitamos recargar los mensajes
        if (result.nuevaTabla && result.nuevaTabla !== tablaOrigen && result.nuevoId) {
          console.log(`✅ Mensaje movido de ${tablaOrigen} a ${result.nuevaTabla}. Recargando mensajes...`);
          // Recargar todos los mensajes para reflejar el cambio
          await loadMensajes();
        } else {
          // Si solo se actualizó la plantilla sin mover, actualizar el estado local
          setMensajes(mensajes.map(m => 
            m.id === mensajeId 
              ? { ...m, plantilla: plantillaValue }
              : m
          ));
        }
      } else {
        alert('Error al actualizar la plantilla');
      }
    } catch (error) {
      console.error('Error updating plantilla:', error);
      alert('Error al actualizar la plantilla');
    } finally {
      setUpdatingPlantilla(null);
    }
  };

  const handleStartEditFecha = (mensaje: ColaSeguimiento) => {
    if (!mensaje.id) return;
    
    const fechaProgramada = mensaje.fecha_programada || mensaje.scheduled_at || mensaje.programado_para;
    if (fechaProgramada) {
      // Convertir a formato datetime-local (YYYY-MM-DDTHH:mm)
      const date = new Date(fechaProgramada);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      setTempFecha(`${year}-${month}-${day}T${hours}:${minutes}`);
    } else {
      // Si no hay fecha, usar la fecha actual
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      setTempFecha(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
    setEditingFecha(mensaje.id);
  };

  const handleSaveFecha = async (mensajeId: number, tablaOrigen?: string) => {
    if (!tempFecha) {
      alert('Por favor ingresa una fecha y hora válida');
      return;
    }

    try {
      // El input datetime-local devuelve el formato "YYYY-MM-DDTHH:mm"
      // Necesitamos convertirlo a formato timestamp sin timezone (YYYY-MM-DD HH:mm:ss)
      // Sin convertir a UTC para evitar problemas de zona horaria
      const fechaLocal = new Date(tempFecha);
      
      // Obtener componentes en hora local (no UTC)
      const year = fechaLocal.getFullYear();
      const month = String(fechaLocal.getMonth() + 1).padStart(2, '0');
      const day = String(fechaLocal.getDate()).padStart(2, '0');
      const hours = String(fechaLocal.getHours()).padStart(2, '0');
      const minutes = String(fechaLocal.getMinutes()).padStart(2, '0');
      const seconds = String(fechaLocal.getSeconds()).padStart(2, '0');
      
      // Formato: YYYY-MM-DD HH:mm:ss (sin timezone)
      const fechaFormateada = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      
      // Crear ISO string para actualizar el estado local (usando hora local)
      const fechaISO = fechaLocal.toISOString();
      
      const success = await actualizarFechaProgramada(mensajeId, fechaFormateada, tablaOrigen);
      
      if (success) {
        // Actualizar el mensaje en el estado local
        setMensajes(mensajes.map(m => 
          m.id === mensajeId 
            ? { ...m, fecha_programada: fechaISO }
            : m
        ));
        setEditingFecha(null);
        setTempFecha('');
      } else {
        alert('Error al actualizar la fecha programada');
      }
    } catch (error) {
      console.error('Error updating fecha:', error);
      alert('Error al actualizar la fecha programada');
    }
  };

  const handleCancelEditFecha = () => {
    setEditingFecha(null);
    setTempFecha('');
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatDateShort = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatTime = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit'
    }).format(date);
  };

  const normalizePhoneNumber = (phone: string | undefined) => {
    if (!phone) return 'N/A';
    // Remover @s.whatsapp.net si existe
    let normalized = phone.replace('@s.whatsapp.net', '');
    // Remover WAID: si existe
    normalized = normalized.replace(/^WAID:/, '');
    normalized = normalized.replace(/^whatsapp:/, '');
    return normalized;
  };

  const getDayKey = (dateString: string | undefined): string => {
    if (!dateString) return 'sin-fecha';
    const date = new Date(dateString);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  };

  const formatDayLabel = (dateString: string): string => {
    const date = new Date(dateString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const dayKey = getDayKey(dateString);
    const todayKey = getDayKey(today.toISOString());
    const tomorrowKey = getDayKey(tomorrow.toISOString());
    
    if (dayKey === todayKey) return 'Hoy';
    if (dayKey === tomorrowKey) return 'Mañana';
    
    return new Intl.DateTimeFormat('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    }).format(date);
  };

  const formatTimeOnly = (dateString: string | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-AR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  // Función para obtener el número de toque basado en seguimientos_count
  const getToqueNumber = (mensaje: ColaSeguimiento): number => {
    // seguimientos_count = 0 → Toque 1
    // seguimientos_count = 1 → Toque 2
    // seguimientos_count = 2 → Toque 3
    // etc.
    // seguimientos_count = null → Toque 1
    if (mensaje.seguimientos_count !== undefined && mensaje.seguimientos_count !== null) {
      return mensaje.seguimientos_count + 1;
    }
    // Si es null, mostrar Toque 1
    return 1;
  };

  // Función para toggle del acordeón
  const toggleDay = (dayKey: string) => {
    setExpandedDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dayKey)) {
        newSet.delete(dayKey);
      } else {
        newSet.add(dayKey);
      }
      return newSet;
    });
  };

  // Separar mensajes por estado
  // Filtrar mensajes pendientes: solo los programados para hoy en adelante
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0); // Inicio del día de hoy
  
  const mensajesPendientes = mensajes.filter(m => {
    if (m.estado !== 'pendiente') return false;
    
    const fechaProgramada = m.fecha_programada || m.scheduled_at || m.programado_para;
    if (!fechaProgramada) return true; // Si no tiene fecha, mostrarlo (sin-fecha)
    
    const fechaMensaje = new Date(fechaProgramada);
    fechaMensaje.setHours(0, 0, 0, 0); // Inicio del día de la fecha programada
    
    // Solo incluir si la fecha es hoy o en el futuro
    return fechaMensaje >= hoy;
  });
  
  const mensajesEnviados = mensajes.filter(m => m.estado === 'enviado');

  // Agrupar mensajes pendientes por día
  const mensajesPendientesPorDia = mensajesPendientes.reduce((acc, mensaje) => {
    const fechaProgramada = mensaje.fecha_programada || mensaje.scheduled_at || mensaje.programado_para;
    const dayKey = getDayKey(fechaProgramada);
    
    if (!acc[dayKey]) {
      acc[dayKey] = [];
    }
    acc[dayKey].push(mensaje);
    return acc;
  }, {} as Record<string, ColaSeguimiento[]>);

  // Agrupar mensajes enviados por día
  const mensajesEnviadosPorDia = mensajesEnviados.reduce((acc, mensaje) => {
    const fechaProgramada = mensaje.fecha_programada || mensaje.scheduled_at || mensaje.programado_para || mensaje.enviado_at || mensaje.enviado_en || undefined;
    const dayKey = getDayKey(fechaProgramada ?? undefined);
    
    if (!acc[dayKey]) {
      acc[dayKey] = [];
    }
    acc[dayKey].push(mensaje);
    return acc;
  }, {} as Record<string, ColaSeguimiento[]>);

  // Ordenar los días (más antiguos primero)
  const ordenarDias = (dias: string[]) => {
    return dias.sort((a, b) => {
      if (a === 'sin-fecha') return 1;
      if (b === 'sin-fecha') return -1;
      return a.localeCompare(b);
    });
  };

  const diasPendientesOrdenados = ordenarDias(Object.keys(mensajesPendientesPorDia));
  const diasEnviadosOrdenados = ordenarDias(Object.keys(mensajesEnviadosPorDia));

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-slate-800">Cargando mensajes programados...</h2>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="mb-8 ">
        <div className="sticky top-0 z-10 backdrop-blur bg-white/70 border-b border-slate-200 mb-2">
          <div className="px-2 py-2">
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
                    <span className="ml-1 text-sm font-medium text-gray-500 md:ml-2">Mensajes Programados</span>
                  </div>
                </li>
              </ol>
            </nav>
          </div>

          <div className="px-6 py-4 flex justify-between items-center border-t border-slate-100">
            <div>
              <h1 className="text-lg font-semibold text-slate-800 tracking-tight">Mensajes Programados</h1>
              <p className="text-sm text-gray-500 mt-1">
                {mensajesPendientes.length} pendiente(s) · {mensajesEnviados.length} enviado(s)
              </p>
            </div>
            <Button onClick={loadMensajes} variant="outline" size="sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Actualizar
            </Button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          {/* Mensajes Pendientes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="h-2 w-2 bg-orange-500 rounded-full"></span>
                Pendientes ({mensajesPendientes.length})
              </CardTitle>
              <CardDescription>
                Mensajes programados que aún no se han enviado
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mensajesPendientes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>No hay mensajes pendientes</p>
                </div>
              ) : (
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {diasPendientesOrdenados.map((dayKey) => {
                    const mensajesDelDia = mensajesPendientesPorDia[dayKey];
                    const isExpanded = expandedDays.has(dayKey);
                    
                    return (
                      <div
                        key={dayKey}
                        className="flex-shrink-0 w-80 border border-gray-200 rounded-lg bg-white overflow-hidden"
                      >
                        {/* Encabezado del acordeón */}
                        <button
                          onClick={() => toggleDay(dayKey)}
                          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="text-left">
                              <h3 className="text-sm font-semibold text-gray-900">
                                {formatDayLabel(dayKey === 'sin-fecha' ? new Date().toISOString() : dayKey)}
                              </h3>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {mensajesDelDia.length} mensaje{mensajesDelDia.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
                            Pendiente
                          </span>
                        </button>
                        
                        {/* Contenido desplegable */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 p-4 bg-gray-50 max-h-[600px] overflow-y-auto">
                            <div className="space-y-3">
                              {mensajesDelDia
                                .sort((a, b) => {
                                  const fechaA = a.fecha_programada || a.scheduled_at || a.programado_para;
                                  const fechaB = b.fecha_programada || b.scheduled_at || b.programado_para;
                                  if (!fechaA) return 1;
                                  if (!fechaB) return -1;
                                  return new Date(fechaA).getTime() - new Date(fechaB).getTime();
                                })
                                .map((mensaje) => {
                                  const fechaProgramada = mensaje.fecha_programada || mensaje.scheduled_at || mensaje.programado_para;
                                  const telefono = normalizePhoneNumber(mensaje.remote_jid || mensaje.whatsapp_id || String(mensaje.lead_id || ''));
                                  const toqueNumber = getToqueNumber(mensaje);
                                  
                                  return (
                                    <div
                                      key={mensaje.id}
                                      className="border border-gray-200 rounded-md p-3 hover:shadow-sm transition-shadow bg-white"
                                    >
                                      <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                          {/* Teléfono y Toque */}
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5">
                                              <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                              </svg>
                                              <span className="text-sm font-medium text-gray-900 truncate">
                                                {telefono}
                                              </span>
                                            </div>
                                            {/* Badge de Toque */}
                                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                              Toque {toqueNumber}
                                            </span>
                                          </div>
                                        
                                        {/* Selector de Plantilla */}
                                        <div className="mb-1.5">
                                          <Select
                                            value={mensaje.plantilla || 'none'}
                                            onValueChange={(value) => mensaje.id && handleUpdatePlantilla(mensaje.id, value, mensaje.tabla_origen)}
                                            disabled={updatingPlantilla === mensaje.id}
                                          >
                                            <SelectTrigger className="h-7 text-xs">
                                              <SelectValue placeholder="Sin plantilla" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="none">Sin plantilla</SelectItem>
                                              {PLANTILLAS.map((plantilla) => (
                                                <SelectItem key={plantilla.value} value={plantilla.value}>
                                                  {plantilla.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                        
                                        {/* Hora programada - Editable */}
                                        {editingFecha === mensaje.id ? (
                                          <div className="space-y-1">
                                            <input
                                              type="datetime-local"
                                              value={tempFecha}
                                              onChange={(e) => setTempFecha(e.target.value)}
                                              className="w-full px-2 py-1 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                              autoFocus
                                            />
                                            <div className="flex gap-1">
                                              <button
                                                onClick={() => mensaje.id && handleSaveFecha(mensaje.id, mensaje.tabla_origen)}
                                                className="flex-1 px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                              >
                                                Guardar
                                              </button>
                                              <button
                                                onClick={handleCancelEditFecha}
                                                className="flex-1 px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                              >
                                                Cancelar
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div 
                                            className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-blue-900 cursor-pointer hover:bg-blue-100 transition-colors"
                                            onClick={() => handleStartEditFecha(mensaje)}
                                            title="Click para editar fecha y hora"
                                          >
                                            <svg className="h-3 w-3 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="text-xs font-semibold">
                                              {fechaProgramada ? formatTimeOnly(fechaProgramada) : 'Sin fecha'}
                                            </span>
                                            <svg className="h-3 w-3 text-blue-600 flex-shrink-0 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                          </div>
                                        )}
                                      </div>
                                      
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => mensaje.id && handleDelete(mensaje.id, mensaje.tabla_origen)}
                                        disabled={isDeleting === mensaje.id}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0 flex-shrink-0"
                                        title="Eliminar mensaje programado"
                                      >
                                        {isDeleting === mensaje.id ? (
                                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                                        ) : (
                                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                          </svg>
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mensajes Enviados */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="h-2 w-2 bg-green-500 rounded-full"></span>
                Enviados ({mensajesEnviados.length})
              </CardTitle>
              <CardDescription>
                Mensajes que ya fueron enviados
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mensajesEnviados.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p>No hay mensajes enviados</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {diasEnviadosOrdenados.map((dayKey) => {
                    const mensajesDelDia = mensajesEnviadosPorDia[dayKey];
                    const isExpanded = expandedDays.has(`enviado-${dayKey}`);
                    
                    return (
                      <div
                        key={dayKey}
                        className="border border-gray-200 rounded-lg bg-white overflow-hidden"
                      >
                        {/* Encabezado del acordeón */}
                        <button
                          onClick={() => toggleDay(`enviado-${dayKey}`)}
                          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <svg
                              className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <div className="text-left">
                              <h3 className="text-sm font-semibold text-gray-900">
                                {formatDayLabel(dayKey === 'sin-fecha' ? new Date().toISOString() : dayKey)}
                              </h3>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {mensajesDelDia.length} mensaje{mensajesDelDia.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                            Enviado
                          </span>
                        </button>
                        
                        {/* Contenido desplegable */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 p-4 bg-gray-50">
                            <div className="space-y-3">
                              {mensajesDelDia
                                .sort((a, b) => {
                                  const fechaA = a.enviado_at || a.enviado_en || a.fecha_programada || a.scheduled_at || a.programado_para;
                                  const fechaB = b.enviado_at || b.enviado_en || b.fecha_programada || b.scheduled_at || b.programado_para;
                                  if (!fechaA) return 1;
                                  if (!fechaB) return -1;
                                  return new Date(fechaB).getTime() - new Date(fechaA).getTime(); // Más recientes primero
                                })
                                .map((mensaje) => {
                                  const fechaProgramada = mensaje.fecha_programada || mensaje.scheduled_at || mensaje.programado_para;
                                  const fechaEnviado = mensaje.enviado_at || mensaje.enviado_en;
                                  const telefono = normalizePhoneNumber(mensaje.remote_jid || mensaje.whatsapp_id || String(mensaje.lead_id || ''));
                                  const toqueNumber = getToqueNumber(mensaje);
                                  
                                  return (
                                    <div
                                      key={mensaje.id}
                                      className="border border-gray-200 rounded-md p-3 hover:shadow-sm transition-shadow bg-white"
                                    >
                                      <div className="flex justify-between items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                          {/* Teléfono y Toque */}
                                          <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5">
                                              <svg className="h-4 w-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                              </svg>
                                              <span className="text-sm font-medium text-gray-900 truncate">
                                                {telefono}
                                              </span>
                                            </div>
                                            {/* Badge de Toque */}
                                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                              Toque {toqueNumber}
                                            </span>
                                          </div>
                                          
                                          {/* Selector de Plantilla */}
                                          <div className="mb-2">
                                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                              Plantilla
                                            </label>
                                            <Select
                                              value={mensaje.plantilla || 'none'}
                                              onValueChange={(value) => mensaje.id && handleUpdatePlantilla(mensaje.id, value, mensaje.tabla_origen)}
                                              disabled={updatingPlantilla === mensaje.id}
                                            >
                                              <SelectTrigger className="h-8 text-xs">
                                                <SelectValue placeholder="Sin plantilla" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="none">Sin plantilla</SelectItem>
                                                {PLANTILLAS.map((plantilla) => (
                                                  <SelectItem key={plantilla.value} value={plantilla.value}>
                                                    {plantilla.label}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          
                                          {/* Fechas */}
                                          <div className="space-y-2">
                                            {/* Hora programada - Editable */}
                                            {fechaProgramada && (
                                              <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                  Fecha Programada
                                                </label>
                                                {editingFecha === mensaje.id ? (
                                                  <div className="space-y-2">
                                                    <input
                                                      type="datetime-local"
                                                      value={tempFecha}
                                                      onChange={(e) => setTempFecha(e.target.value)}
                                                      className="w-full px-2 py-1.5 text-xs border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                      autoFocus
                                                    />
                                                    <div className="flex gap-2">
                                                      <button
                                                        onClick={() => mensaje.id && handleSaveFecha(mensaje.id, mensaje.tabla_origen)}
                                                        className="flex-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                                      >
                                                        Guardar
                                                      </button>
                                                      <button
                                                        onClick={handleCancelEditFecha}
                                                        className="flex-1 px-3 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                                      >
                                                        Cancelar
                                                      </button>
                                                    </div>
                                                  </div>
                                                ) : (
                                                  <div 
                                                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded text-blue-900 cursor-pointer hover:bg-blue-100 transition-colors"
                                                    onClick={() => handleStartEditFecha(mensaje)}
                                                    title="Click para editar fecha y hora"
                                                  >
                                                    <svg className="h-4 w-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    <span className="text-xs font-semibold">
                                                      {formatTimeOnly(fechaProgramada)}
                                                    </span>
                                                    <svg className="h-4 w-4 text-blue-600 flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                            
                                            {/* Hora enviado */}
                                            {fechaEnviado && (
                                              <div>
                                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                                  Fecha Enviado
                                                </label>
                                                <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded text-green-900">
                                                  <svg className="h-4 w-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                  </svg>
                                                  <span className="text-xs font-semibold">
                                                    {formatTimeOnly(fechaEnviado)}
                                                  </span>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={() => mensaje.id && handleDelete(mensaje.id, mensaje.tabla_origen)}
                                          disabled={isDeleting === mensaje.id}
                                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 w-8 p-0 flex-shrink-0"
                                          title="Eliminar mensaje"
                                        >
                                          {isDeleting === mensaje.id ? (
                                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                                          ) : (
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                          )}
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </AppLayout>
  );
}

