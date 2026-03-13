import { createClient } from '@supabase/supabase-js';

// Read from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let supabaseClient: ReturnType<typeof createClient> | null = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing. Define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

export interface MensajeProgramado {
  id?: number;
  remote_jid: string;
  mensaje: string;
  scheduled_at: string;
  enviado?: boolean;
  enviado_at?: string | null;
}

// Interfaz para seguimientos
export interface ColaSeguimiento {
  id?: number;
  lead_id?: string | number;
  remote_jid?: string;
  whatsapp_id?: string; // Campo de la tabla seguimientos
  mensaje?: string;
  mensaje_enviado?: string; // Campo de la tabla seguimientos
  fecha_programada?: string;
  scheduled_at?: string;
  programado_para?: string; // Campo de la tabla seguimientos
  enviado?: boolean;
  enviado_at?: string | null;
  enviado_en?: string | null; // Campo de la tabla seguimientos
  estado?: string;
  tipo?: string; // Campo de la tabla seguimientos
  created_at?: string;
  updated_at?: string;
  tabla_origen?: string; // Para identificar de qué tabla viene: 'seguimientos'
  plantilla?: string | null; // Nombre de la plantilla seleccionada: 'toque_1_frio', 'toque_2_frio', 'toque_1_tibio', 'toque_2_tibio', 'toque_3_tibio'
  seguimientos_count?: number; // Para compatibilidad con la UI
  [key: string]: any; // Para campos adicionales que pueda tener la tabla
}

/**
 * Programa un mensaje para enviar más tarde
 */
export const programarMensaje = async (mensajeData: Omit<MensajeProgramado, 'id' | 'enviado' | 'enviado_at'>): Promise<boolean> => {
  try {
    console.log('Programando mensaje:', mensajeData);
    
    const { data, error } = await (getSupabase() as any)
      .from('mensajes_programados')
      .insert({
        remote_jid: mensajeData.remote_jid,
        mensaje: mensajeData.mensaje,
        scheduled_at: mensajeData.scheduled_at,
        enviado: false
      })
      .select();
    
    if (error) {
      console.error('Error programando mensaje:', error.message, error);
      return false;
    }
    
    console.log('Mensaje programado exitosamente:', data);
    return true;
  } catch (e) {
    console.error('Exception programando mensaje:', e);
    return false;
  }
};

/**
 * Obtiene todos los mensajes programados de la tabla seguimientos
 * Incluye mensajes con estado pendiente y enviado
 */
