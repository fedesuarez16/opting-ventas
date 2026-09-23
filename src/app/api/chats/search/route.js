import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ultimos10Digitos, POSTGREST_MAX_ROWS } from '@/lib/chatSessions';

const getSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing. Define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  
  return createClient(supabaseUrl, supabaseAnonKey);
};

const extractNumericPhone = (value) => {
  if (!value || typeof value !== 'string') return null;

  let normalized = value.trim();

  // Remover dominios o sufijos de JID
  if (normalized.includes('@')) {
    normalized = normalized.split('@')[0];
  }

  // Remover prefijos comunes
  normalized = normalized.replace(/^WAID:/i, '');
  normalized = normalized.replace(/^whatsapp:/i, '');

  // Mantener solo números y el signo +
  normalized = normalized.replace(/[^\d+]/g, '');

  // Remover + inicial para comparación consistente
  normalized = normalized.replace(/^\+/, '');

  return normalized.length >= 6 ? normalized : null;
};

// Función para normalizar números de teléfono
const normalizePhoneNumber = (phone) => {
  if (!phone) return '';
  
  // Remover @s.whatsapp.net si existe
  let normalized = phone.replace('@s.whatsapp.net', '');
  
  // Remover prefijos comunes
  normalized = normalized.replace(/^WAID:/, '');
  normalized = normalized.replace(/^whatsapp:/, '');
  
  // Remover todo lo que no sean números y el símbolo +
  normalized = normalized.replace(/[^\d+]/g, '');
  
  // Remover + al inicio para comparación consistente
  normalized = normalized.replace(/^\+/, '');
  
  return normalized;
};

export async function POST(request) {
  try {
    const { phoneNumbers } = await request.json();
    
    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return NextResponse.json(
        { error: 'Se requiere un array de números de teléfono' },
        { status: 400 }
      );
    }

    // Normalizar números buscados
    const normalizedSearchPhones = phoneNumbers
      .map(p => normalizePhoneNumber(p))
      .filter(Boolean);
    
    if (normalizedSearchPhones.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    console.log('🔍 Búsqueda de chats para números:', normalizedSearchPhones);

    const supabase = getSupabase();

    // Antes esto hacía `select('*')` sobre TODA la tabla sin `range()`. PostgREST
    // corta en 1000 filas cuando no se le pide un rango, y `chat_histories` tiene
    // ~55.000: el endpoint veía el 2% más nuevo (292 de 9.731 contactos) y para
    // todo el resto respondía "no encontrado". Los leads que llevan tiempo
    // esperando seguimiento son justamente los que quedan fuera de esa ventana,
    // así que abrir su chat mostraba una conversación vacía que NO estaba vacía.
    //
    // Ahora el filtro lo hace Postgres: pedimos sólo las filas del contacto
    // buscado, por sus últimos 10 dígitos. Además de correcto es más rápido,
    // porque no traemos 55.000 filas para descartar 54.995.
    const busquedas = await Promise.all(
      normalizedSearchPhones.map(async (phone) => {
        const clave = ultimos10Digitos(phone);
        if (!clave) return { phone, clave: null, filas: [], error: null };

        const { data, error } = await supabase
          .from('chat_histories')
          .select('*')
          .ilike('session_id', `%${clave}%`)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(0, POSTGREST_MAX_ROWS - 1);

        return { phone, clave, filas: data || [], error: error?.message || null };
      })
    );

    const conError = busquedas.find((b) => b.error);
    if (conError) {
      console.error('Error al obtener mensajes:', conError.error);
      return NextResponse.json(
        {
          error: 'Error al buscar chats en la base de datos',
          message: conError.error
        },
        { status: 500 }
      );
    }

    // Agrupamos por contacto (últimos 10 dígitos), NO por `session_id`: hay 24
    // contactos cuya conversación está partida entre `+549...` y `549...`, y
    // agrupar por session_id los mostraría como dos chats con la mitad de los
    // mensajes cada uno.
    const sessionsMap = new Map();

    for (const { clave, filas } of busquedas) {
      if (!clave) continue;
      for (const msg of filas) {
        // El `ilike` es una red amplia: confirmamos la identidad acá.
        if (ultimos10Digitos(msg.session_id) !== clave) continue;

        if (!sessionsMap.has(clave)) {
          sessionsMap.set(clave, {
            // `id` es el session_id del mensaje más nuevo: es el que el frontend
            // usa después para pedir los mensajes.
            id: msg.session_id,
            session_id: msg.session_id,
            last_message: msg,
            messages: []
          });
        }
        sessionsMap.get(clave).messages.push(msg);
      }
    }

    const foundChats = [];
    const noEncontrados = [];

    // La identidad ya quedó resuelta al agrupar por los últimos 10 dígitos, así
    // que acá sólo armamos el objeto que espera el frontend. Antes había tres
    // estrategias de matching encadenadas (exacto / últimos dígitos / inclusión)
    // sobre un set de números pendientes; con el filtro hecho en Postgres son
    // ruido, y la de inclusión además podía emparejar dos contactos distintos.
    for (const { clave } of busquedas) {
      if (!clave) continue;
      const session = sessionsMap.get(clave);
      if (!session) {
        noEncontrados.push(clave);
        continue;
      }

      const lastMsg = session.messages[0];
      const messageData = lastMsg.message || {};

      const phoneNumber = messageData.phone_number ||
                         messageData.from ||
                         messageData.sender?.phone_number ||
                         messageData.contact?.phone_number ||
                         null;

      const normalizedPhone =
        extractNumericPhone(phoneNumber) || extractNumericPhone(session.session_id);

      console.log(`✅ Chat encontrado: ${session.session_id} (${session.messages.length} mensajes)`);
      foundChats.push(
        createChatObject(session, lastMsg, messageData, normalizedPhone, phoneNumber)
      );
    }

    console.log(`🎯 Total de chats encontrados: ${foundChats.length}`);
    if (noEncontrados.length > 0) {
      console.log(`⚠️ Números sin conversación en chat_histories:`, noEncontrados);
    }

    return NextResponse.json({
      success: true,
      data: foundChats,
      total: foundChats.length
    });

  } catch (error) {
    console.error('❌ Error en búsqueda de chats:', error);
    return NextResponse.json(
      { error: 'Error al buscar chats', message: error.message },
      { status: 500 }
    );
  }
}

