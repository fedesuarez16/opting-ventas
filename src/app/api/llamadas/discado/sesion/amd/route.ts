import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { getTwilio } from '@/lib/twilioClient';

/**
 * Resultado del análisis de contestador (AMD asíncrono).
 *
 * Con `asyncAmd`, Twilio conecta la llamada de inmediato y sigue escuchando en
 * paralelo: el prospecto no espera nada. Cuando termina de decidir avisa acá.
 * Si atendió una máquina, se cuelga esa llamada — el statusCallback normal se
 * encarga después de encadenar la siguiente de la cola.
 *
 * El modo sincrónico hacía lo mismo pero ANTES de conectar, y costaba ~7
 * segundos de silencio al prospecto en TODAS las llamadas, incluidas las buenas.
 */
export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const signature = req.headers.get('x-twilio-signature') ?? '';

  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = String(value); });

  const fullUrl = `${appUrl}${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (!twilio.validateRequest(authToken, signature, fullUrl, params)) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 403 });
  }

  const answeredBy = params['AnsweredBy'] ?? '';
  const callSid = params['CallSid'];
  const esMaquina = answeredBy.startsWith('machine') || answeredBy === 'fax';

  if (!esMaquina) return NextResponse.json({ ok: true, answeredBy });

  const llamadaId = req.nextUrl.searchParams.get('llamadaId');
  const contactoId = req.nextUrl.searchParams.get('contactoId');
  const supabase = getSupabaseServer();

  if (llamadaId) {
    await (supabase as any)
      .from('llamadas_agendadas')
      .update({ estado: 'cancelada', estado_twilio: `contestador (${answeredBy})` })
      .eq('id', llamadaId);
  }

  if (contactoId) {
    await (supabase as any)
      .from('contactos_discado')
      .update({ estado: 'error', ultimo_error: 'Atendió un contestador automático' })
      .eq('id', contactoId);
  }

  // Colgar saca al contestador de la conferencia y dispara el statusCallback,
  // que es el que sigue con el próximo contacto de la cola.
  if (callSid) {
    try {
      await getTwilio().calls(callSid).update({ status: 'completed' });
    } catch (e) {
      console.error('[sesion/amd] no se pudo colgar', callSid, e);
    }
  }

  return NextResponse.json({ ok: true, answeredBy, colgada: true });
}