export const getMensajesProgramados = async (): Promise<ColaSeguimiento[]> => {
  try {
    // Obtener mensajes de seguimientos (pendientes y enviados)
    const { data, error } = await (getSupabase() as any)
      .from('seguimientos')
      .select('*')
      .in('estado', ['pendiente', 'enviado'])
      .order('programado_para', { ascending: true });
    
    if (error) {
      console.error('Error obteniendo mensajes programados de seguimientos:', error.message);
      return [];
    }
    
    if (!data) {
      return [];
    }
    
    // Mapear los campos de la tabla seguimientos a la interfaz ColaSeguimiento
    const mensajes: ColaSeguimiento[] = data.map((m: any) => {
      // Calcular seguimientos_count basado en el tipo si es posible
      // El tipo puede contener información como 'toque_1_frio', 'toque_2_tibio', etc.
      let seguimientosCount: number | undefined = undefined;
      if (m.tipo) {
        const numeroToque = extraerNumeroToque(m.tipo);
        const tipoToque = extraerTipoToque(m.tipo);
        if (numeroToque !== null && tipoToque) {
          if (tipoToque === 'frio') {
            // Fríos: seguimientos_count = número del toque - 1 (0-7 para toques 1-8)
            seguimientosCount = numeroToque - 1;
          } else if (tipoToque === 'tibio') {
            // Tibios: seguimientos_count = número del toque + 7 (8-15 para toques 1-8)
            seguimientosCount = numeroToque + 7;
          }
        }
      }
      
      // Mapear campos de seguimientos a ColaSeguimiento
      const mensaje: ColaSeguimiento = {
        id: m.id,
        lead_id: m.lead_id,
        whatsapp_id: m.whatsapp_id,
        remote_jid: m.whatsapp_id, // whatsapp_id se mapea también a remote_jid para compatibilidad
        tipo: m.tipo,
        programado_para: m.programado_para,
        fecha_programada: m.programado_para, // Mapear programado_para a fecha_programada
        scheduled_at: m.programado_para, // Mapear programado_para a scheduled_at
        enviado_en: m.enviado_en,
        enviado_at: m.enviado_en, // Mapear enviado_en a enviado_at
        estado: m.estado,
        mensaje_enviado: m.mensaje_enviado,
        mensaje: m.mensaje_enviado, // Mapear mensaje_enviado a mensaje
        created_at: m.created_at,
        tabla_origen: 'seguimientos',
        seguimientos_count: seguimientosCount,
        plantilla: m.tipo, // Mapear tipo a plantilla para compatibilidad con la UI
      };
      return mensaje;
    });
    
    // Ordenar todos los mensajes por fecha programada
    const sorted = mensajes.sort((a: ColaSeguimiento, b: ColaSeguimiento) => {
      const dateA = new Date(a.fecha_programada || a.scheduled_at || a.programado_para || a.created_at || 0).getTime();
      const dateB = new Date(b.fecha_programada || b.scheduled_at || b.programado_para || b.created_at || 0).getTime();
      return dateA - dateB;
    });
    
    return sorted;
  } catch (e) {
    console.error('Supabase not configured or failed to initialize:', e);
    return [];
  }
};

/**
 * Elimina un mensaje programado de la cola
 * @param id - ID del mensaje
 * @param tablaOrigen - Tabla de origen: 'seguimientos' (por compatibilidad, se ignora si se pasa otro valor)
 */
export const eliminarMensajeProgramado = async (id: number, tablaOrigen?: string): Promise<boolean> => {
  try {
    const tabla = 'seguimientos'; // Siempre usar la tabla seguimientos
    const { error } = await (getSupabase() as any)
      .from(tabla)
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error(`Error eliminando mensaje programado de ${tabla}:`, error.message);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Exception eliminando mensaje programado:', e);
    return false;
  }
};

/**
 * Genera variantes de un remote_jid para buscar en la DB
 * Ya que puede estar guardado con o sin +, con o sin @s.whatsapp.net, etc.
 */
const getRemoteJidVariantes = (remoteJid: string): string[] => {
  const soloDigitos = remoteJid.replace(/[^\d]/g, '');
  const variantes = new Set<string>();
  variantes.add(remoteJid); // Original
  variantes.add(soloDigitos); // Solo dígitos
  variantes.add(`+${soloDigitos}`); // Con +
  return Array.from(variantes);
};

/**
 * Elimina TODOS los seguimientos de un lead por su remote_jid (cualquier estado)
 * Busca y elimina en ambas tablas: cola_seguimientos y cola_seguimientos_dos
 * Prueba múltiples variantes del remote_jid (con/sin +) para asegurar que se eliminen todos
 */