// Función auxiliar para crear objeto de chat compatible con el frontend
function createChatObject(session, lastMsg, messageData, normalizedPhone, phoneNumber) {
  // DETECTAR SI ES MENSAJE DEL SISTEMA/AGENTE O DEL CLIENTE
  const kind = messageData.type; // 'ai' | 'human' (formato n8n)
  const role = messageData.role || messageData.role_type;
  const direction = messageData.direction;
  const messageType = messageData.message_type;
  
  let isOutgoing = false;
  if (kind === 'ai') {
    isOutgoing = true;
  } else if (kind === 'human') {
    isOutgoing = false;
  } else if (messageType !== undefined && messageType !== null) {
    isOutgoing = messageType === 1;
  } else if (direction) {
    isOutgoing = direction === 'outbound' || direction === 'out';
  } else if (role) {
    isOutgoing = role === 'assistant' || role === 'ai' || role === 'system';
  } else {
    isOutgoing = false; // Por defecto, asumir que es del cliente
  }
  
  const finalMessageType = isOutgoing ? 1 : 0;
  
  return {
    id: session.session_id,
    session_id: session.session_id,
    status: messageData.status || 'open',
    last_non_activity_message: {
      id: lastMsg.id,
      content: messageData.content || messageData.text || '',
      created_at: lastMsg.created_at,
      message_type: finalMessageType,
      sender: {
        phone_number: phoneNumber,
        identifier: messageData.from || phoneNumber
      },
      source_id: messageData.source_id || messageData.from
    },
    enriched_phone_number: normalizedPhone,
    enriched_identifier: phoneNumber,
    enriched_phone_raw: phoneNumber,
    enriched_phone_candidates: phoneNumber ? [phoneNumber] : [],
    created_at: session.messages[session.messages.length - 1]?.created_at,
    updated_at: lastMsg.created_at,
    meta: {
      sender: {
        phone_number: phoneNumber,
        identifier: messageData.from || phoneNumber
      }
    },
    additional_attributes: {
      phone_number: phoneNumber,
      phone: phoneNumber
    },
    contact: {
      phone_number: phoneNumber,
      identifier: messageData.from || phoneNumber
    }
  };
}
