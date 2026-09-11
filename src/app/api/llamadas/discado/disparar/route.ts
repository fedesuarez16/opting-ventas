import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispararLlamada } from '@/lib/dispararLlamada';
import { normalizarTelefonoAR, esTelefonoArgentino } from '@/lib/telefonoAR';

let supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars faltantes');
  supabaseClient = createClient(url, key);
  return supabaseClient;
}

/**
 * Dispara una llamada a un contacto de la base de discado.
 *
 * Crea la fila en `llamadas_agendadas` con `telefono_destino` (el contacto no
 * es un lead, no hay de dónde sacar el número por join) y la dispara por el
 * mismo motor que el resto de las llamadas.
 */
export async function POST(req: NextRequest) {
  let contactoId: string | undefined;
  let agenteTelefono: string | undefined;
  try {
    const body = await req.json();
    contactoId = body?.contactoId;
    agenteTelefono = body?.agenteTelefono;
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  if (!contactoId || typeof contactoId !== 'string') {
    return NextResponse.json({ error: 'contactoId requerido' }, { status: 400 });
  }

  const agente = normalizarTelefonoAR(agenteTelefono).e164;
  if (!esTelefonoArgentino(agente)) {
    return NextResponse.json(
      { error: 'El teléfono del agente no es un número argentino válido' },
      { status: 422 },
    );
  }

  const supabase = getSupabase();

  const { data: contacto, error: contactoError } = await (supabase as any)
    .from('contactos_discado')
    .select('id, nombre, telefono_e164, estado')
    .eq('id', contactoId)
    .single();

  if (contactoError || !contacto) {
    return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
  }

  if (!esTelefonoArgentino(contacto.telefono_e164)) {
    return NextResponse.json(
      { error: 'El contacto no tiene un teléfono argentino válido. Corregilo antes de llamar.' },
      { status: 422 },
    );
  }

  if (contacto.estado === 'llamando') {
    return NextResponse.json({ error: 'Ya hay una llamada en curso a este contacto' }, { status: 409 });
  }

  const ahora = new Date();
  const fin = new Date(ahora.getTime() + 15 * 60 * 1000);

  const { data: llamada, error: insertError } = await (supabase as any)
    .from('llamadas_agendadas')
    .insert({
      lead_id: null,
      contacto_discado_id: contacto.id,
      nombre_contacto: contacto.nombre,
      titulo: `Discado: ${contacto.nombre}`,
      inicio: ahora.toISOString(),
      fin: fin.toISOString(),
      estado: 'agendada',
      agente_telefono: agente,
      telefono_destino: contacto.telefono_e164,
    })
    .select('id')
    .single();

  if (insertError || !llamada) {
    return NextResponse.json(
      { error: insertError?.message ?? 'No se pudo crear la llamada' },
      { status: 500 },
    );
  }

  await (supabase as any)
    .from('contactos_discado')
    .update({ estado: 'llamando', ultima_llamada_id: llamada.id, ultimo_error: null })
    .eq('id', contacto.id);

  const r = await dispararLlamada(supabase, llamada.id);

  if (r.error) {
    // La llamada quedó creada pero no salió: el contacto vuelve a quedar
    // disponible con el motivo a la vista, en vez de trabado en 'llamando'.
    await (supabase as any)
      .from('contactos_discado')
      .update({ estado: 'error', ultimo_error: r.error })
      .eq('id', contacto.id);

    return NextResponse.json({ error: r.error }, { status: r.status });
  }

  await (supabase as any)
    .from('contactos_discado')
    .update({ estado: 'llamado', ultimo_error: null })
    .eq('id', contacto.id);

  return NextResponse.json({ status: 'discada', sid: r.sid, llamadaId: llamada.id });
}
