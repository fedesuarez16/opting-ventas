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
 * Marcado manual: un número escrito a mano, sin lead ni contacto de la base.
 *
 * Igual que el resto, deja rastro en `llamadas_agendadas` — si la llamada falla,
 * la fila queda ahí para reintentar desde la solapa de llamadas agendadas.
 */
export async function POST(req: NextRequest) {
  let telefono: string | undefined;
  let nombre: string | undefined;
  let agenteTelefono: string | undefined;

  try {
    const body = await req.json();
    telefono = body?.telefono;
    nombre = body?.nombre;
    agenteTelefono = body?.agenteTelefono;
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

  const { e164: destino, motivo } = normalizarTelefonoAR(telefono);
  if (!esTelefonoArgentino(destino)) {
    return NextResponse.json(
      { error: motivo ?? 'El número a llamar no es un teléfono argentino válido' },
      { status: 422 },
    );
  }

  const supabase = getSupabase();
  const ahora = new Date();
  const fin = new Date(ahora.getTime() + 15 * 60 * 1000);
  const etiqueta = (nombre ?? '').trim() || destino!;

  const { data: llamada, error: insertError } = await (supabase as any)
    .from('llamadas_agendadas')
    .insert({
      lead_id: null,
      nombre_contacto: (nombre ?? '').trim() || null,
      titulo: `Manual: ${etiqueta}`,
      inicio: ahora.toISOString(),
      fin: fin.toISOString(),
      estado: 'agendada',
      agente_telefono: agente,
      telefono_destino: destino,
    })
    .select('id')
    .single();

  if (insertError || !llamada) {
    return NextResponse.json(
      { error: insertError?.message ?? 'No se pudo crear la llamada' },
      { status: 500 },
    );
  }

  const r = await dispararLlamada(supabase, llamada.id);
  if (r.error) return NextResponse.json({ error: r.error, llamadaId: llamada.id }, { status: r.status });

  return NextResponse.json({ status: 'discada', sid: r.sid, llamadaId: llamada.id, destino });
}
