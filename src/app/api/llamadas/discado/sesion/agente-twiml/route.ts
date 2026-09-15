import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { buildConferenceTwiml, HANGUP_TWIML } from '@/lib/llamadasTwiml';
import { getSesion, discarSiguiente } from '@/lib/sesionDiscado';

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}

/**
 * Twilio pide este TwiML cuando el AGENTE atiende. Lo mete en la conferencia y,
 * en el mismo golpe, arranca el primer discado: el agente ya está adentro
 * escuchando la música de espera, así que el primer lead puede salir ya.
 */
export async function GET(req: NextRequest) {
  const sesionId = req.nextUrl.searchParams.get('sesionId');
  if (!sesionId) return xml(HANGUP_TWIML);

  const supabase = getSupabaseServer();
  const sesion = await getSesion(supabase, sesionId);
  if (!sesion || sesion.estado === 'finalizada') return xml(HANGUP_TWIML);

  const { appUrl } = await import('@/lib/twilioClient').then((m) => m.getTwilioEnv());

  // Se espera el disparo antes de responder: son unos cientos de milisegundos
  // de música extra para el agente, y evita depender de trabajo en background
  // (que en serverless no está garantizado).
  try {
    await discarSiguiente(supabase, sesionId);
  } catch (e) {
    console.error('[agente-twiml] no se pudo discar el primero', e);
  }

  return xml(
    buildConferenceTwiml({
      sala: sesion.conference_name,
      rol: 'agente',
      statusCallbackUrl: appUrl
        ? `${appUrl}/api/llamadas/discado/sesion/fin-llamada?sesionId=${sesionId}&evento=conferencia`
        : null,
    }),
  );
}
