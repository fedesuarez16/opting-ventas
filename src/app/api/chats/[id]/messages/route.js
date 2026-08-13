import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildChatHistoryMessage } from '@/lib/chatHistory';

const getSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing. Define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
};

export async function GET(request, { params }) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'ID de sesión requerido' }, 
        { status: 400 }
      );
    }

    // Obtener parámetros de query para paginación
    const { searchParams } = new URL(request.url);
    const before = searchParams.get('before'); // ID del mensaje más antiguo que queremos obtener
    const after = searchParams.get('after'); // ID del mensaje más reciente que queremos obtener

    const supabase = getSupabase();
    
    // Construir query base
    // Ordenar por created_at ascendente (más antiguos primero) para que el frontend los muestre en orden cronológico
    let query = supabase
      .from('chat_histories')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    // Aplicar paginación si existe
    if (before) {
      query = query.lt('id', parseInt(before));
    }
    if (after) {
      query = query.gt('id', parseInt(after));
    }

    const { data: messages, error } = await query;

    if (error) {
      console.error('Error al obtener mensajes:', error);
      return NextResponse.json(
        { 
          error: 'Error al obtener mensajes de la base de datos',
          status: 500,
          message: error.message
        }, 
        { status: 500 }
      );
    }

    // Transformar mensajes de la base de datos al formato esperado por el frontend
    const formattedMessages = (messages || []).map(msg => {
      const messageData = msg.message || {};
      
      // Asegurar que created_at sea válido
      let createdAt = msg.created_at;
      if (!createdAt) {
        // Si no hay created_at en la base de datos, usar el del mensaje o la fecha actual
        createdAt = messageData.created_at || new Date().toISOString();
      }
      
      // Si created_at es un objeto Date, convertirlo a string ISO
      if (createdAt instanceof Date) {
        createdAt = createdAt.toISOString();
      }
      
      // DETECTAR SI ES MENSAJE DEL SISTEMA/AGENTE O DEL CLIENTE
      // Casos soportados:
      // - Mensajes del workflow de n8n (Postgres Chat Memory) con campo type: 'ai' | 'human'
      // - Campos estilo Chatwoot: message_type (0/1), direction ('inbound'/'outbound'), role ('assistant'/'user', etc.)
      const kind = messageData.type; // 'ai' | 'human' u otros
      const role = messageData.role || messageData.role_type;
      const direction = messageData.direction;
      const messageType = messageData.message_type;
      
      // Determinar si es mensaje del sistema (saliente)
      let isOutgoing = false;
      
      // 1) Priorizar el campo type usado por n8n: 'ai' = respuesta de la IA, 'human' = cliente
      if (kind === 'ai') {
        isOutgoing = true;
      } else if (kind === 'human') {
        isOutgoing = false;
      } else if (messageType !== undefined && messageType !== null) {
        // 2) Si tiene message_type explícito, usarlo
        isOutgoing = messageType === 1;
      } else if (direction) {
        // 3) Si tiene direction, usarlo
        isOutgoing = direction === 'outbound' || direction === 'out';
      } else if (role) {
        // 4) Si tiene role, mensajes del agente son 'assistant' / 'ai' / 'system'
        isOutgoing = role === 'assistant' || role === 'ai' || role === 'system';
      } else {
        // 5) Sin información, asumir que es mensaje entrante (del cliente)
        isOutgoing = false;
      }
      
      const finalMessageType = isOutgoing ? 1 : 0;
      const finalDirection = isOutgoing ? 'outbound' : 'inbound';
      const finalSenderType = isOutgoing ? 'User' : 'Contact';
      
      return {
        id: msg.id,
        content: messageData.content || messageData.text || '',
        message_type: finalMessageType,
        direction: finalDirection,
        created_at: createdAt,
        sender: {
          phone_number: messageData.phone_number || messageData.from,
          identifier: messageData.from || messageData.phone_number
        },
        source_id: messageData.source_id || messageData.from,
        status: messageData.status || 'sent',
        private: messageData.private || false,
        content_attributes: messageData.content_attributes || {},
        sender_type: finalSenderType,
        role: role, // Preservar el role si existe para debugging
        type: kind,
        ...messageData
      };
    }).filter(msg => {
      // Filtrar mensajes de actividad y mensajes borrados
      if (msg.message_type === 2) return false;
      if (!msg.content || msg.content.trim() === '') return false;
      
      const content = (msg.content || '').toLowerCase();
      const isDeleted = 
        content.includes('this message was deleted') ||
        content.includes('mensaje eliminado') ||
        content.includes('message was deleted') ||
        msg.content_attributes?.deleted === true ||
        msg.deleted === true ||
        msg.status === 'deleted';
      
      return !isDeleted;
    });

    console.log(`Found ${messages?.length || 0} total messages, ${formattedMessages.length} real messages`);

    return NextResponse.json({
      success: true,
      data: formattedMessages,
      total: formattedMessages.length,
      conversationId: sessionId
    });

  } catch (error) {
    console.error('Error en API de mensajes:', error);
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        message: error.message 
      }, 
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  try {
    const { id: sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json(
        { error: 'ID de sesión requerido' }, 
        { status: 400 }
      );
    }

    // Obtener el cuerpo de la petición
    const body = await request.json();
    const { content } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { error: 'El contenido del mensaje es requerido' }, 
        { status: 400 }
      );
    }

    const supabase = getSupabase();
    
    // Obtener información de la sesión para extraer el número de teléfono
    const { data: existingMessages } = await supabase
      .from('chat_histories')
      .select('message')
      .eq('session_id', sessionId)
      .limit(1)
      .single();

    // Extraer número de teléfono del mensaje existente o usar el session_id
    const phoneNumber = existingMessages?.message?.phone_number || 
                       existingMessages?.message?.from || 
                       sessionId;

    // Crear el mensaje en formato JSONB. Va por buildChatHistoryMessage y no a mano: la fila
    // también la lee el Postgres Chat Memory de n8n, y sin `type` LangChain rompe el agente
    // de respuestas para este contacto de forma permanente.
    const messageData = buildChatHistoryMessage({
      phone: phoneNumber,
      contenido: content.trim(),
      fecha: new Date().toISOString()
    });

    // Insertar el mensaje en la base de datos
    const { data: newMessage, error } = await supabase
      .from('chat_histories')
      .insert([
        {
          session_id: sessionId,
          message: messageData
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error al guardar mensaje:', error);
      return NextResponse.json(
        { 
          error: 'Error al guardar mensaje en la base de datos',
          message: error.message
        }, 
        { status: 500 }
      );
    }

    // Formatear la respuesta similar a Chatwoot para compatibilidad
    const formattedMessage = {
      id: newMessage.id,
      content: content.trim(),
      message_type: 1,
      created_at: newMessage.created_at,
      sender: {
        phone_number: phoneNumber,
        identifier: phoneNumber
      },
      source_id: phoneNumber,
      status: 'sent',
      private: false,
      ...messageData
    };

    console.log('✅ Mensaje guardado correctamente en la base de datos');

    return NextResponse.json({
      success: true,
      data: formattedMessage,
      message: 'Mensaje guardado correctamente',
      status: 'sent'
    });

  } catch (error) {
    console.error('Error en API de envío de mensajes:', error);
    return NextResponse.json(
      { 
        error: 'Error interno del servidor',
        message: error.message 
      }, 
      { status: 500 }
    );
  }
}
