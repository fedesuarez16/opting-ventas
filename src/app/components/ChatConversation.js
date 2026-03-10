'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useChatMessages } from '../../hooks/useChatMessages';
import { updateLead, getAllLeads, createLead, findLeadByPhone } from '../services/leadService';
import { programarSeguimiento, getSeguimientosPendientes, eliminarMensajeProgramado, eliminarTodosSeguimientosPendientes, existeSeguimientoParaLead } from '../services/mensajeService';

const ChatConversation = ({ conversation, onBack }) => {
  const { messages, loading, loadingMore, error, hasMore, refreshMessages, loadMoreMessages, sendMessage } = useChatMessages(conversation?.id);
  const messagesEndRef = useRef(null);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [lead, setLead] = useState(null);
  const [isLoadingLead, setIsLoadingLead] = useState(false);
  const [isTogglingChat, setIsTogglingChat] = useState(false);
  const [isProgramandoSeguimiento, setIsProgramandoSeguimiento] = useState(false);
  const [seguimientosCount, setSeguimientosCount] = useState(0);
  const [tieneSeguimiento, setTieneSeguimiento] = useState(false); // true si el remote_jid existe en cola_seguimientos
  const [deletingMessageId, setDeletingMessageId] = useState(null); // ID del mensaje que se está borrando
  const [isCreatingLead, setIsCreatingLead] = useState(false); // Estado para controlar si se está creando un lead
  const [phoneNumber, setPhoneNumber] = useState(null); // Guardar el número de teléfono extraído para poder crear el lead

  // Función para obtener el número de teléfono del contacto (misma lógica que ChatList.js)
  const getContactPhone = (conversation) => {
    // 0. PRIMERO: Usar session_id directamente (es el número de teléfono en chat_histories)
    if (conversation.session_id) {
      return conversation.session_id;
    }

    // 1. Usar campos enriquecidos de la API si existen
    if (conversation.enriched_phone_number) {
      return conversation.enriched_phone_number;
    }

    if (conversation.enriched_identifier) {
      return conversation.enriched_identifier;
    }

    if (conversation.enriched_phone_raw) {
      return conversation.enriched_phone_raw;
    }

    if (Array.isArray(conversation.enriched_phone_candidates)) {
      const candidate = conversation.enriched_phone_candidates.find(Boolean);
      if (candidate) return candidate;
    }

    // 2. Intentar múltiples fuentes de datos (fallback)
    const sender = conversation.last_non_activity_message?.sender;
    const contact = conversation.contact;
    
    // 3. Buscar en sender phone_number
    if (sender?.phone_number) {
      return sender.phone_number;
    }
    
    // 4. Buscar en sender identifier (puede ser JID)
    if (sender?.identifier) {
      return sender.identifier;
    }
    
    // 5. Buscar en contact phone_number
    if (contact?.phone_number) {
      return contact.phone_number;
    }
    
    // 6. Buscar en contact identifier
    if (contact?.identifier) {
      return contact.identifier;
    }
    
    // 7. Buscar en meta.sender (Chatwoot puede guardar info aquí)
    if (conversation.meta?.sender?.phone_number || conversation.meta?.sender?.phone) {
      return conversation.meta.sender.phone_number || conversation.meta.sender.phone;
    }

    if (conversation.meta?.sender?.identifier) {
      return conversation.meta.sender.identifier;
    }

    // 8. Buscar en additional_attributes
    if (conversation.additional_attributes?.phone_number || conversation.additional_attributes?.phone) {
      return conversation.additional_attributes.phone_number || conversation.additional_attributes.phone;
    }

    if (conversation.additional_attributes?.wa_id) {
      return conversation.additional_attributes.wa_id;
    }

    // 9. Buscar en source_id (formato WAID:numero)
    if (conversation.last_non_activity_message?.source_id) {
      return conversation.last_non_activity_message.source_id;
    }

    // 10. Buscar en contact_inbox
    if (conversation.contact_inbox?.source_id) {
      return conversation.contact_inbox.source_id;
    }
    
    return null;
  };

  // Cargar el lead cuando hay una conversación
  useEffect(() => {
    const loadLead = async () => {
      if (!conversation) {
        setLead(null);
        return;
      }

      setIsLoadingLead(true);
      try {
        // Obtener el número de teléfono de la conversación usando la función completa
        const phoneNumberValue = getContactPhone(conversation);
        setPhoneNumber(phoneNumberValue); // Guardar para poder crear el lead si no existe

        if (!phoneNumberValue) {
          console.log('⚠️ No se pudo extraer número de teléfono de la conversación:', conversation.id);
          setLead(null);
          return;
        }

        const allLeads = await getAllLeads();
        // Normalizar el número de teléfono para comparación (misma lógica que ChatList.js)
        // Remover @s.whatsapp.net si existe
        let normalizedPhone = phoneNumberValue.replace('@s.whatsapp.net', '').replace('@c.us', '');
        // Remover prefijos comunes
        normalizedPhone = normalizedPhone.replace(/^WAID:/, '');
        normalizedPhone = normalizedPhone.replace(/^whatsapp:/, '');
        // Remover todo lo que no sean números y el símbolo +
        normalizedPhone = normalizedPhone.replace(/[^\d+]/g, '');
        // Remover + al inicio para comparación consistente
        normalizedPhone = normalizedPhone.replace(/^\+/, '');
        
        console.log('📞 Número extraído:', phoneNumberValue);
        console.log('📞 Buscando lead con número normalizado:', normalizedPhone);
        
        let foundLead = allLeads.find(l => {
          // PRIORIZAR phone (campo real de la tabla) > whatsapp_id > telefono
          // phone puede tener el +, normalizamos ambos para comparar
          const leadPhoneRaw = l.phone || l.whatsapp_id || l.telefono || '';
          const leadPhone = String(leadPhoneRaw).replace(/[^\d]/g, '');
          const matches = leadPhone === normalizedPhone;
          if (matches) {
            console.log('✅ Lead encontrado en cache:', { id: l.id, phone: l.phone, whatsapp_id: l.whatsapp_id, estado_chat: l.estado_chat });
          }
          return matches;
        }) || null;

        // Si no se encontró en el cache, buscar directamente en la base de datos
        if (!foundLead) {
          console.log('🔍 Lead no encontrado en cache, buscando directamente en DB...');
          foundLead = await findLeadByPhone(normalizedPhone);
          if (foundLead) {
            console.log('✅ Lead encontrado en DB directamente:', { id: foundLead.id, whatsapp_id: foundLead.whatsapp_id });
          }
        }

        if (foundLead) {
          // Asegurar que estado_chat esté normalizado (0 o 1)
          // 0 o null/undefined = activo (por defecto)
          // 1 = desactivado
          const normalizedEstadoChat = (foundLead.estado_chat === 1 || foundLead.estado_chat === '1') ? 1 : 0;
          console.log(`📊 estado_chat del lead: ${foundLead.estado_chat} -> normalizado a: ${normalizedEstadoChat} (0=activo, 1=desactivado)`);
          foundLead.estado_chat = normalizedEstadoChat;
        }

        setLead(foundLead);
        if (foundLead) {
          setSeguimientosCount(foundLead.seguimientos_count || 0);
          // Verificar si el lead tiene seguimientos en la tabla
          // PRIORIZAR phone (campo real de la tabla) > whatsapp_id > telefono
          const remoteJid = foundLead.phone || foundLead.whatsapp_id || foundLead.telefono || '';
          if (remoteJid) {
            const existe = await existeSeguimientoParaLead(remoteJid);
            setTieneSeguimiento(existe);
            console.log(`📋 Lead ${remoteJid} tiene seguimiento en tabla: ${existe}`);
          } else {
            setTieneSeguimiento(false);
          }
        } else {
          setTieneSeguimiento(false);
        }
      } catch (error) {
        console.error('Error loading lead:', error);
        setLead(null);
      } finally {
        setIsLoadingLead(false);
      }
    };

    loadLead();
  }, [conversation]);

  // Función para activar/desactivar el chat
  const handleToggleChat = async () => {
    if (!lead || !lead.id) {
      console.error('❌ No hay lead o lead.id para actualizar');
      return;
    }
    
    setIsTogglingChat(true);
    try {
      // Lógica: 0 o null/undefined = activo (por defecto), 1 = desactivado
      const currentEstadoChat = (lead.estado_chat === 1 || lead.estado_chat === '1') ? 1 : 0;
      // Si está activo (0), cambiar a desactivado (1). Si está desactivado (1), cambiar a activo (0)
      const newEstadoChat = currentEstadoChat === 0 ? 1 : 0;
      
      console.log(`🔄 Cambiando estado_chat de ${currentEstadoChat} (${currentEstadoChat === 0 ? 'activo' : 'desactivado'}) a ${newEstadoChat} (${newEstadoChat === 0 ? 'activo' : 'desactivado'}) para lead ID: ${lead.id}`);
      console.log(`📋 Lead completo antes de actualizar:`, lead);
      
      // Asegurar que el ID sea string
      const leadId = String(lead.id);
      const updatedLead = await updateLead(leadId, { estado_chat: newEstadoChat });
      
      if (updatedLead) {
        console.log(`✅ Lead actualizado exitosamente:`, updatedLead);
        console.log(`✅ estado_chat en lead actualizado:`, updatedLead.estado_chat);
        // Normalizar estado_chat: 0 o null/undefined = activo, 1 = desactivado
        const normalizedEstadoChat = (updatedLead.estado_chat === 1 || updatedLead.estado_chat === '1') ? 1 : 0;
        updatedLead.estado_chat = normalizedEstadoChat;
        console.log(`✅ estado_chat normalizado a: ${normalizedEstadoChat} (0=activo, 1=desactivado)`);
        // Actualizar el estado local con el lead actualizado
        setLead(updatedLead);
        console.log(`✅ Chat ${newEstadoChat === 0 ? 'activado' : 'desactivado'} exitosamente`);
      } else {
        console.error('❌ updateLead retornó null o undefined');
        console.error('❌ Intentando recargar lead desde DB...');
        
        // Recargar todos los leads y buscar el correcto por whatsapp_id
        const allLeads = await getAllLeads();
        const phoneNumber = getContactPhone(conversation);
        
        console.log('📞 Número de teléfono encontrado:', phoneNumber);
        
        if (phoneNumber) {
          // Normalizar: misma lógica que arriba
          let normalizedPhone = phoneNumber.replace('@s.whatsapp.net', '').replace('@c.us', '');
          normalizedPhone = normalizedPhone.replace(/^WAID:/, '');
          normalizedPhone = normalizedPhone.replace(/^whatsapp:/, '');
          normalizedPhone = normalizedPhone.replace(/[^\d+]/g, '');
          normalizedPhone = normalizedPhone.replace(/^\+/, '');
          console.log('📞 Número normalizado:', normalizedPhone);
          
          let foundLead = allLeads.find(l => {
            // PRIORIZAR phone (campo real de la tabla) > whatsapp_id > telefono
            const leadPhoneRaw = l.phone || l.whatsapp_id || l.telefono || '';
            const leadPhone = String(leadPhoneRaw).replace(/[^\d]/g, '');
            return leadPhone === normalizedPhone;
          });
          
          // Fallback: buscar directamente en DB
          if (!foundLead) {
            foundLead = await findLeadByPhone(normalizedPhone);
          }
          
          if (foundLead) {
            console.log('✅ Lead encontrado y recargado desde DB:', foundLead);
            console.log('✅ estado_chat del lead recargado:', foundLead.estado_chat);
            // Normalizar estado_chat: 0 o null/undefined = activo, 1 = desactivado
            const normalizedEstadoChat = (foundLead.estado_chat === 1 || foundLead.estado_chat === '1') ? 1 : 0;
            foundLead.estado_chat = normalizedEstadoChat;
            console.log(`✅ estado_chat normalizado a: ${normalizedEstadoChat} (0=activo, 1=desactivado)`);
            setLead(foundLead);
          } else {
            console.error('❌ No se encontró el lead con el número:', normalizedPhone);
            console.error('❌ Leads disponibles:', allLeads.map(l => ({ id: l.id, whatsapp_id: l.whatsapp_id })));
          }
        }
        alert('Error al actualizar el estado del chat. Por favor, intenta de nuevo.');
      }
    } catch (error) {
      console.error('❌ Error toggling chat:', error);
      alert('Error al actualizar el estado del chat. Por favor, intenta de nuevo.');
    } finally {
      setIsTogglingChat(false);
    }
  };

  // Función para programar o desactivar un seguimiento
  const handleProgramarSeguimiento = async () => {
    if (!lead) return;
    
    // PRIORIZAR phone (campo real de la tabla) > whatsapp_id > telefono
    const remoteJid = lead.phone || lead.whatsapp_id || lead.telefono || '';
    
    if (!remoteJid) {
      alert('❌ No se encontró un número de teléfono válido para este lead');
      return;
    }
    
    setIsProgramandoSeguimiento(true);
    
    try {
      if (tieneSeguimiento) {
        // DESACTIVAR: Eliminar TODOS los seguimientos del lead de la tabla
        console.log(`🗑️ Desactivando seguimientos para ${remoteJid}...`);
        const success = await eliminarTodosSeguimientosPendientes(remoteJid);
        
        if (success) {
          setTieneSeguimiento(false);
          console.log(`✅ Seguimientos eliminados para ${remoteJid}`);
        } else {
          alert('❌ Error al desactivar los seguimientos. Intenta nuevamente.');
        }
      } else {
        // ACTIVAR: Programar un nuevo seguimiento
        console.log(`➕ Activando seguimiento para ${remoteJid}...`);
      const seguimientoData = {
        remote_jid: remoteJid,
        tipo_lead: lead.estado || null,
        seguimientos_count: (seguimientosCount || 0) + 1
      };
      
      // Agregar fecha_ultima_interaccion si existe
      if (lead.ultima_interaccion) {
        seguimientoData.fecha_ultima_interaccion = lead.ultima_interaccion;
      } else if (lead.fechaContacto) {
        seguimientoData.fecha_ultima_interaccion = lead.fechaContacto;
      }
      
      // Agregar chatwoot_conversation_id si existe
      if (conversation?.id) {
        seguimientoData.chatwoot_conversation_id = conversation.id;
      }
      
        const result = await programarSeguimiento(seguimientoData);

        if (result.success) {
          setTieneSeguimiento(true);

          if (!result.actualizado) {
            // Solo incrementar el contador si se creó un nuevo seguimiento
        const newCount = (seguimientosCount || 0) + 1;
        setSeguimientosCount(newCount);
        const updatedLead = await updateLead(lead.id, { seguimientos_count: newCount });
        if (updatedLead) {
          setLead(updatedLead);
        }
          }
          console.log(`✅ Seguimiento activado para ${remoteJid}`);
      } else {
        alert('❌ Error al programar el seguimiento. Intenta nuevamente.');
        }
      }
    } catch (error) {
      console.error('Error en handleProgramarSeguimiento:', error);
      alert('❌ Error al procesar el seguimiento. Intenta nuevamente.');
    } finally {
      setIsProgramandoSeguimiento(false);
    }
  };

  // Función para crear un lead en la base de datos
  const handleCreateLead = async () => {
    if (!phoneNumber || !conversation) {
      alert('❌ No se puede crear el lead: falta información del contacto');
      return;
    }

    setIsCreatingLead(true);
    try {
      // Normalizar el número de teléfono
      let normalizedPhone = phoneNumber.replace('@s.whatsapp.net', '').replace('@c.us', '');
      normalizedPhone = normalizedPhone.replace(/^WAID:/, '');
      normalizedPhone = normalizedPhone.replace(/^whatsapp:/, '');
      normalizedPhone = normalizedPhone.replace(/[^\d+]/g, '');
      normalizedPhone = normalizedPhone.replace(/^\+/, '');

      // Obtener el nombre del contacto si está disponible
      const contactName = getContactName(conversation);

      // Preparar datos del lead usando los campos REALES de la tabla leads
      // Campos reales: phone, phone_from, nombre, mensaje_inicial, wamid, waba_id, 
      // tipo_mensaje, timestamp_mensaje, dentro_horario, estado
      const leadData = {
        phone: normalizedPhone.startsWith('+') ? normalizedPhone : `+${normalizedPhone}`, // phone debe tener el + y es requerido
        nombre: contactName || null,
        estado: 'frio', // Estado inicial (default en la tabla, sin tilde)
        timestamp_mensaje: new Date().toISOString(),
        // Campos opcionales que podemos obtener de la conversación si están disponibles
        phone_from: conversation?.contact_inbox?.source_id || conversation?.meta?.sender?.phone_number || null,
        mensaje_inicial: conversation?.last_non_activity_message?.content || null,
      };

      console.log('➕ Creando lead con datos:', leadData);

      const newLead = await createLead(leadData);

      if (newLead) {
        console.log('✅ Lead creado exitosamente:', newLead);
        // Actualizar el estado local con el nuevo lead
        setLead(newLead);
        setTieneSeguimiento(false); // Inicialmente no tiene seguimientos
        setSeguimientosCount(0);
      } else {
        alert('❌ Error al crear el lead. Por favor, intenta de nuevo.');
      }
    } catch (error) {
      console.error('❌ Error creando lead:', error);
      alert('❌ Error al crear el lead. Por favor, intenta de nuevo.');
    } finally {
      setIsCreatingLead(false);
    }
  };

  // Scroll al final cuando se cargan nuevos mensajes
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      let date;
      
      // Si es un número, puede ser timestamp en segundos o milisegundos
      if (typeof timestamp === 'number') {
        date = new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000);
      } 
      // Si es un string, intentar parsearlo directamente
      else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } 
      // Si es un objeto Date, usarlo directamente
      else if (timestamp instanceof Date) {
        date = timestamp;
      }
      // Si no, intentar convertirlo
      else {
        date = new Date(timestamp);
      }
      
      // Validar que la fecha sea válida
      if (isNaN(date.getTime())) {
        console.warn('Invalid date value for time:', timestamp);
        return '';
      }
      
      return new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit'
      }).format(date);
    } catch (error) {
      console.error('Error formatting time:', error, 'timestamp:', timestamp);
      return '';
    }
  };

  const formatMessageDate = (timestamp) => {
    if (!timestamp) return '';
    
    try {
      let date;
      
      // Si es un número, puede ser timestamp en segundos o milisegundos
      if (typeof timestamp === 'number') {
        date = new Date(timestamp > 1000000000000 ? timestamp : timestamp * 1000);
      } 
      // Si es un string, intentar parsearlo directamente
      else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
      } 
      // Si es un objeto Date, usarlo directamente
      else if (timestamp instanceof Date) {
        date = timestamp;
      }
      // Si no, intentar convertirlo
      else {
        date = new Date(timestamp);
      }
      
      // Validar que la fecha sea válida
      if (isNaN(date.getTime())) {
        console.warn('Invalid date value:', timestamp);
        return '';
      }
      
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return 'Hoy';
      } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Ayer';
      } else {
        return new Intl.DateTimeFormat('es-AR', {
          day: 'numeric',
          month: 'short',
          year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
        }).format(date);
      }
    } catch (error) {
      console.error('Error formatting date:', error, 'timestamp:', timestamp);
      return '';
    }
  };

  // Función para obtener el nombre del contacto
  const getContactName = (conversation) => {
    const sender = conversation.last_non_activity_message?.sender;
    const contact = conversation.contact;
    
    // Buscar nombre en sender (filtrar nombres genéricos o incorrectos)
    if (sender?.name && 
        sender.name.trim() !== '' && 
        !sender.name.toLowerCase().includes('federico') &&
        !sender.name.toLowerCase().includes('suarez') &&
        sender.name.trim().length > 2) {
      return sender.name.trim();
    }
    
    // Buscar nombre en contact
    if (contact?.name && 
        contact.name.trim() !== '' && 
        !contact.name.toLowerCase().includes('federico') &&
        !contact.name.toLowerCase().includes('suarez') &&
        contact.name.trim().length > 2) {
      return contact.name.trim();
    }
    
    // Buscar en meta.sender
    if (conversation.meta?.sender?.name && 
        conversation.meta.sender.name.trim() !== '' &&
        conversation.meta.sender.name.trim().length > 2) {
      return conversation.meta.sender.name.trim();
    }
    
    return null;
  };

  // Función para obtener el nombre o número del contacto (para compatibilidad)
  const getContactInfo = (conversation) => {
    const name = getContactName(conversation);
    const phone = getContactPhone(conversation);
    
    // Si hay nombre, mostrar nombre
    if (name) {
      return name;
    }
    
    // Si hay teléfono, mostrar teléfono
    if (phone) {
      return phone;
    }
    
    // Último recurso
    return `Chat ${conversation.id}`;
  };

  const isOutgoing = (message) => {
    // Verificar múltiples formas de determinar si es un mensaje saliente (del sistema/IA)
    // 1. type === 'ai' | 'human' (formato n8n Postgres Chat Memory)
    if (message.type === 'ai') return true;
    if (message.type === 'human') return false;
    
    // 2. sender_type === 'User' / 'Contact'
    if (message.sender_type === 'User') return true;
    if (message.sender_type === 'Contact') return false;
    
    // 3. message_type === 1 (1 = outgoing/sistema, 0 = incoming/cliente)
    if (message.message_type === 1) return true;
    if (message.message_type === 0) return false;
    
    // 4. direction === 'outbound' o 'out' (saliente)
    if (message.direction === 'outbound' || message.direction === 'out') return true;
    if (message.direction === 'inbound' || message.direction === 'in') return false;
    
    // 5. role === 'assistant' o 'ai' (mensaje del agente/sistema)
    if (message.role === 'assistant' || message.role === 'ai' || message.role === 'system') return true;
    if (message.role === 'user' || message.role === 'human') return false;
    
    // 6. Sin información clara, asumir que es del cliente (entrante)
    return false;
  };

  // Función para borrar un mensaje
  const deleteMessage = async (messageId) => {
    if (!conversation?.id || !messageId) {
      console.error('No se puede borrar: falta conversationId o messageId');
      return;
    }

    // Confirmar antes de borrar
    if (!confirm('¿Estás seguro de que quieres borrar este mensaje? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeletingMessageId(messageId);
    
    try {
      const response = await fetch(`/api/chats/${conversation.id}/messages/${messageId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      if (data.success) {
        // Refrescar mensajes después de borrar para que desaparezca de la lista
        await refreshMessages();
        console.log('✅ Mensaje borrado exitosamente');
      } else {
        throw new Error(data.error || 'Failed to delete message');
      }
    } catch (err) {
      console.error('Error deleting message:', err);
      alert('Error al borrar el mensaje. Por favor, intenta de nuevo.');
    } finally {
      setDeletingMessageId(null);
    }
  };

  const groupMessagesByDate = (messages) => {
    // Primero ordenar los mensajes por fecha ascendente (más antiguos primero)
    const sortedMessages = [...messages].sort((a, b) => {
      const dateA = new Date(a.created_at);
      const dateB = new Date(b.created_at);
      return dateA.getTime() - dateB.getTime();
    });
    
    // Luego agrupar por fecha
    const grouped = {};
    sortedMessages.forEach(message => {
      const date = formatMessageDate(message.created_at);
      if (!grouped[date]) {
        grouped[date] = [];
      }
      grouped[date].push(message);
    });
    
    // Asegurar que los mensajes dentro de cada grupo también estén ordenados
    Object.keys(grouped).forEach(date => {
      grouped[date].sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return dateA.getTime() - dateB.getTime();
      });
    });
    
    return grouped;
  };

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 h-full">
        <div className="text-center">
          <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <p className="text-gray-500 text-lg font-medium">Selecciona una conversación</p>
          <p className="text-gray-400 text-sm mt-1">Elige un chat de la lista para ver los mensajes</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Header del chat */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center">
        <button
          onClick={onBack}
          className="lg:hidden mr-3 p-1 hover:bg-gray-200 rounded-full"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        
        <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center mr-3">
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
          </svg>
        </div>
        
        <div className="flex-1">
          {(() => {
            const name = getContactName(conversation);
            const phone = getContactPhone(conversation);
            
            if (name && phone) {
              // Mostrar nombre y número
              return (
                <>
                  <h3 className="font-medium text-gray-900">{name}</h3>
                  <p className="text-sm text-gray-500">{phone}</p>
                </>
              );
            } else if (name) {
              // Solo nombre
              return (
                <h3 className="font-medium text-gray-900">{name}</h3>
              );
            } else if (phone) {
              // Solo número
              return (
                <h3 className="font-medium text-gray-900">{phone}</h3>
              );
            } else {
              // Fallback
              return (
                <>
                  <h3 className="font-medium text-gray-900">{getContactInfo(conversation)}</h3>
                  <p className="text-sm text-gray-500">Chat #{conversation.id}</p>
                </>
              );
            }
          })()}
        </div>

        <button
          onClick={refreshMessages}
          disabled={loading}
          className="p-2 hover:bg-gray-200 rounded-full disabled:opacity-50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {loading && messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4"></div>
              <p className="text-gray-500">Cargando mensajes...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="w-12 h-12 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-red-600 font-medium">Error al cargar mensajes</p>
              <p className="text-gray-500 text-sm mt-1">{error}</p>
              <button 
                onClick={refreshMessages}
                className="mt-2 text-sm text-green-600 hover:text-green-800 font-medium"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <svg className="w-12 h-12 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-gray-500">No hay mensajes en esta conversación</p>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {/* Botón para cargar más mensajes antiguos */}
            {hasMore && (
              <div className="flex justify-center py-2">
                <button
                  onClick={loadMoreMessages}
                  disabled={loadingMore}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                    loadingMore
                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-300 shadow-sm'
                  }`}
                >
                  {loadingMore ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                      <span>Cargando mensajes antiguos...</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                      <span>Cargar mensajes antiguos</span>
                    </>
                  )}
                </button>
              </div>
            )}
            {Object.entries(groupMessagesByDate(
              // Filtrar mensajes borrados también en el componente por si acaso
              // NOTA: No filtramos mensajes privados (msg.private === true) porque pueden ser mensajes
              // enviados por workflows de n8n que queremos mostrar
              messages.filter(msg => {
                const content = (msg.content || '').toLowerCase();
                return !(
                  content.includes('this message was deleted') ||
                  content.includes('mensaje eliminado') ||
                  content.includes('message was deleted') ||
                  msg.content_attributes?.deleted === true ||
                  msg.deleted === true ||
                  msg.status === 'deleted'
                );
              })
            )).map(([date, dateMessages]) => (
              <div key={date}>
                {/* Separador de fecha */}
                <div className="flex justify-center my-4">
                  <span className="bg-white px-3 py-1 rounded-full text-xs text-gray-500 shadow-sm">
                    {date}
                  </span>
                </div>
                
                {/* Mensajes de ese día */}
                {dateMessages.map((message) => {
                  // Verificar si el mensaje tiene un attachment de audio
                  // Chatwoot puede marcar audio de diferentes formas:
                  // - message_type: 3 (audio)
                  // - content_type: 'audio', 'audio/ogg', 'audio/mpeg', etc.
                  // - attachments con file_type: 'audio', 'voice'
                  // - attachments con content_type que empiece con 'audio/'
                  const hasAudio = 
                    message.message_type === 3 || // Tipo 3 = audio en Chatwoot
                    message.content_type === 'audio' ||
                    (message.content_type && message.content_type.startsWith('audio/')) ||
                    (message.attachments && message.attachments.some(att => 
                      att.file_type === 'audio' || 
                      att.file_type === 'voice' ||
                      (att.content_type && att.content_type.startsWith('audio/'))
                    ));
                  
                  const audioAttachment = hasAudio && message.attachments 
                    ? message.attachments.find(att => 
                        att.file_type === 'audio' || 
                        att.file_type === 'voice' ||
                        (att.content_type && att.content_type.startsWith('audio/'))
                      ) || message.attachments[0]
                    : null;
                  
                  // Obtener URL del audio (puede estar en diferentes lugares según Chatwoot)
                  // Chatwoot puede usar: data_url, url, file_url, download_url
                  let audioUrl = null;
                  if (audioAttachment) {
                    audioUrl = audioAttachment.data_url || 
                              audioAttachment.url || 
                              audioAttachment.file_url ||
                              audioAttachment.download_url ||
                              audioAttachment.public_url;
                  }
                  
                  // Si no hay URL en el attachment, verificar si hay una URL directa en el mensaje
                  if (!audioUrl && message.data_url) {
                    audioUrl = message.data_url;
                  }
                  
                  // Si no hay URL en el attachment, intentar construirla desde el ID
                  // Formato típico: /api/v1/accounts/{account_id}/conversations/{conversation_id}/messages/{message_id}/attachments/{attachment_id}
                  if (!audioUrl && audioAttachment?.id && conversation?.id && message.id) {
                    // Intentar construir URL relativa (se resolverá con el proxy de Next.js)
                    audioUrl = `/api/chats/${conversation.id}/messages/${message.id}/attachments/${audioAttachment.id}`;
                  }
                  
                  // Si aún no hay URL pero hay attachments, usar el primero
                  if (!audioUrl && message.attachments && message.attachments.length > 0) {
                    const firstAtt = message.attachments[0];
                    audioUrl = firstAtt.data_url || 
                              firstAtt.url || 
                              firstAtt.file_url ||
                              firstAtt.download_url ||
                              firstAtt.public_url;
                  }
                  
                  // Obtener el tipo de contenido del audio
                  const audioContentType = audioAttachment?.content_type || 
                                         message.content_type || 
                                         'audio/ogg; codecs=opus'; // WhatsApp usa OGG Opus por defecto
                  
                  const isDeleting = deletingMessageId === message.id;
                  
                  const outgoing = isOutgoing(message);
                  
                  return (
                  <div
                    key={message.id}
                    className={`flex ${outgoing ? 'justify-end' : 'justify-start'} mb-2`}
                      onDoubleClick={() => {
                        // Solo permitir borrar con doble click
                        if (!isDeleting) {
                          deleteMessage(message.id);
                        }
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Doble click para borrar este mensaje"
                  >
                    <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg transition-opacity ${
                          isDeleting ? 'opacity-50' : ''
                        } ${
                        outgoing
                          ? 'bg-green-500 text-white rounded-br-sm'
                          : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                      }`}
                    >
                        {/* Mostrar reproductor de audio si hay audio */}
                        {hasAudio && audioUrl ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <audio 
                                controls 
                                className="flex-1 min-w-[200px] h-8"
                                style={{
                                  maxWidth: '100%',
                                  outline: 'none'
                                }}
                                preload="metadata"
                              >
                                <source src={audioUrl} type={audioContentType} />
                                <source src={audioUrl} type="audio/mpeg" />
                                <source src={audioUrl} type="audio/ogg" />
                                <source src={audioUrl} type="audio/wav" />
                                <source src={audioUrl} type="audio/mp4" />
                                Tu navegador no soporta el elemento de audio.
                              </audio>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              {audioAttachment?.file_size && (
                                <span className={`text-xs ${
                                  isOutgoing(message) ? 'text-green-100' : 'text-gray-500'
                                }`}>
                                  {(audioAttachment.file_size / 1024).toFixed(1)} KB
                                </span>
                              )}
                              {audioAttachment?.duration && (
                                <span className={`text-xs ${
                                  isOutgoing(message) ? 'text-green-100' : 'text-gray-500'
                                }`}>
                                  {Math.floor(audioAttachment.duration / 1000)}s
                                </span>
                              )}
                            </div>
                            {/* Mostrar contenido de texto si existe (puede ser una descripción) */}
                            {message.content && message.content.trim() && (
                              <p className="text-xs italic mt-1 opacity-75">{message.content}</p>
                            )}
                          </div>
                        ) : (
                          /* Mostrar contenido de texto normal */
                          message.content && message.content.trim() && (
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                          )
                        )}
                        
                      <p className={`text-xs mt-1 flex items-center gap-1 ${
                        outgoing ? 'text-green-100' : 'text-gray-500'
                      }`}>
                        {formatMessageTime(message.created_at)}
                        {outgoing && (
                          <svg className="inline w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                          </svg>
                        )}
                        {!outgoing && (
                          <span className="text-[10px] opacity-75 ml-1">(Cliente)</span>
                        )}
                      </p>
                    </div>
                  </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Área de entrada de mensaje - Estilo similar a Chatwoot */}
      <div className="bg-white border-t border-gray-200">
        <form 
          onSubmit={async (e) => {
            e.preventDefault();
            if (!inputValue.trim() || sending || !conversation) return;
            
            const messageContent = inputValue.trim();
            setInputValue('');
            setSending(true);
            
            try {
              await sendMessage(messageContent);
            } catch (err) {
              console.error('Error al enviar mensaje:', err);
              // Restaurar el mensaje si falla
              setInputValue(messageContent);
              alert('Error al enviar el mensaje. Por favor, intenta de nuevo.');
            } finally {
              setSending(false);
            }
          }}
          className="flex flex-col"
        >
          {/* Área de texto grande */}
          <div className="px-4 pt-3 pb-3">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (inputValue.trim() && !sending && conversation) {
                    const messageContent = inputValue.trim();
                    setInputValue('');
                    setSending(true);
                    sendMessage(messageContent).catch((err) => {
                      console.error('Error al enviar mensaje:', err);
                      setInputValue(messageContent);
                      alert('Error al enviar el mensaje. Por favor, intenta de nuevo.');
                    }).finally(() => {
                      setSending(false);
                    });
                  }
                }
              }}
              placeholder="Shift + enter for new line. Start with '/' to select a Canned Response."
              className="w-full min-h-[120px] max-h-[300px] px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              disabled={sending || !conversation}
            />
          </div>

          {/* Barra de acciones inferior */}
          <div className="px-4 pb-3 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            {/* Botones de acciones del lead */}
            {lead && (
              <>
                {/* Botón de activar/desactivar chat del lead */}
                {/* Lógica: 0 o null/undefined = activo (por defecto), 1 = desactivado */}
                <button
                  type="button"
                  onClick={handleToggleChat}
                  disabled={isTogglingChat || isLoadingLead}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm ${
                    (lead.estado_chat === 0 || lead.estado_chat === null || lead.estado_chat === undefined)
                      ? 'bg-green-500 text-white hover:bg-green-600 border border-green-600'
                      : 'bg-red-500 text-white hover:bg-red-600 border border-red-600'
                  } ${isTogglingChat || isLoadingLead ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={(lead.estado_chat === 0 || lead.estado_chat === null || lead.estado_chat === undefined) ? 'Click para desactivar el chat' : 'Click para activar el chat'}
                >
                  {isTogglingChat ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                      <span>Procesando...</span>
                    </>
                  ) : (
                    <>
                      {(lead.estado_chat === 0 || lead.estado_chat === null || lead.estado_chat === undefined) ? (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                          <span>Chat Activo</span>
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                          <span>Chat Inactivo</span>
                        </>
                      )}
                    </>
                  )}
                </button>

                {/* Botón para activar/desactivar seguimiento */}
                <button
                  type="button"
                  onClick={handleProgramarSeguimiento}
                  disabled={isProgramandoSeguimiento || isLoadingLead || !lead}
                  className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors shadow-sm ${
                    tieneSeguimiento
                      ? 'bg-red-100 text-red-800 hover:bg-red-200 border border-red-300'
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200 border border-blue-300'
                  } ${isProgramandoSeguimiento || isLoadingLead ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={tieneSeguimiento ? 'Desactivar seguimiento (elimina de la tabla)' : 'Activar seguimiento (programa para dentro de 23 horas)'}
                >
                  {isProgramandoSeguimiento ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current"></div>
                  ) : tieneSeguimiento ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      <span className="hidden sm:inline">Desactivar</span>
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      <span className="hidden sm:inline">Activar</span>
                    </>
                  )}
                </button>
              </>
            )}

            {/* Botón para agregar lead a la base de datos si no existe */}
            {!lead && phoneNumber && !isLoadingLead && (
              <button
                type="button"
                onClick={handleCreateLead}
                disabled={isCreatingLead}
                className={`inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shadow-sm ${
                  isCreatingLead
                    ? 'bg-gray-400 text-white cursor-not-allowed'
                    : 'bg-purple-500 text-white hover:bg-purple-600 border border-purple-600'
                }`}
                title="Agregar este contacto a la base de datos de leads"
              >
                {isCreatingLead ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    <span>Agregando...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Agregar a base de datos</span>
                  </>
                )}
              </button>
            )}

            {/* Send Button */}
            <button
              type="submit"
              disabled={!inputValue.trim() || sending || !conversation}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                !inputValue.trim() || sending || !conversation
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {sending ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              ) : (
                <>
                  <span>Send</span>
                  <span className="text-xs opacity-75">⌘ + ←</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatConversation;
