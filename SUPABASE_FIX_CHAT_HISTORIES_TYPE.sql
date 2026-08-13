-- Repara las filas de `chat_histories` que el CRM escribió sin el campo `type`.
--
-- CONTEXTO
-- La tabla es la memoria del agente de ventas de n8n (nodo Postgres Chat Memory, LangChain).
-- LangChain hace `switch (message.type)` y en el `default` tira:
--     NodeOperationError: Got unexpected type: undefined
-- Una sola fila sin `type` rompe el nodo. El agente muere ANTES de contestar y —como es el
-- mismo nodo el que persiste el turno— tampoco queda guardado el mensaje del cliente.
-- Efecto para ese contacto: el bot deja de responder y la conversación deja de aparecer
-- en /chat. Es permanente hasta que se repare la fila.
--
-- Las escribían así `src/lib/bulkSendQueue.ts` (envíos de plantilla, incluido el cron de
-- previo pago) y el POST de `src/app/api/chats/[id]/messages/route.js` (respuesta manual
-- desde el CRM). Los dos ya pasan por `buildChatHistoryMessage()` (`src/lib/chatHistory.ts`),
-- así que este script es para el pasivo que quedó en la base.
--
-- Todas estas filas son mensajes salientes del negocio (`direction = 'outbound'`), así que
-- el rol correcto en la memoria del agente es 'ai'.
--
-- Correr una vez. Es idempotente: la segunda corrida no matchea ninguna fila.

-- 1. Ver qué se va a tocar antes de tocarlo.
SELECT count(*) AS filas, count(DISTINCT session_id) AS contactos
FROM public.chat_histories
WHERE jsonb_typeof(message) = 'object'
  AND message->>'type' IS NULL
  AND message->>'direction' = 'outbound';

-- 2. La reparación.
UPDATE public.chat_histories
SET message = message || jsonb_build_object(
      'type', 'ai',
      'tool_calls', '[]'::jsonb,
      'invalid_tool_calls', '[]'::jsonb,
      'additional_kwargs', '{}'::jsonb,
      'response_metadata', '{}'::jsonb
    )
WHERE jsonb_typeof(message) = 'object'
  AND message->>'type' IS NULL
  AND message->>'direction' = 'outbound';

-- 3. Verificación: tiene que dar 0.
SELECT count(*) AS quedan_rotas
FROM public.chat_histories
WHERE jsonb_typeof(message) = 'object'
  AND message->>'type' IS NULL;

-- NOTA APARTE (no lo arregla este script)
-- Hay ~58 filas viejas (ids ≈ 290-300, sesiones sin `+` en el session_id) donde `message`
-- quedó guardado como STRING JSON en vez de objeto — doble encodeado. El contenido es
-- correcto y ya trae "type": "ai" adentro del string. Para LangChain también son basura,
-- pero son de otra época y de otro escritor. Si se quiere normalizar:
--
--   UPDATE public.chat_histories
--   SET message = (message #>> '{}')::jsonb
--   WHERE jsonb_typeof(message) = 'string'
--     AND (message #>> '{}') LIKE '{%';
--
-- Revisar a mano antes de correrlo.
