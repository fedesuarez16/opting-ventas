import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { buildConferenceTwiml, HANGUP_TWIML } from '@/lib/llamadasTwiml';
import { getSesion } from '@/lib/sesionDiscado';

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}

/** Twilio pide este TwiML cuando el LEAD atiende: lo mete en la conferencia del agente. */
/** machine_start, machine_end_beep, machine_end_silence, machine_end_other, fax */
function esMaquina(answeredBy: string | null): boolean {
  if (!answeredBy) return false;
  return answeredBy.startsWith('machine') || answeredBy === 'fax';
}

export async function GET(req: NextRequest) {
  const sesionId = req.nextUrl.searchParams.get('sesionId');
  if (!sesionId) return xml(HANGUP_TWIML);

  // Con AMD asíncrono este TwiML se pide ANTES de que termine la detección, así
  // que normalmente no llega AnsweredBy. Se chequea igual por si el modo cambia:
  // el corte real de contestadores lo hace /sesion/amd.
  if (esMaquina(req.nextUrl.searchParams.get('AnsweredBy'))) {
    return xml(HANGUP_TWIML);
  }

  const sesion = await getSesion(getSupabaseServer(), sesionId);
  // Si la tanda se detuvo mientras sonaba, no se lo mete a una sala vacía.
  if (!sesion || sesion.estado === 'finalizada') return xml(HANGUP_TWIML);

  return xml(buildConferenceTwiml({ sala: sesion.conference_name, rol: 'lead' }));
}
