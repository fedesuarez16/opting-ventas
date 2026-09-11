import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import twilio from 'twilio';
import { buildDialTwiml, HANGUP_TWIML } from '@/lib/llamadasTwiml';

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

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml' },
  });
}

// Twilio pide este TwiML cuando el AGENTE atiende (method: 'GET' en calls.create).
// Twilio agrega CallSid y demás parámetros al query string automáticamente.
// La respuesta conecta al agente con el lead.
export async function GET(req: NextRequest) {
  const callSid = req.nextUrl.searchParams.get('CallSid')
    ?? req.nextUrl.searchParams.get('callSid');

  if (!callSid) return xml(HANGUP_TWIML);

  const supabase = getSupabase();
  const { data } = await (supabase as any)
    .from('llamadas_agendadas')
    .select('telefono_destino, lead:leads(phone)')
    .eq('twilio_call_sid', callSid)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  return xml(
    buildDialTwiml({
      // `telefono_destino` lo usan los contactos de la base de discado, que no
      // tienen lead. Para las llamadas agendadas de siempre sigue siendo null
      // y el destino sale del lead, como antes.
      destino: data?.telefono_destino ?? data?.lead?.phone,
      callerId: process.env.TWILIO_PHONE_NUMBER,
      // El resultado del leg hacia el lead vuelve por acá: es el único dato que
      // dice si hubo conversación de verdad. El statusCallback del leg del
      // agente diría 'completed' aunque el lead nunca haya atendido.
      actionUrl: appUrl ? `${appUrl}/api/llamadas/twiml` : null,
    }),
  );
}

// Dos webhooks distintos entran por acá, los dos firmados por Twilio:
//  - action del <Dial>  → trae DialCallStatus (resultado del leg al LEAD)
//  - statusCallback     → trae CallStatus     (resultado del leg al AGENTE)
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
  const dialStatus = params['DialCallStatus'];
  const callStatus = params['CallStatus'];
  const recordingUrl = params['RecordingUrl'] ?? null;

  if (!callSid || (!dialStatus && !callStatus)) {
    return NextResponse.json({ error: 'Parámetros faltantes' }, { status: 400 });
  }

  const supabase = getSupabase();

  // --- action del <Dial>: cerró el leg hacia el lead ---
  if (dialStatus) {
    const patch: Record<string, unknown> = {
      estado_twilio: dialStatus,
      estado: dialStatus === 'completed' ? 'realizada' : 'cancelada',
    };
    if (recordingUrl) patch.grabacion_url = recordingUrl;

    const { error } = await (supabase as any)
      .from('llamadas_agendadas')
      .update(patch)
      .eq('twilio_call_sid', callSid);

    if (error) console.error('[twiml/dial-action] UPDATE error', error);

    // El action espera TwiML: sin esto Twilio loguea un error de respuesta.
    return xml(HANGUP_TWIML);
  }

  // --- statusCallback: cerró el leg hacia el agente ---
  // El filtro por estado='agendada' hace que esto NO pise lo que ya escribió el
  // action del <Dial>. Sólo gana cuando el <Dial> nunca llegó a ocurrir: el
  // agente no atendió, o el lead no tenía teléfono usable.
  if (TERMINAL_STATES.has(callStatus)) {
    const patch: Record<string, unknown> = {
      estado_twilio: callStatus,
      estado: 'cancelada',
    };
    if (recordingUrl) patch.grabacion_url = recordingUrl;

    const { error } = await (supabase as any)
      .from('llamadas_agendadas')
      .update(patch)
      .eq('twilio_call_sid', callSid)
      .eq('estado', 'agendada');

    if (error) {
      console.error('[twiml/status] UPDATE error', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
