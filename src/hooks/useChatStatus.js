import { useState, useEffect, useCallback } from 'react';

export const useChatStatus = (phoneNumber) => {
  const [chatStatus, setChatStatus] = useState({
    isActive: false,
    lastActivity: null,
    loading: true,
    error: null
  });

  const normalizePhoneNumber = (phone) => {
    if (!phone) return '';
    // Remover todo lo que no sean números y el símbolo +
    return phone.replace(/[^\d+]/g, '');
  };

  const checkChatStatus = useCallback(async () => {
    if (!phoneNumber) {
      setChatStatus({
        isActive: false,
        lastActivity: null,
        loading: false,
        error: null
      });
      return;
    }

    setChatStatus(prev => ({ ...prev, loading: true, error: null }));

    try {
      const normalizedPhone = normalizePhoneNumber(phoneNumber);
      
      // Formatear JID para el webhook de n8n
      const jid = normalizedPhone.includes('@s.whatsapp.net') 
        ? normalizedPhone 
        : `${normalizedPhone}@s.whatsapp.net`;
      
      console.log('=== CONSULTANDO ESTADO DEL LEAD EN N8N ===');
      console.log('JID:', jid);
      console.log('Webhook URL:', 'https://mia-n8n.w9weud.easypanel.host/webhook/consultar-lead');
      
      // Crear AbortController para timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 segundos timeout
      
      try {
        // Consultar el webhook de n8n para obtener el estado del lead
        const response = await fetch('https://mia-n8n.w9weud.easypanel.host/webhook/consultar-lead', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jid: jid
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        // Verificar si la respuesta tiene contenido
        const responseText = await response.text();
      
      if (!response.ok) {
        console.error('❌ Webhook response error:', response.status, responseText);
        throw new Error(`Webhook error: ${response.status} - ${responseText || 'No response body'}`);
      }

      // Verificar si hay contenido en la respuesta
      if (!responseText || responseText.trim() === '') {
        console.warn('⚠️ Webhook returned empty response');
        setChatStatus({
          isActive: false,
          lastActivity: null,
          loading: false,
          error: null,
          chatData: null,
          source: 'n8n-webhook'
        });
        return;
      }

      // Intentar parsear JSON
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('❌ Error parsing webhook response:', parseError);
        console.error('Response text:', responseText);
        throw new Error(`Invalid JSON response from webhook: ${parseError.message}`);
      }

      console.log('✅ Respuesta del webhook n8n:', data);

      // El webhook devuelve un array, buscar el JID específico
      let leadData = null;
      
      if (Array.isArray(data)) {
        // Buscar el objeto que coincida con nuestro JID
        leadData = data.find(item => item.jid === jid);
        console.log('🔍 Buscando JID en array:', jid);
        console.log('📋 JIDs encontrados:', data.map(item => item.jid));
        console.log('✅ Datos del lead encontrado:', leadData);
      } else {
        // Si no es array, usar directamente
        leadData = data;
      }

      if (leadData) {
        // Procesar el estado del lead específico
        const isActive = leadData.estado === 'activo';
        const lastActivity = leadData.last_message_time || leadData.ultima_actividad || leadData.updated_at;
        
        let lastActivityDate = null;
        if (lastActivity) {
          lastActivityDate = new Date(lastActivity);
        }

        setChatStatus({
          isActive,
          lastActivity: lastActivityDate,
          loading: false,
          error: null,
          chatData: leadData,
          source: 'n8n-webhook'
        });

        console.log(`📊 Estado del chat procesado para ${jid}: ${isActive ? 'ACTIVO' : 'INACTIVO'}`);
      } else {
        // No se encontró el JID en la respuesta
        console.warn(`⚠️ JID ${jid} no encontrado en la respuesta del webhook`);
        setChatStatus({
          isActive: false,
          lastActivity: null,
          loading: false,
          error: null,
          chatData: null,
          source: 'n8n-webhook'
        });
      }

      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // No relanzar: marcar error en estado para que la UI no se rompa (ej. al ir al chat)
        const message = fetchError.name === 'AbortError'
          ? 'Timeout: El webhook de n8n no respondió en 10 segundos'
          : (fetchError.message || 'Error de red');
        setChatStatus({
          isActive: false,
          lastActivity: null,
          loading: false,
          error: message,
          chatData: null,
          source: 'n8n-webhook'
        });
        return;
      }

    } catch (err) {
      console.error('❌ Error consultando estado del lead en n8n:', err);
      setChatStatus({
        isActive: false,
        lastActivity: null,
        loading: false,
        error: err.message,
        chatData: null,
        source: 'n8n-webhook'
      });
    }
  }, [phoneNumber]);

  // Verificar estado del chat cuando cambia el número de teléfono
  useEffect(() => {
    checkChatStatus();
  }, [checkChatStatus]);

  // Función para refrescar manualmente el estado
  const refreshChatStatus = useCallback(() => {
    checkChatStatus();
  }, [checkChatStatus]);

  return {
    isActive: chatStatus.isActive,
    lastActivity: chatStatus.lastActivity,
    loading: chatStatus.loading,
    error: chatStatus.error,
    chatData: chatStatus.chatData,
    source: chatStatus.source,
    refreshChatStatus
  };
};
