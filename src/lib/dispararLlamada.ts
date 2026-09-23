import twilio from 'twilio';
import { normalizarTelefonoAR, esTelefonoArgentino } from './telefonoAR';

/**
 * Disparo de UNA llamada ya existente en `llamadas_agendadas`.
 *
 * Lo comparten el botón del calendario (`/api/llamadas/disparar`) y el de la
 * base de discado (`/api/llamadas/discado/disparar`): el circuito es el mismo
 * — primer leg al agente, `<Dial>` al destino.
 */

let twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilio() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN faltantes');
  twilioClient = twilio(sid, token);
  return twilioClient;
}

export interface ResultadoDisparo {
  status: number;
  sid?: string;
  error?: string;
}

export async function dispararLlamada(
  supabase: any,
  llamadaId: string,
): Promise<ResultadoDisparo> {
  const { data: fila, error: filaError } = await supabase
    .from('llamadas_agendadas')
    .select('agente_telefono, telefono_destino, lead:leads(phone)')
    .eq('id', llamadaId)
    .single();

  if (filaError || !fila) return { status: 404, error: 'Llamada no encontrada' };

  // Los dos teléfonos se validan ANTES del claim: despertar al vendedor para
  // después descubrir que el destino no sirve es peor que no llamar.
  const agente = normalizarTelefonoAR(fila.agente_telefono).e164;
  if (!esTelefonoArgentino(agente)) {
    return { status: 422, error: 'El agente no tiene un teléfono argentino válido' };
  }

  const destino = normalizarTelefonoAR(fila.telefono_destino ?? fila.lead?.phone).e164;
  if (!esTelefonoArgentino(destino)) {
    return { status: 422, error: 'El destino no tiene un teléfono argentino válido' };
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;

  if (!fromNumber || !appUrl || !twilioSid || !twilioToken) {
    return { status: 500, error: 'Variables de entorno de Twilio faltantes' };
  }

  // Claim atómico: sólo si twilio_call_sid sigue en NULL.
  const { data: claimed, error: claimError } = await supabase
    .from('llamadas_agendadas')
    .update({ twilio_call_sid: 'pending' })
    .eq('id', llamadaId)
    .is('twilio_call_sid', null)
    .select('id')
    .single();

  if (claimError?.code === 'PGRST116' || !claimed) {
    return { status: 409, error: 'La llamada ya fue disparada o no existe' };
  }
  if (claimError) return { status: 500, error: claimError.message };

  const releaseClaim = () =>
    supabase.from('llamadas_agendadas').update({ twilio_call_sid: null }).eq('id', llamadaId);

  try {
    // El primer leg va al AGENTE; el TwiML lo conecta con el destino.
    const call = await getTwilio().calls.create({
      to: agente as string,
      from: fromNumber,
      url: `${appUrl}/api/llamadas/twiml`,
      method: 'GET',
      statusCallback: `${appUrl}/api/llamadas/twiml`,
      statusCallbackMethod: 'POST',
      // initiated|ringing|answered|completed son los únicos válidos (warning 21626).
      statusCallbackEvent: ['completed'],
    });

    await supabase
      .from('llamadas_agendadas')
      .update({ twilio_call_sid: call.sid })
      .eq('id', llamadaId);

    return { status: 200, sid: call.sid };
  } catch (err: any) {
    console.error('[dispararLlamada] Twilio error', llamadaId, err);
    await releaseClaim();
    return { status: 502, error: err?.message ?? 'Error de Twilio' };
  }
}
