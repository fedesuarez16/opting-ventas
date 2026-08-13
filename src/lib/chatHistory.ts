/**
 * Shape de `public.chat_histories.message`.
 *
 * La tabla la comparten DOS lectores con expectativas distintas y toda fila que escribamos
 * tiene que servirle a los dos:
 *
 * 1. El nodo **Postgres Chat Memory** de n8n (LangChain) lee todas las filas de la sesión
 *    como historial del agente de ventas. LangChain hace `switch (message.type)` y en el
 *    `default` tira `Got unexpected type: undefined`. Una sola fila sin `type` rompe el nodo:
 *    el agente muere ANTES de contestar y —como es el mismo nodo el que persiste el turno—
 *    tampoco queda guardado el mensaje del cliente. Resultado: para ese contacto el bot deja
 *    de responder y la conversación deja de aparecer en `/chat`, de forma permanente.
 *    Por eso `type` no es opcional. El resto de los campos LangChain replican el shape plano
 *    que escribe el propio nodo, para que nuestras filas y las suyas sean indistinguibles.
 *
 * 2. `/api/chats/**` (el `/chat` del CRM) lee `content`/`text` y decide entrante vs saliente
 *    mirando `type` primero, con `message_type`/`direction` como fallback.
 *
 * Cualquier código que inserte en `chat_histories` tiene que pasar por acá.
 */

export interface ChatHistoryMessage {
  type: 'ai' | 'human';
  content: string;
  tool_calls: unknown[];
  invalid_tool_calls: unknown[];
  additional_kwargs: Record<string, unknown>;
  response_metadata: Record<string, unknown>;
  text: string;
  message_type: 0 | 1;
  direction: 'inbound' | 'outbound';
  phone_number: string;
  from: string;
  status: string;
  created_at: string;
}

/**
 * Arma el `message` de una fila de `chat_histories`. Función pura.
 *
 * `type: 'ai'` cubre tanto la respuesta del bot como el mensaje que un humano manda desde el
 * CRM: para el agente los dos son "lo último que dijo el negocio", que es exactamente el rol
 * que tienen que ocupar en su memoria.
 */
export function buildChatHistoryMessage({
  phone,
  contenido,
  fecha,
  type = 'ai',
}: {
  phone: string;
  contenido: string;
  fecha: string;
  type?: 'ai' | 'human';
}): ChatHistoryMessage {
  const esSaliente = type === 'ai';
  return {
    // Lo que necesita LangChain (Postgres Chat Memory de n8n).
    type,
    content: contenido,
    tool_calls: [],
    invalid_tool_calls: [],
    additional_kwargs: {},
    response_metadata: {},
    // Lo que necesita /chat del CRM.
    text: contenido,
    message_type: esSaliente ? 1 : 0,
    direction: esSaliente ? 'outbound' : 'inbound',
    phone_number: phone,
    from: phone,
    status: 'sent',
    created_at: fecha,
  };
}
