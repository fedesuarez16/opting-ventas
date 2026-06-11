import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const CALENDLY_SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SECRET;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function verifySignature(body: string, signatureHeader: string, secret: string): boolean {
  // Formato Calendly: "t=TIMESTAMP,v1=HASH"
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(',')) {
    const [k, v] = part.split('=');
    if (k && v) parts[k] = v;
  }
  const { t: timestamp, v1: signature } = parts;
  if (!timestamp || !signature) return false;

  const toSign = `${timestamp}.${body}`;
  const expected = crypto.createHmac('sha256', secret).update(toSign).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const bodyText = await req.text();

  if (CALENDLY_SIGNING_KEY) {
    const sigHeader = req.headers.get('Calendly-Webhook-Signature') ?? '';
    if (!verifySignature(bodyText, sigHeader, CALENDLY_SIGNING_KEY)) {
      return NextResponse.json({ error: 'Firma inválida' }, { status: 401 });
    }
  }

  let body: any;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const event: string = body.event;
  const payload = body.payload;

  if (!event || !payload) {
    return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // ── invitee.created ─────────────────────────────────────────────
  if (event === 'invitee.created') {
    const inviteeUri: string = payload.invitee?.uri ?? '';
    const eventData = payload.event ?? {};
    const invitee = payload.invitee ?? {};

    if (!inviteeUri) {
      return NextResponse.json({ error: 'URI de invitee faltante' }, { status: 400 });
    }

    // Idempotencia: no duplicar si ya existe
    const { data: existing } = await (supabase as any)
      .from('llamadas_agendadas')
      .select('id')
      .eq('calendly_uuid', inviteeUri)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, action: 'already_exists' });
    }

    const nombreContacto: string | null = invitee.name ?? null;
    const phone: string | null = invitee.text_reminder_number ?? null;
    const email: string = invitee.email ?? '';
    const titulo: string = eventData.name || 'Llamada desde Calendly';
    const notas = `Agendado vía Calendly${email ? `\nEmail: ${email}` : ''}`;

    const { error: insertError } = await (supabase as any)
      .from('llamadas_agendadas')
      .insert({
        titulo,
        nombre_contacto: nombreContacto,
        inicio: eventData.start_time,
        fin: eventData.end_time,
        estado: 'agendada',
        notas,
        agente_telefono: phone,
        calendly_uuid: inviteeUri,
      });

    if (insertError) {
      console.error('[calendly/webhook] insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: 'created' });
  }

  // ── invitee.canceled ────────────────────────────────────────────
  if (event === 'invitee.canceled') {
    const inviteeUri: string = payload.invitee?.uri ?? '';
    if (!inviteeUri) {
      return NextResponse.json({ error: 'URI de invitee faltante' }, { status: 400 });
    }

    const { error: updateError } = await (supabase as any)
      .from('llamadas_agendadas')
      .update({ estado: 'cancelada' })
      .eq('calendly_uuid', inviteeUri);

    if (updateError) {
      console.error('[calendly/webhook] update error:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, action: 'canceled' });
  }

  // Evento no manejado — respondemos 200 para que Calendly no reintente
  return NextResponse.json({ ok: true, action: 'ignored', event });
}