export const eliminarTodosSeguimientosPendientes = async (remoteJid: string): Promise<boolean> => {
  try {
    let allSuccess = true;
    const variantes = getRemoteJidVariantes(remoteJid);
    console.log(`🗑️ Eliminando seguimientos para variantes:`, variantes);
    
    // Eliminar de cola_seguimientos con todas las variantes del remote_jid
    const { error: errorCola1 } = await (getSupabase() as any)
      .from('cola_seguimientos')
      .delete()
      .in('remote_jid', variantes);
    
    if (errorCola1) {
      console.error('Error eliminando seguimientos de cola_seguimientos:', errorCola1.message);
      allSuccess = false;
    } else {
      console.log(`✅ Seguimientos eliminados de cola_seguimientos para ${remoteJid}`);
    }
    
    // Eliminar de cola_seguimientos_dos con todas las variantes
    const { error: errorCola2 } = await (getSupabase() as any)
      .from('cola_seguimientos_dos')
      .delete()
      .in('remote_jid', variantes);
    
    if (errorCola2) {
      console.error('Error eliminando seguimientos de cola_seguimientos_dos:', errorCola2.message);
      allSuccess = false;
    } else {
      console.log(`✅ Seguimientos eliminados de cola_seguimientos_dos para ${remoteJid}`);
    }
    
    return allSuccess;
  } catch (e) {
    console.error('Exception eliminando todos los seguimientos:', e);
    return false;
  }
};

/**
 * Verifica si un remote_jid tiene seguimientos en cola_seguimientos (cualquier estado)
 * Prueba múltiples variantes del remote_jid (con/sin +) para encontrar coincidencias
 * Retorna true si existe al menos un registro
 */
export const existeSeguimientoParaLead = async (remoteJid: string): Promise<boolean> => {
  try {
    const variantes = getRemoteJidVariantes(remoteJid);
    console.log(`🔍 Buscando seguimientos para variantes:`, variantes);
    
    // Buscar en cola_seguimientos con todas las variantes
    const { data: dataCola1, error: errorCola1 } = await (getSupabase() as any)
      .from('cola_seguimientos')
      .select('id')
      .in('remote_jid', variantes)
      .limit(1);
    
    if (!errorCola1 && dataCola1 && dataCola1.length > 0) {
      console.log(`✅ Seguimiento encontrado en cola_seguimientos`);
      return true;
    }
    
    // Buscar en cola_seguimientos_dos con todas las variantes
    const { data: dataCola2, error: errorCola2 } = await (getSupabase() as any)
      .from('cola_seguimientos_dos')
      .select('id')
      .in('remote_jid', variantes)
      .limit(1);
    
    if (!errorCola2 && dataCola2 && dataCola2.length > 0) {
      console.log(`✅ Seguimiento encontrado en cola_seguimientos_dos`);
      return true;
    }
    
    console.log(`❌ No se encontraron seguimientos para ${remoteJid}`);
    return false;
  } catch (e) {
    console.error('Exception verificando existencia de seguimiento:', e);
    return false;
  }
};

/**
 * Mueve un mensaje de una tabla a otra
 * @param id - ID del mensaje
 * @param tablaOrigen - Tabla de origen: 'cola_seguimientos' o 'cola_seguimientos_dos'
 * @param tablaDestino - Tabla de destino: 'cola_seguimientos' o 'cola_seguimientos_dos'
 * @returns El nuevo ID del mensaje en la tabla destino, o null si falla
 */
