import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { getTwilio, getTwilioEnv } from '@/lib/twilioClient';
import { normalizarTelefonoAR, esTelefonoArgentino } from '@/lib/telefonoAR';
import { sanitizarSala } from '@/lib/llamadasTwiml';

/** Arranca una tanda: crea la sesión y llama al agente para que entre a la conferencia. */
export async function POST(req: NextRequest) {
  let agenteTelefono: string | undefined;
  let lote: string | undefined;
  let contactoIds: string[] | undefined;
  try {
    const body = await req.json();
    agenteTelefono = body?.agenteTelefono;
    lote = body?.lote;
    contactoIds = Array.isArray(body?.contactoIds) ? body.contactoIds : undefined;
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const agente = normalizarTelefonoAR(agenteTelefono).e164;
  if (!esTelefonoArgentino(agente)) {
    return NextResponse.json(
      { error: 'El teléfono del agente no es un número argentino válido' },
      { status: 422 },
    );
  }

  const { fromNumber, appUrl, faltan } = getTwilioEnv();
  if (faltan) {
    return NextResponse.json({ error: 'Variables de entorno de Twilio faltantes' }, { status: 500 });
  }

  const supabase = getSupabaseServer();

  // Una sola tanda a la vez: dos sesiones activas se pisarían la cola.
  const { data: abiertas } = await (supabase as any)
    .from('sesiones_discado')
    .select('id')
    .not('estado', 'in', '("finalizada","error")')
    .limit(1);

  if ((abiertas ?? []).length > 0) {
    return NextResponse.json(
      { error: 'Ya hay una tanda en curso. Detenela antes de arrancar otra.', sesionId: abiertas[0].id },
      { status: 409 },
    );
  }

  const loteLimpio = (lote ?? '').trim() || null;

  const { data: sesion, error: insertError } = await (supabase as any)
    .from('sesiones_discado')
    .insert({
      agente_telefono: agente,
      conference_name: 'pendiente',
      lote: loteLimpio,
      contacto_ids: contactoIds && contactoIds.length > 0 ? contactoIds : null,
      estado: 'iniciando',
    })
    .select('id')
    .single();

  if (insertError || !sesion) {
    return NextResponse.json(
      { error: insertError?.message ?? 'No se pudo crear la sesión' },
      { status: 500 },
    );
  }

  const sala = sanitizarSala(`sesion-${sesion.id}`);
  await (supabase as any)
    .from('sesiones_discado')
    .update({ conference_name: sala })
    .eq('id', sesion.id);

  try {
    const call = await getTwilio().calls.create({
      to: agente as string,
      from: fromNumber as string,
      url: `${appUrl}/api/llamadas/discado/sesion/agente-twiml?sesionId=${sesion.id}`,
      method: 'GET',
      statusCallback: `${appUrl}/api/llamadas/discado/sesion/fin-llamada?sesionId=${sesion.id}&rol=agente`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['completed'],
    });

    await (supabase as any)
      .from('sesiones_discado')
      .update({ estado: 'esperando_agente', agente_call_sid: call.sid })
      .eq('id', sesion.id);

    return NextResponse.json({ sesionId: sesion.id, sala, agenteCallSid: call.sid });
  } catch (err: any) {
    await (supabase as any)
      .from('sesiones_discado')
      .update({ estado: 'error', ultimo_error: err?.message ?? 'Error de Twilio' })
      .eq('id', sesion.id);

    return NextResponse.json({ error: err?.message ?? 'Error de Twilio' }, { status: 502 });
  }
}
