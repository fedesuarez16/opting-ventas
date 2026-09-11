# Patch: responder a audios pidiendo texto — `Opting - Agente Ventas`

> **✅ DEPLOYADO** — 2026-08-20, `versionId 4b248e7b-9b31-40ba-ba8e-7b97dac3623c`.
> 54 nodos, workflow `active`. `n8n_validate_workflow` → `valid: true`, 0 errores,
> 56 conexiones válidas. Este doc queda como referencia de qué se cambió y por qué.

Workflow: `PxrfRFfaX-QGTqBlh2992` (live en `mia-n8n.w9weud.easypanel.host`)

## El problema real

Hoy un audio entra por el webhook con `whatsappMsg.text?.body === undefined`, así que
`Parsear Mensaje` arma `messageBody = ''`. Ese vacío se guarda en `message_buffer`, y
`Verificar y Concatenar` lo descarta con `.filter(Boolean)`.

Resultado: **el RAG Agent recibe un prompt vacío** y responde cualquier cosa.
No es un problema de prompt — es un problema de ruteo.

## La solución

Interceptar ANTES del agente, con una respuesta determinística. Nada de pedirle al LLM
que "se dé cuenta" de que era un audio.

Flujo nuevo (rama viva: la de `If2` → `RAG Agent1`):

```
Preparar para Flujo → If2 → Es Audio? ─true→  Preparar Aviso Audio → Enviar Aviso Audio YCloud
                                     └false→ If → RAG Agent1 → ... (sin cambios)
```

Regla: si en el batch de 10s entró **al menos un audio**, se manda el aviso fijo y se
saltea el agente. El buffer ya deduplica, así que 3 audios seguidos = 1 sola respuesta.

Se ataca `audio`, `voice` y `ptt`. Imágenes/documentos/stickers quedan fuera de scope.

**El aviso NO pasa por `chat_histories`** (no toca el Postgres Chat Memory), así que no
hay riesgo de meter una fila sin `message.type` y matar al agente.

---

## 1. `Parsear Mensaje` — reemplazar `jsCode`

```js
// ── 1. EXTRAER DATOS DEL MENSAJE YCLOUD ──────────────────────────────────────
const body = $input.item.json.body;
const whatsappMsg = body.whatsappInboundMessage;

const messageId    = whatsappMsg.id;
const wamid        = whatsappMsg.wamid;
const from         = whatsappMsg.from;
const to           = whatsappMsg.to;
const customerName = whatsappMsg.customerProfile?.name || 'Cliente';
const messageType  = whatsappMsg.type;
const textoPlano   = whatsappMsg.text?.body || '';
const timestamp = new Date(whatsappMsg.sendTime).toISOString();
const wabaId       = whatsappMsg.wabaId;
const eventType    = body.type;
const eventId      = body.id;

// ── 1.b DETECTAR AUDIOS ──────────────────────────────────────────────────────
// Los audios llegan sin texto. Si dejamos messageBody vacio, el buffer lo
// descarta y el agente termina recibiendo un prompt vacio. Marcamos con un
// token para que sobreviva el buffer y se pueda rutear antes del agente.
const AUDIO_TOKEN = '[[AUDIO]]';
const TIPOS_AUDIO = ['audio', 'voice', 'ptt'];
const esAudio = TIPOS_AUDIO.includes(String(messageType || '').toLowerCase());

const messageBody = esAudio && !textoPlano ? AUDIO_TOKEN : textoPlano;

// ── 2. CALCULAR HORARIO DE ATENCIÓN (Argentina UTC-3) ────────────────────────
const fecha = typeof timestamp === 'number'
  ? new Date(timestamp)
  : new Date(timestamp);

const offsetArg  = -3;
const horaArg    = new Date(fecha.getTime() + offsetArg * 60 * 60 * 1000);

const hora       = horaArg.getUTCHours();
const minutos    = horaArg.getUTCMinutes();
const dia        = horaArg.getUTCDay(); // 0 = domingo, 6 = sábado

const horaDecimal    = hora + minutos / 60;
const esDomingo      = dia === 0;
const dentroDeHorario = !esDomingo && horaDecimal >= 9 && horaDecimal < 18;

// ── 3. FILTRAR MENSAJES VIEJOS ────────────────────────────────────────────────
const ahora      = Date.now();
const mensajeMs  = typeof timestamp === 'number'
  ? timestamp
  : new Date(timestamp).getTime();

const diferenciaMinutos = (ahora - mensajeMs) / 1000 / 60;
const esMensajeReciente = diferenciaMinutos <= 1;

// ── 4. RETORNAR TODO JUNTO ────────────────────────────────────────────────────
return {
  messageId,
  wamid,
  from,
  to,
  customerName,
  messageType,
  messageBody,
  esAudio,
  timestamp,
  wabaId,
  eventType,
  eventId,
  dentroDeHorario,
  esMensajeReciente
};
```

## 2. `Verificar y Concatenar` — reemplazar `jsCode`

