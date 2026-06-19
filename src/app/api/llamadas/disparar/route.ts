import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

let twilioClient: ReturnType<typeof twilio> | null = null;
function getTwilio() {
  if (twilioClient) return twilioClient;
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN faltantes');
  twilioClient = twilio(sid, token);
  return twilioClient;
}

let supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars faltantes');
  supabaseClient = createClient(url, key);
  return supabaseClient;
}

function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

export async function POST(req: NextRequest) {
  let llamadaId: string | undefined;
  try {
    const body = await req.json();
    llamadaId = body?.llamadaId;
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  if (!llamadaId || typeof llamadaId !== 'string') {
    return NextResponse.json({ error: 'llamadaId requerido' }, { status: 400 });
  }

  const supabase = getSupabase();

  // Leer fila para validar agente_telefono antes del claim
  const { data: fila, error: filaError } = await (supabase as any)
    .from('llamadas_agendadas')
    .select('agente_telefono, lead:leads(phone)')
    .eq('id', llamadaId)
    .single();

  if (filaError || !fila) {
    return NextResponse.json({ error: 'Llamada no encontrada' }, { status: 404 });
  }

  if (!fila.agente_telefono) {
    return NextResponse.json({ error: 'Sin agente asignado' }, { status: 422 });
  }

  // Claim atómico: solo si twilio_call_sid IS NULL
  const { data: claimed, error: claimError } = await (supabase as any)
    .from('llamadas_agendadas')
    .update({ twilio_call_sid: 'pending' })
    .eq('id', llamadaId)
    .is('twilio_call_sid', null)
    .select('agente_telefono, lead:leads(phone)')
    .single();

  if (claimError?.code === 'PGRST116' || !claimed) {
    return NextResponse.json({ error: 'La llamada ya fue disparada o no existe' }, { status: 409 });
  }

  if (claimError) {
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;

  if (!fromNumber || !appUrl || !twilioSid || !twilioToken) {
    await (supabase as any)
      .from('llamadas_agendadas')
      .update({ twilio_call_sid: null })
      .eq('id', llamadaId);
    return NextResponse.json({ error: 'Variables de entorno de Twilio faltantes' }, { status: 500 });
  }

  const to = toE164(claimed.lead?.phone);
  if (!to) {
    await (supabase as any)
      .from('llamadas_agendadas')
      .update({ twilio_call_sid: null })
      .eq('id', llamadaId);
    return NextResponse.json({ error: 'Sin teléfono del lead' }, { status: 422 });
  }

  const client = getTwilio();

  try {
    const call = await client.calls.create({
      to,
      from: fromNumber,
      url: `${appUrl}/api/llamadas/twiml`,
      method: 'GET',
      statusCallback: `${appUrl}/api/llamadas/twiml`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed', 'failed', 'busy', 'no-answer', 'canceled'],
    });

    await (supabase as any)
      .from('llamadas_agendadas')
      .update({ twilio_call_sid: call.sid })
      .eq('id', llamadaId);

    return NextResponse.json({ status: 'discada', sid: call.sid });
  } catch (err: any) {
    console.error('[disparar] Twilio error', llamadaId, err);
    await (supabase as any)
      .from('llamadas_agendadas')
      .update({ twilio_call_sid: null })
      .eq('id', llamadaId);
    return NextResponse.json({ error: err?.message ?? 'Error de Twilio' }, { status: 502 });
  }
}
