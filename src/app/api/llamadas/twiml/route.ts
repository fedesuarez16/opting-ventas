import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';

let supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars faltantes');
  supabaseClient = createClient(url, key);
  return supabaseClient;
}

const TERMINAL_STATES = new Set(['completed', 'failed', 'busy', 'no-answer', 'canceled']);

// Twilio fetches this via GET when the lead answers (method: 'GET' set in calls.create).
// Twilio automatically appends CallSid + other params as query params on GET.
export async function GET(req: NextRequest) {
  const callSid = req.nextUrl.searchParams.get('CallSid')
    ?? req.nextUrl.searchParams.get('callSid');

  if (!callSid) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
      { status: 200, headers: { 'Content-Type': 'text/xml' } },
    );
  }

  const supabase = getSupabase();
  const { data } = await (supabase as any)
    .from('llamadas_agendadas')
    .select('agente_telefono')
    .eq('twilio_call_sid', callSid)
    .single();

  const agentPhone = data?.agente_telefono ?? null;

  const twiml = agentPhone
    ? `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial><Number>${agentPhone}</Number></Dial>
</Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;

  return new NextResponse(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

// Twilio status callback — validates X-Twilio-Signature before processing.
export async function POST(req: NextRequest) {
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? '';
  const signature = req.headers.get('x-twilio-signature') ?? '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const fullUrl = `${appUrl}/api/llamadas/twiml`;

  const formData = await req.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => { params[key] = String(value); });

  const isValid = twilio.validateRequest(authToken, signature, fullUrl, params);
  if (!isValid) {
    return NextResponse.json({ error: 'Firma inválida' }, { status: 403 });
  }

  const callSid = params['CallSid'];
  const callStatus = params['CallStatus'];
  const recordingUrl = params['RecordingUrl'] ?? null;

  if (!callSid || !callStatus) {
    return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 });
  }

  const supabase = getSupabase();
  const patch: Record<string, unknown> = { estado_twilio: callStatus };
  if (recordingUrl) patch.grabacion_url = recordingUrl;

  if (TERMINAL_STATES.has(callStatus)) {
    patch.estado = callStatus === 'completed' ? 'realizada' : 'cancelada';
  }

  const { error } = await (supabase as any)
    .from('llamadas_agendadas')
    .update(patch)
    .eq('twilio_call_sid', callSid);

  if (error) {
    console.error('[twiml/status] UPDATE error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