```js
const AUDIO_TOKEN = '[[AUDIO]]';

const mensajes = $input.all().map(i => i.json);
const miBatchId = $('Generar Batch ID').item.json.batchId;

if (mensajes.length === 0) {
  return { continuar: false, mensajeCombinado: '', huboAudio: false };
}

const ultimoMensaje = mensajes[mensajes.length - 1];
const soyElUltimo = ultimoMensaje.batch_id === miBatchId;

if (!soyElUltimo) {
  return { continuar: false, mensajeCombinado: '', huboAudio: false };
}

const cuerpos = mensajes.map(m => m.message_body || '');

// Si en el batch entro al menos un audio, lo marcamos y sacamos el token del
// texto que va al agente (el agente nunca ve el token).
const huboAudio = cuerpos.some(c => c.includes(AUDIO_TOKEN));

const mensajeCombinado = cuerpos
  .map(c => c.split(AUDIO_TOKEN).join('').trim())
  .filter(Boolean)
  .join('\n');

const ids = mensajes.map(m => m.id);

return {
  continuar: true,
  mensajeCombinado,
  huboAudio,
  bufferIds: ids,
  from: mensajes[0].phone,
  to: mensajes[0].phone_to,
  customerName: mensajes[0].customer_name,
  wamid: ultimoMensaje.wamid,
  wabaId: ultimoMensaje.waba_id,
  timestamp: ultimoMensaje.timestamp_msg,
  dentroDeHorario: ultimoMensaje.dentro_horario
};
```

## 3. `Preparar para Flujo` — reemplazar `jsCode`

```js
const data = $('Verificar y Concatenar').item.json;

return {
  from: data.from,
  to: data.to,
  customerName: data.customerName,
  messageBody: data.mensajeCombinado,
  huboAudio: data.huboAudio === true,
  wamid: data.wamid,
  wabaId: data.wabaId,
  timestamp: data.timestamp,
  dentroDeHorario: data.dentroDeHorario
};
```

## 4. Nodo nuevo: `Es Audio?` (IF, typeVersion 2.3) — pos `[-10640, 48]`

Una sola condición, tipo **Boolean → is true**:

| Left value | Operator | Right value |
|---|---|---|
| `{{ $json.huboAudio }}` | boolean equals | `true` |

## 5. Nodo nuevo: `Preparar Aviso Audio` (Code, typeVersion 2) — pos `[-10448, -160]`

```js
// Respuesta fija para audios: el agente no procesa voz, pedimos texto.
const data = $('Preparar para Flujo').first().json;

const mensaje = '¡Hola! Por este canal no puedo escuchar los audios 🙈 ¿Me lo escribís por texto así te respondo al toque?';

return {
  from: data.to,   // nuestra linea
  to: data.from,   // el cliente
  type: 'text',
  text: {
    body: mensaje,
    preview_url: false
  }
};
```

## 6. Nodo nuevo: `Enviar Aviso Audio YCloud` (HTTP Request) — pos `[-10192, -160]`

**Duplicá `Enviar WhatsApp YCloud1`** (así te llevás la API key sin escribirla acá) y
renombralo. Config idéntica:

- `POST https://api.ycloud.com/v2/whatsapp/messages/sendDirectly`
- Header `X-API-Key: <la misma>`
- Body JSON: `{{ $json }}`

Es terminal: **no** lo conectes a `Guardar Lead inbound` / `Classifier - Read State`.
No queremos gastar el clasificador LLM sobre una conversación donde no se dijo nada.

## 7. Conexiones

| Acción | Desde | Hacia |
|---|---|---|
| ❌ borrar | `If2` (true) | `If` |
| ✅ agregar | `If2` (true) | `Es Audio?` |
| ✅ agregar | `Es Audio?` (true) | `Preparar Aviso Audio` |
| ✅ agregar | `Es Audio?` (false) | `If` |
| ✅ agregar | `Preparar Aviso Audio` | `Enviar Aviso Audio YCloud` |

`If2 → Marcar Respondido1` queda intacto.

---

## Notas / deuda técnica detectada

1. **El push por MCP está roto de forma permanente** en este workflow.
   `n8n_update_partial_workflow` falla siempre con
   `request/body/settings must NOT have additional properties`: el workflow tiene
   `settings.availableInMCP`, `settings.binaryMode` y `settings.timeSavedMode`, campos que
   el schema de la API pública no acepta en el `PUT`, y el MCP reenvía `settings` tal cual
   lo leyó. La operación `updateSettings` **no** lo arregla porque mergea en vez de reemplazar.

   Peor: después de un `PUT` con `settings` limpio, **n8n re-inyecta esos tres campos** por
   defecto. O sea, no es un estado que se pueda "limpiar de una vez".

   **Única vía de escritura**: `PUT /api/v1/workflows/:id` armando el payload a mano con
   `{ name, nodes, connections, settings: { executionOrder, callerPolicy } }`.
   El script `patch-audios.js` usado para este cambio hace exactamente eso.

2. **La API key de YCloud está hardcodeada** en `Enviar WhatsApp YCloud1` y `Enviar WhatsApp YCloud`,
   en texto plano dentro del workflow. Debería ser una credencial de n8n. Está expuesta en cada
   export del JSON.

3. La rama `If4 → RAG Agent / Enviar WhatsApp YCloud` (segunda línea) **está huérfana**:
   ningún nodo la alimenta. `If4`, `Marcar Respondido`, `RAG Agent`, `Preparar Payload WhatsApp`,
   `Enviar WhatsApp YCloud`, `Classifier - * 1` son código muerto en el canvas.
