/**
 * Envío de plantillas por YCloud, directo desde el CRM (sin pasar por n8n).
 *
 * Se usa YCloud y no la Cloud API de Meta porque las líneas están en **coexistence**:
 * el mismo número funciona en la app de WhatsApp Business y por API, y YCloud es el BSP
 * que administra esa integración.
 *
 * REGLA CLAVE: una plantilla solo se puede enviar desde un número de SU MISMA WABA.
 * Las dos líneas están en WABAs distintas:
 *   +5491141872290 (Carnet) → WABA 1140283618163985
 *   +5491123312054 (S&H)    → WABA 1975639926629842
 * Combinar plantilla de una WABA con número de la otra da 403 WHATSAPP_TEMPLATE_UNAVAILABLE.
 * Por eso cada plantilla declara su `phoneFrom` en `whatsapp-templates.ts`.
 */

const YCLOUD_SEND_URL = 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly';
const MIN_DIGITOS = 8;

export interface YCloudTemplateBody {
  from: string;
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string; policy: 'deterministic' };
  };
}

/** Normaliza a E.164 (`+` y solo dígitos), que es lo que espera YCloud. Función pura. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digitos = phone.replace(/\D/g, '');
  return digitos.length >= MIN_DIGITOS ? `+${digitos}` : null;
}

/** Arma el body de `sendDirectly`. Función pura. Sin `components`: estas plantillas no llevan variables. */
export function buildTemplateBody({
  from,
  to,
  templateName,
  language,
}: {
  from: string;
  to: string;
  templateName: string;
  language: string;
}): YCloudTemplateBody {
  return {
    from,
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: language, policy: 'deterministic' },
    },
  };
}

export interface YCloudTextBody {
  from: string;
  to: string;
  type: 'text';
  text: { body: string };
}

/**
 * Arma el body de un mensaje de TEXTO LIBRE. Función pura.
 *
 * Texto libre y plantilla no son intercambiables: WhatsApp sólo deja mandar texto libre
 * dentro de la ventana de servicio de 24hs, contada desde el último mensaje ENTRANTE de esa
 * persona. Fuera de la ventana, Meta lo rechaza y hay que sí o sí usar una plantilla
 * aprobada. A cambio, adentro de la ventana no cuesta nada y no hay que esperar aprobación.
 */
export function buildTextBody({
  from,
  to,
  texto,
}: {
  from: string;
  to: string;
  texto: string;
}): YCloudTextBody {
  return { from, to, type: 'text', text: { body: texto } };
}

export type SendTemplateResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

/**
 * Manda una plantilla. No lanza: devuelve el error como valor para que el llamador
 * registre el fallo fila por fila y siga con el resto de la cola.
 */
export async function sendTemplate({
  from,
  phone,
  templateName,
  language,
}: {
  from: string | null | undefined;
  phone: string | null | undefined;
  templateName: string;
  language: string;
}): Promise<SendTemplateResult> {
  return postDirectly(from, phone, (fromE164, to) =>
    buildTemplateBody({ from: fromE164, to, templateName, language })
  );
}

/**
 * Manda un mensaje de TEXTO LIBRE. Mismo contrato que `sendTemplate`: no lanza, devuelve el
 * error como valor.
 *
 * Sólo funciona dentro de la ventana de servicio de 24hs. Fuera de ella YCloud devuelve el
 * error de Meta y el llamador tiene que caer a una plantilla aprobada. Por eso el llamador
 * debe chequear la ventana ANTES de llamar acá: no para evitar el error, sino para no marcar
 * como contactada a gente que no recibió nada.
 */
export async function sendText({
  from,
  phone,
  texto,
}: {
  from: string | null | undefined;
  phone: string | null | undefined;
  texto: string;
}): Promise<SendTemplateResult> {
  if (!texto.trim()) return { ok: false, error: 'Texto vacío' };
  return postDirectly(from, phone, (fromE164, to) =>
    buildTextBody({ from: fromE164, to, texto })
  );
}

/**
 * Valida credenciales y números, postea a `sendDirectly` y normaliza la respuesta.
 *
 * Compartido entre plantilla y texto libre para que el manejo de errores de YCloud —que es
 * la parte delicada— sea idéntico en los dos caminos y no se bifurque con el tiempo.
 */
async function postDirectly(
  from: string | null | undefined,
  phone: string | null | undefined,
  armarBody: (fromE164: string, to: string) => YCloudTemplateBody | YCloudTextBody
): Promise<SendTemplateResult> {
  const apiKey = process.env.YCLOUD_API_KEY;
  if (!apiKey) return { ok: false, error: 'YCLOUD_API_KEY faltante' };

  const fromE164 = toE164(from);
  if (!fromE164) return { ok: false, error: `Línea de envío inválida: ${from ?? 'null'}` };

  const to = toE164(phone);
  if (!to) return { ok: false, error: `Teléfono inválido: ${phone ?? 'null'}` };

  try {
    const res = await fetch(YCLOUD_SEND_URL, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(armarBody(fromE164, to)),
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = (json as any)?.error;
      const detalle = err
        ? `${err.code ?? res.status}: ${err.message ?? 'sin mensaje'}`
        : `HTTP ${res.status}`;
      return { ok: false, error: detalle };
    }

    const messageId = (json as any)?.id;
    if (!messageId) return { ok: false, error: 'YCloud respondió OK sin id de mensaje' };

    return { ok: true, messageId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error de red' };
  }
}