export const moverMensajeEntreTablas = async (
  id: number,
  tablaOrigen: string,
  tablaDestino: string
): Promise<number | null> => {
  try {
    // Leer el mensaje de la tabla origen
    const { data: mensajeData, error: errorRead } = await (getSupabase() as any)
      .from(tablaOrigen)
      .select('*')
      .eq('id', id)
      .single();
    
    if (errorRead || !mensajeData) {
      console.error(`Error leyendo mensaje de ${tablaOrigen}:`, errorRead?.message);
      return null;
    }
    
    // Preparar datos para insertar (sin el ID para que genere uno nuevo)
    // Preservar TODOS los campos incluyendo chatwoot_conversation_id
    const { id: _, created_at: __, updated_at: ___, ...dataToInsert } = mensajeData;
    
    // Log para verificar que chatwoot_conversation_id se preserve
    if (mensajeData.chatwoot_conversation_id) {
      console.log(`📋 Preservando chatwoot_conversation_id: ${mensajeData.chatwoot_conversation_id} al mover mensaje`);
    }
    
    // Insertar en la tabla destino
    const { data: newMensaje, error: errorInsert } = await (getSupabase() as any)
      .from(tablaDestino)
      .insert([dataToInsert])
      .select()
      .single();
    
    if (errorInsert || !newMensaje) {
      console.error(`Error insertando mensaje en ${tablaDestino}:`, errorInsert?.message);
      return null;
    }
    
    // Verificar que chatwoot_conversation_id se preservó
    if (mensajeData.chatwoot_conversation_id && newMensaje.chatwoot_conversation_id !== mensajeData.chatwoot_conversation_id) {
      console.warn(`⚠️ chatwoot_conversation_id no se preservó correctamente. Original: ${mensajeData.chatwoot_conversation_id}, Nuevo: ${newMensaje.chatwoot_conversation_id}`);
    }
    
    // Eliminar de la tabla origen
    const { error: errorDelete } = await (getSupabase() as any)
      .from(tablaOrigen)
      .delete()
      .eq('id', id);
    
    if (errorDelete) {
      console.error(`Error eliminando mensaje de ${tablaOrigen}:`, errorDelete?.message);
      // Intentar revertir: eliminar el mensaje insertado en la tabla destino
      await (getSupabase() as any)
        .from(tablaDestino)
        .delete()
        .eq('id', newMensaje.id);
      return null;
    }
    
    console.log(`✅ Mensaje movido de ${tablaOrigen} a ${tablaDestino}. ID anterior: ${id}, ID nuevo: ${newMensaje.id}`);
    return newMensaje.id;
  } catch (e) {
    console.error('Exception moviendo mensaje entre tablas:', e);
    return null;
  }
};

/**
 * Extrae el número del toque de una plantilla
 * @param plantilla - Nombre de la plantilla (ej: 'toque_1_frio', 'toque_2_tibio', 'toque_3_tibio')
 * @returns El número del toque (1-8) o null si no se puede determinar
 */
const extraerNumeroToque = (plantilla: string | null): number | null => {
  if (!plantilla) return null;
  
  // Buscar el patrón "toque_X_" donde X es el número
  const match = plantilla.match(/toque_(\d+)_/);
  if (match && match[1]) {
    return parseInt(match[1], 10);
  }
  
  return null;
};

/**
 * Determina si una plantilla es de tipo "frio" o "tibio"
 * @param plantilla - Nombre de la plantilla
 * @returns 'frio', 'tibio', o null si no se puede determinar
 */
const extraerTipoToque = (plantilla: string | null): 'frio' | 'tibio' | null => {
  if (!plantilla) return null;
  
  if (plantilla.includes('_frio')) return 'frio';
  if (plantilla.includes('_tibio')) return 'tibio';
  
  return null;
};

/**
 * Actualiza la plantilla de un mensaje programado
 * Como la tabla seguimientos no tiene campo plantilla, actualiza el campo tipo basado en la plantilla
 * @param id - ID del mensaje
 * @param plantilla - Nombre de la plantilla a asignar (puede ser null para quitar la plantilla)
 * @param tablaOrigen - Tabla de origen: 'seguimientos' (por compatibilidad, se ignora si se pasa otro valor)
 * @returns Objeto con { success: boolean, nuevaTabla?: string, nuevoId?: number }
 */
