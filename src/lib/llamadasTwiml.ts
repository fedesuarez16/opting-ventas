/**
 * Helpers de TwiML para las llamadas salientes del CRM.
 *
 * El circuito llama PRIMERO al agente y, cuando atiende, hace <Dial> hacia el
 * lead. De esa forma el que espera en silencio mientras se arma la conferencia
 * es el vendedor y no el cliente.
 */

import { normalizarTelefonoAR, esTelefonoArgentino } from './telefonoAR';

/**
 * Normalización genérica. Se usa SOLO para el callerId (el número Twilio, que
 * es de EEUU). Para cualquier destino usar `normalizarTelefonoAR`.
 */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

export const HANGUP_TWIML =
  '<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>';

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * TwiML que conecta la llamada en curso con `destino`.
 *
 * Devuelve <Hangup/> si el destino no es un teléfono usable: sin esto Twilio
 * recibiría un <Dial> vacío y la llamada quedaría colgada en silencio.
 */
export function buildDialTwiml(opts: {
  destino: string | null | undefined;
  callerId?: string | null;
  actionUrl?: string | null;
}): string {
  // El destino se normaliza como teléfono argentino y se verifica de nuevo
  // antes de entregárselo a Twilio: un `+1…` acá sale como llamada real a
  // Estados Unidos, que está habilitado por defecto en la cuenta.
  const { e164: numero } = normalizarTelefonoAR(opts.destino);
  if (!numero || !esTelefonoArgentino(numero)) return HANGUP_TWIML;

  const callerId = toE164(opts.callerId);
  const attrs = [
    callerId ? ` callerId="${callerId}"` : '',
    opts.actionUrl ? ` action="${escapeXmlAttr(opts.actionUrl)}" method="POST"` : '',
    ' answerOnBridge="true"',
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${attrs}><Number>${numero}</Number></Dial>
</Response>`;
}
