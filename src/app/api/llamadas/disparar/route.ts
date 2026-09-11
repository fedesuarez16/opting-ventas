import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { dispararLlamada } from '@/lib/dispararLlamada';

let supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars faltantes');
  supabaseClient = createClient(url, key);
  return supabaseClient;
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

  const r = await dispararLlamada(getSupabase(), llamadaId);
  if (r.error) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ status: 'discada', sid: r.sid });
}
