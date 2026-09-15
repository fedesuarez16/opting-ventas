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

/**
 * Cuántos segundos suena el destino antes de darse por vencido.
 *
 * El default de Twilio es 30, pero el agente ya está en línea (y facturando)
 * durante todo ese tiempo. Nadie que vaya a atender tarda más de 15 segundos:
 * los otros 15 sólo servían para pagar más caro el silencio de los que no están.
 */
export const DIAL_TIMEOUT_SEGUNDOS = 15;

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
  timeoutSegundos?: number;
}): string {
  // El destino se normaliza como teléfono argentino y se verifica de nuevo
  // antes de entregárselo a Twilio: un `+1…` acá sale como llamada real a
  // Estados Unidos, que está habilitado por defecto en la cuenta.
  const { e164: numero } = normalizarTelefonoAR(opts.destino);
  if (!numero || !esTelefonoArgentino(numero)) return HANGUP_TWIML;

  const callerId = toE164(opts.callerId);
  const timeout = opts.timeoutSegundos ?? DIAL_TIMEOUT_SEGUNDOS;
  const attrs = [
    callerId ? ` callerId="${callerId}"` : '',
    opts.actionUrl ? ` action="${escapeXmlAttr(opts.actionUrl)}" method="POST"` : '',
    ` timeout="${timeout}"`,
    ' answerOnBridge="true"',
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${attrs}><Number>${numero}</Number></Dial>
</Response>`;
}

/**
 * TwiML de conferencia para el discador con sesión persistente.
 *
 * El reparto de flags es lo que hace que funcione:
 *
 *   AGENTE  startConferenceOnEnter=false  → entra y escucha música de espera
 *           endConferenceOnExit=true      → si cuelga, se termina la tanda
 *
 *   LEAD    startConferenceOnEnter=true   → al entrar ARRANCA la charla
 *           endConferenceOnExit=false     → al colgar, el agente vuelve a espera
 *
 * Así el agente atiende UNA vez y se queda: entre lead y lead vuelve solo a la
 * música, sin que su teléfono vuelva a sonar.
 */
export function buildConferenceTwiml(opts: {
  sala: string;
  rol: 'agente' | 'lead';
  statusCallbackUrl?: string | null;
}): string {
  const sala = sanitizarSala(opts.sala);
  if (!sala) return HANGUP_TWIML;

  const esAgente = opts.rol === 'agente';
  const attrs = [
    ` startConferenceOnEnter="${esAgente ? 'false' : 'true'}"`,
    ` endConferenceOnExit="${esAgente ? 'true' : 'false'}"`,
    ' beep="false"',
    opts.statusCallbackUrl
      ? ` statusCallback="${escapeXmlAttr(opts.statusCallbackUrl)}"` +
        ' statusCallbackMethod="POST" statusCallbackEvent="join leave"'
      : '',
  ].join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial><Conference${attrs}>${sala}</Conference></Dial>
</Response>`;
}

/** El nombre de sala va como contenido XML: se limita a un juego seguro. */
export function sanitizarSala(sala: string | null | undefined): string {
  if (!sala) return '';
  return String(sala).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 100);
}
