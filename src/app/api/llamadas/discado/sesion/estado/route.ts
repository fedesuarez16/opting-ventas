import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabaseServer';

/** Sesión abierta (si hay) para que la UI muestre el estado de la tanda. */
export async function GET() {
  const supabase = getSupabaseServer();

  const { data, error } = await (supabase as any)
    .from('sesiones_discado')
    .select('id, agente_telefono, lote, estado, contacto_actual_id, llamadas_hechas, ultimo_error, created_at, contacto:contactos_discado(nombre, telefono_e164, direccion)')
    .not('estado', 'in', '("finalizada","error")')
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ sesion: (data ?? [])[0] ?? null });
}