export const actualizarPlantillaMensaje = async (
  id: number, 
  plantilla: string | null, 
  tablaOrigen?: string
): Promise<{ success: boolean; nuevaTabla?: string; nuevoId?: number }> => {
  try {
    const tabla = 'seguimientos'; // Siempre usar la tabla seguimientos
    
    // La tabla seguimientos no tiene campo plantilla, pero podemos actualizar el campo tipo
    // basado en la plantilla seleccionada
    const tipoToque = extraerTipoToque(plantilla);
    const datosActualizacion: any = {};
    
    // Si hay una plantilla, actualizar el tipo basado en ella
    // Si no hay plantilla, no actualizar nada (mantener el tipo existente)
    if (plantilla && tipoToque) {
      // Mapear el tipo de toque al campo tipo de la tabla seguimientos
      // Por ejemplo: 'toque_1_frio' → tipo podría ser 'frio' o 'toque_1_frio'
      datosActualizacion.tipo = plantilla; // Guardar la plantilla completa en el campo tipo
    }
    
    // Si no hay datos para actualizar, retornar success sin hacer nada
    if (Object.keys(datosActualizacion).length === 0) {
      console.log(`ℹ️ No hay campos para actualizar para el mensaje ${id}`);
      return { success: true, nuevaTabla: tabla };
    }
    
    console.log(`🔄 Actualizando tipo del mensaje ${id} en ${tabla}:`, datosActualizacion);
    
    const { error } = await (getSupabase() as any)
      .from(tabla)
      .update(datosActualizacion)
      .eq('id', id);
    
    if (error) {
      console.error(`Error actualizando plantilla del mensaje en ${tabla}:`, error.message);
      return { success: false };
    }
    
    return { success: true, nuevaTabla: tabla };
  } catch (e) {
    console.error('Exception actualizando plantilla del mensaje:', e);
    return { success: false };
  }
};

/**
 * Actualiza la fecha programada de un mensaje
 * @param id - ID del mensaje
 * @param fechaProgramada - Nueva fecha y hora programada (puede ser ISO string o formato "YYYY-MM-DD HH:mm:ss")
 * @param tablaOrigen - Tabla de origen: 'seguimientos' (por compatibilidad, se ignora si se pasa otro valor)
 */
export const actualizarFechaProgramada = async (
  id: number,
  fechaProgramada: string,
  tablaOrigen?: string
): Promise<boolean> => {
  try {
    const tabla = 'seguimientos'; // Siempre usar la tabla seguimientos
    
    // Si ya está en formato "YYYY-MM-DD HH:mm:ss", usarlo directamente
    // Si está en formato ISO (con 'T' o con 'Z'), convertirlo
    let fechaFormateada: string;
    
    if (fechaProgramada.includes('T')) {
      // Formato ISO: "YYYY-MM-DDTHH:mm:ss" o "YYYY-MM-DDTHH:mm:ss.sssZ"
      fechaFormateada = fechaProgramada.replace('T', ' ').slice(0, 19);
    } else if (fechaProgramada.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/)) {
      // Ya está en formato "YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DD HH:mm"
      fechaFormateada = fechaProgramada.length === 16 
        ? fechaProgramada + ':00' // Agregar segundos si faltan
        : fechaProgramada.slice(0, 19); // Asegurar que tenga exactamente 19 caracteres
    } else {
      // Intentar parsear como Date y convertir
      const date = new Date(fechaProgramada);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      fechaFormateada = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }
    
    // Actualizar el campo programado_para en la tabla seguimientos
    const { error } = await (getSupabase() as any)
      .from(tabla)
      .update({ programado_para: fechaFormateada })
      .eq('id', id);
    
    if (error) {
      console.error(`Error actualizando fecha programada del mensaje en ${tabla}:`, error.message);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Exception actualizando fecha programada del mensaje:', e);
    return false;
  }
};

/**
 * Marca un mensaje como enviado
 */
