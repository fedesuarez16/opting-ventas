import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';
import { getTwilio } from '@/lib/twilioClient';
import { finalizarSesion, getSesion } from '@/lib/sesionDiscado';

/** Corta la tanda: finaliza la sesión y cuelga al agente. */
export async function POST(req: NextRequest) {
  let sesionId: string | undefined;
  try {
    const body = await req.json();
    sesionId = body?.sesionId;
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  if (!sesionId) return NextResponse.json({ error: 'sesionId requerido' }, { status: 400 });

  const supabase = getSupabaseServer();
  const sesion = await getSesion(supabase, sesionId);
  if (!sesion) return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 });

  // Primero se marca finalizada: si hay un lead sonando, su TwiML ya no lo mete
  // a la conferencia en vez de dejarlo entrar a una sala que está por vaciarse.
  await finalizarSesion(supabase, sesionId, 'Detenida manualmente');

  // El contacto que estaba sonando vuelve a la cola.
  if (sesion.contacto_actual_id) {
    await (supabase as any)
      .from('contactos_discado')
      .update({ estado: 'pendiente' })
      .eq('id', sesion.contacto_actual_id)
      .eq('estado', 'llamando');
  }

  if (sesion.agente_call_sid) {
    try {
      await getTwilio().calls(sesion.agente_call_sid).update({ status: 'completed' });
    } catch (e) {
      console.error('[detener] no se pudo colgar al agente', e);
    }
  }

  return NextResponse.json({ ok: true });
}
