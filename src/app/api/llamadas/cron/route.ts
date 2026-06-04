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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  if (!fromNumber) {
    return NextResponse.json({ error: 'TWILIO_PHONE_NUMBER faltante' }, { status: 500 });
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data: candidates, error: selectError } = await (supabase as any)
    .from('llamadas_agendadas')
    .select('id, agente_telefono, lead:leads(id, nombre, phone)')
    .eq('estado', 'agendada')
    .lte('inicio', now)
    .is('twilio_call_sid', null);

  if (selectError) {
    console.error('[cron/llamadas] SELECT error', selectError);
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ procesadas: 0, resultados: [] });
  }

  const ids = (candidates as any[]).map((c) => c.id);

  // Claim atómico: solo filas que siguen con twilio_call_sid IS NULL
  const { data: claimed, error: claimError } = await (supabase as any)
    .from('llamadas_agendadas')
    .update({ twilio_call_sid: 'pending' })
    .in('id', ids)
    .is('twilio_call_sid', null)
    .select('id, agente_telefono, lead:leads(id, nombre, phone)');

  if (claimError) {
    console.error('[cron/llamadas] CLAIM error', claimError);
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const client = getTwilio();
  const resultados: Array<{ id: string; status: string; sid?: string; error?: string }> = [];

  for (const row of (claimed ?? []) as any[]) {
    const to = toE164(row.lead?.phone);
    if (!to) {
      await (supabase as any)
        .from('llamadas_agendadas')
        .update({ twilio_call_sid: null })
        .eq('id', row.id);
      resultados.push({ id: row.id, status: 'omitida', error: 'sin teléfono' });
      continue;
    }

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
        .eq('id', row.id);

      resultados.push({ id: row.id, status: 'discada', sid: call.sid });
    } catch (err: any) {
      console.error('[cron/llamadas] Twilio error fila', row.id, err);
      await (supabase as any)
        .from('llamadas_agendadas')
        .update({ twilio_call_sid: null })
        .eq('id', row.id);
      resultados.push({ id: row.id, status: 'error', error: err?.message });
    }
  }

  const status = resultados.some((r) => r.status === 'error') ? 207 : 200;
  return NextResponse.json({ procesadas: resultados.length, resultados }, { status });
}
