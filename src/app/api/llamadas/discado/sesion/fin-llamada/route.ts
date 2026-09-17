import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { discarSiguiente, finalizarSesion, getSesion } from '@/lib/sesionDiscado';

const TERMINALES = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);

/**
 * Fin de una llamada de la tanda: encadena la siguiente.
 *
 * Este endpoint es el que hace girar la cola, así que la firma de Twilio se
 * valida SIEMPRE: sin eso, cualquiera que conozca la URL podría dispararlo en
 * loop y quemar el saldo de la cuenta.
 */
export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const signature = req.headers.get('x-twilio-signature') ?? '';

  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = String(value); });

  // La firma se calcula sobre la URL COMPLETA, query string incluido.
  const fullUrl = `${appUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!twilio.validateRequest(authToken, signature, fullUrl, params)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 403 });
  }

  const sesionId = req.nextUrl.searchParams.get('sesionId');
  const rol = req.nextUrl.searchParams.get('rol');
  const evento = req.nextUrl.searchParams.get('evento');
  const llamadaId = req.nextUrl.searchParams.get('llamadaId');

  if (!sesionId) return NextResponse.json({ error: 'sesionId requerido' }, { status: 400 });

  const supabase = getSupabaseServer();

  // --- el agente colgó: se termina la tanda ---
  if (rol === 'agente') {
    await finalizarSesion(supabase, sesionId, 'El agente cortó la llamada');
    return NextResponse.json({ ok: true, fin: true });
  }

  // --- eventos de la conferencia (join/leave): sólo para trazabilidad ---
  if (evento === 'conferencia') {
    return NextResponse.json({ ok: true });
  }

  const callStatus = params['CallStatus'];
  // Con machineDetection activo, Twilio informa acá si atendió una persona.
  const answeredBy = params['AnsweredBy'] ?? '';
  const atendioMaquina = answeredBy.startsWith('machine') || answeredBy === 'fax';
  if (!callStatus || !TERMINALES.has(callStatus)) {
    return NextResponse.json({ ok: true, ignorado: callStatus });
  }

  // --- cerrar la llamada del lead ---
  // Un contestador devuelve CallStatus='completed', pero no hubo conversación:
  // marcarlo como realizada sería mentirle al CRM.
  const hubodCharla = callStatus === 'completed' && !atendioMaquina;

  if (llamadaId) {
    await (supabase as any)
      .from('llamadas_agendadas')
      .update({
        estado_twilio: atendioMaquina ? `contestador (${answeredBy})` : callStatus,
        estado: hubodCharla ? 'realizada' : 'cancelada',
      })
      .eq('id', llamadaId);
  }

  const sesion = await getSesion(supabase, sesionId);
  if (sesion?.contacto_actual_id) {
    await (supabase as any)
      .from('contactos_discado')
      .update({
        estado: hubodCharla ? 'llamado' : 'error',
        ultimo_error: hubodCharla
          ? null
          : atendioMaquina
            ? 'Atendió un contestador automático'
            : `Twilio: ${callStatus}`,
      })
      .eq('id', sesion.contacto_actual_id);
  }

  if (!sesion || sesion.estado === 'finalizada') {
    return NextResponse.json({ ok: true, fin: true });
  }

  // --- y sigue la cola ---
  const r = await discarSiguiente(supabase, sesionId);
  return NextResponse.json({ ok: true, siguiente: r.contactoId ?? null, fin: r.fin ?? false });
}