export const marcarMensajeEnviado = async (mensajeId: number): Promise<boolean> => {
  try {
    const { error } = await (getSupabase() as any)
      .from('mensajes_programados')
      .update({ 
        enviado: true, 
        enviado_at: new Date().toISOString() 
      })
      .eq('id', mensajeId);
    
    if (error) {
      console.error('Error marcando mensaje como enviado:', error.message);
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Exception marcando mensaje como enviado:', e);
    return false;
  }
};

/**
 * Obtiene los seguimientos pendientes de un lead por remote_jid
 * @param remoteJid - Número de teléfono del lead
 */
export const getSeguimientosPendientes = async (remoteJid: string): Promise<ColaSeguimiento[]> => {
  try {
    const allSeguimientos: ColaSeguimiento[] = [];
    
    // Buscar en cola_seguimientos
    const { data: dataCola1, error: errorCola1 } = await (getSupabase() as any)
      .from('cola_seguimientos')
      .select('*')
      .eq('remote_jid', remoteJid)
      .eq('estado', 'pendiente')
      .order('fecha_programada', { ascending: true });
    
    if (errorCola1) {
      console.error('Error obteniendo seguimientos pendientes de cola_seguimientos:', errorCola1.message);
    } else if (dataCola1) {
      const seguimientosCola1 = dataCola1.map((m: ColaSeguimiento) => ({
        ...m,
        tabla_origen: 'cola_seguimientos'
      }));
      allSeguimientos.push(...seguimientosCola1);
    }
    
    // Buscar en cola_seguimientos_dos
    const { data: dataCola2, error: errorCola2 } = await (getSupabase() as any)
      .from('cola_seguimientos_dos')
      .select('*')
      .eq('remote_jid', remoteJid)
      .eq('estado', 'pendiente')
      .order('fecha_programada', { ascending: true });
    
    if (errorCola2) {
      console.error('Error obteniendo seguimientos pendientes de cola_seguimientos_dos:', errorCola2.message);
    } else if (dataCola2) {
      const seguimientosCola2 = dataCola2.map((m: ColaSeguimiento) => ({
        ...m,
        tabla_origen: 'cola_seguimientos_dos'
      }));
      allSeguimientos.push(...seguimientosCola2);
    }
    
    return allSeguimientos;
  } catch (e) {
    console.error('Exception obteniendo seguimientos pendientes:', e);
    return [];
  }
};

/**
 * Programa un seguimiento para un lead en cola_seguimientos
 * Si ya existe un mensaje programado con el mismo remote_jid, actualiza solo la fecha_programada
 * Si no existe, crea uno nuevo programado para dentro de 23 horas desde ahora
 * @returns Objeto con { success: boolean, actualizado: boolean, mensajeId?: number }
 */
export const programarSeguimiento = async (seguimientoData: {
  remote_jid: string;
  session_id?: string;
  tipo_lead?: string;
  fecha_ultima_interaccion?: string;
  chatwoot_conversation_id?: number;
  seguimientos_count?: number;
}): Promise<{ success: boolean; actualizado: boolean; mensajeId?: number }> => {
  try {
    console.log('🔔 Programando seguimiento:', seguimientoData);
    
    // Normalizar remote_jid: remover espacios, caracteres especiales, etc.
    const remoteJidNormalizado = seguimientoData.remote_jid
      .trim()
      .replace(/[^\d]/g, '') // Remover todo excepto dígitos
      .replace(/^\+/, ''); // Remover + al inicio si existe
    
    console.log(`🔍 Buscando mensajes con remote_jid: "${seguimientoData.remote_jid}" (normalizado: "${remoteJidNormalizado}")`);
    
    // Calcular fecha programada: ahora + 23 horas
    const ahora = new Date();
    const fechaProgramada = new Date(ahora.getTime() + (23 * 60 * 60 * 1000)); // 23 horas en milisegundos
    const fechaProgramadaFormateada = fechaProgramada.toISOString().replace('T', ' ').slice(0, 19); // Formato timestamp sin timezone
    
    // Primero buscar TODOS los mensajes con ese remote_jid (sin filtro de estado) para debug
    const { data: todosLosMensajes, error: errorBusquedaTodos } = await (getSupabase() as any)
      .from('cola_seguimientos')
      .select('id, remote_jid, estado, fecha_programada')
      .eq('remote_jid', seguimientoData.remote_jid);
    
    console.log(`📊 Total de mensajes encontrados con remote_jid "${seguimientoData.remote_jid}":`, todosLosMensajes?.length || 0);
    if (todosLosMensajes && todosLosMensajes.length > 0) {
      console.log('📋 Mensajes encontrados:', todosLosMensajes.map((m: any) => ({
        id: m.id,
        remote_jid: m.remote_jid,
        estado: m.estado,
        fecha_programada: m.fecha_programada
      })));
    }
    
    // Buscar si ya existe un mensaje programado con el mismo remote_jid en cola_seguimientos
    // Buscar tanto pendientes como enviados, ordenados por fecha_programada (más próximo primero)
    // Intentar búsqueda exacta primero
    let mensajesExistentes: any[] = [];
    let errorBusqueda: any = null;
    
    const { data: mensajesExactos, error: errorExacto } = await (getSupabase() as any)
      .from('cola_seguimientos')
      .select('*')
      .eq('remote_jid', seguimientoData.remote_jid)
      .in('estado', ['pendiente', 'enviado'])
      .order('fecha_programada', { ascending: true });
    
    if (errorExacto) {
      console.error('❌ Error en búsqueda exacta:', errorExacto.message);
      errorBusqueda = errorExacto;
    } else if (mensajesExactos && mensajesExactos.length > 0) {
      mensajesExistentes = mensajesExactos;
      console.log(`✅ Búsqueda exacta: ${mensajesExistentes.length} mensaje(s) encontrado(s)`);
    } else {
      // Si no se encuentra con búsqueda exacta, intentar buscar todos y filtrar manualmente
      // Esto ayuda a detectar problemas de formato
      console.log('⚠️ No se encontró con búsqueda exacta. Buscando todos los mensajes para comparación...');
      
      const { data: todosMensajes, error: errorTodos } = await (getSupabase() as any)
        .from('cola_seguimientos')
        .select('*')
        .in('estado', ['pendiente', 'enviado']);
      
      if (!errorTodos && todosMensajes) {
        // Normalizar y comparar manualmente
        const mensajesCoincidentes = todosMensajes.filter((m: any) => {
          if (!m.remote_jid) return false;
          // Normalizar ambos para comparar
          const mJidNormalizado = String(m.remote_jid).trim().replace(/[^\d]/g, '').replace(/^\+/, '');
          const buscadoNormalizado = remoteJidNormalizado;
          return mJidNormalizado === buscadoNormalizado;
        });
        
        if (mensajesCoincidentes.length > 0) {
          // Ordenar por fecha_programada
          mensajesCoincidentes.sort((a: any, b: any) => {
            const fechaA = a.fecha_programada ? new Date(a.fecha_programada).getTime() : 0;
            const fechaB = b.fecha_programada ? new Date(b.fecha_programada).getTime() : 0;
            return fechaA - fechaB;
          });
          mensajesExistentes = mensajesCoincidentes;
          console.log(`✅ Búsqueda normalizada: ${mensajesExistentes.length} mensaje(s) encontrado(s) después de normalizar`);
          console.log(`⚠️ ADVERTENCIA: Los remote_jid no coincidían exactamente. Original: "${seguimientoData.remote_jid}", Encontrado: "${mensajesExistentes[0].remote_jid}"`);
        }
      }
    }
    
    console.log(`🔍 Total de mensajes pendientes/enviados encontrados:`, mensajesExistentes.length);
    
    if (errorBusqueda && mensajesExistentes.length === 0) {
      console.error('❌ Error buscando mensajes existentes:', errorBusqueda.message, errorBusqueda);
      // Continuar con la creación de un nuevo mensaje
    } else if (mensajesExistentes && mensajesExistentes.length > 0) {
      // Existe al menos un mensaje, actualizar el más próximo (el primero en la lista ordenada)
      const mensajeMasProximo = mensajesExistentes[0];
      console.log(`📋 Mensaje existente encontrado (ID: ${mensajeMasProximo.id}). Actualizando fecha_programada y seguimientos_count.`);
      
      // Preparar datos a actualizar: fecha_programada y seguimientos_count (si viene en los datos)
      const datosActualizacion: any = { fecha_programada: fechaProgramadaFormateada };
      
      // Actualizar seguimientos_count si viene en los datos (por ejemplo, cuando se selecciona un toque)
      if (seguimientoData.seguimientos_count !== undefined && seguimientoData.seguimientos_count !== null) {
        datosActualizacion.seguimientos_count = seguimientoData.seguimientos_count;
        console.log(`📊 Actualizando seguimientos_count a ${seguimientoData.seguimientos_count}`);
      }
      
      // Actualizar fecha_programada y seguimientos_count (si aplica), sin tocar otros campos (especialmente chatwoot_conversation_id)
      const { error: errorUpdate } = await (getSupabase() as any)
        .from('cola_seguimientos')
        .update(datosActualizacion)
        .eq('id', mensajeMasProximo.id);
      
      if (errorUpdate) {
        console.error('Error actualizando mensaje existente:', errorUpdate.message);
        return { success: false, actualizado: false };
      }
      
      console.log(`✅ Mensaje actualizado exitosamente (ID: ${mensajeMasProximo.id})`);
      console.log(`📅 Nueva fecha: ${fechaProgramadaFormateada}`);
      if (seguimientoData.seguimientos_count !== undefined) {
        console.log(`📊 Nuevo seguimientos_count: ${seguimientoData.seguimientos_count}`);
      }
      
      // Verificar que chatwoot_conversation_id se preservó
      if (mensajeMasProximo.chatwoot_conversation_id) {
        console.log(`✅ chatwoot_conversation_id preservado: ${mensajeMasProximo.chatwoot_conversation_id}`);
      }
      
      return { success: true, actualizado: true, mensajeId: mensajeMasProximo.id };
    }
    
    // No existe ningún mensaje, crear uno nuevo
    console.log('📝 No se encontró mensaje existente con estado pendiente/enviado.');
    console.log(`📝 Creando nuevo mensaje programado con remote_jid: "${seguimientoData.remote_jid}"`);
    
    // Preparar datos para insertar según la estructura real de la tabla
    const dataToInsert: any = {
      remote_jid: seguimientoData.remote_jid,
      session_id: seguimientoData.session_id || seguimientoData.remote_jid, // Usar remote_jid como fallback si no hay session_id
      fecha_programada: fechaProgramadaFormateada,
      estado: 'pendiente'
    };
    
    // Agregar campos opcionales si existen
    if (seguimientoData.tipo_lead) {
      dataToInsert.tipo_lead = seguimientoData.tipo_lead;
    }
    
    if (seguimientoData.fecha_ultima_interaccion) {
      dataToInsert.fecha_ultima_interaccion = seguimientoData.fecha_ultima_interaccion;
    }
    
    // IMPORTANTE: Agregar chatwoot_conversation_id solo si viene en los datos (para nuevos registros)
    // Pero nunca modificar el existente
    if (seguimientoData.chatwoot_conversation_id) {
      dataToInsert.chatwoot_conversation_id = seguimientoData.chatwoot_conversation_id;
    }
    
    if (seguimientoData.seguimientos_count !== undefined && seguimientoData.seguimientos_count !== null) {
      dataToInsert.seguimientos_count = seguimientoData.seguimientos_count;
    }
    
    const { data, error } = await (getSupabase() as any)
      .from('cola_seguimientos')
      .insert([dataToInsert])
      .select();
    
    if (error) {
      console.error('Error programando seguimiento:', error.message, error);
      return { success: false, actualizado: false };
    }
    
    console.log('✅ Seguimiento programado exitosamente (nuevo):', data);
    const nuevoMensajeId = data && data[0] ? data[0].id : undefined;
    return { success: true, actualizado: false, mensajeId: nuevoMensajeId };
  } catch (e) {
    console.error('Exception programando seguimiento:', e);
    return { success: false, actualizado: false };
  }
};
