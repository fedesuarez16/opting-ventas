import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queueLeadsForSend } from '@/lib/bulkSendQueue';
import { ingestarLeadsPrevioPago, type ContactoIngest } from '@/lib/previoPagoIngest';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

let supabaseClient: ReturnType<typeof createClient> | null = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing.');
  }
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { contactos, templateKey } = body as Record<string, unknown>;

  if (!Array.isArray(contactos) || contactos.length === 0) {
    return NextResponse.json({ error: 'Sin contactos seleccionados' }, { status: 400 });
  }
  if (contactos.length > 1000) {
    return NextResponse.json({ error: 'Máximo 1000 contactos por carga' }, { status: 400 });
  }
  if (typeof templateKey !== 'string' || !templateKey) {
    return NextResponse.json({ error: 'Plantilla inválida' }, { status: 400 });
  }

  const supabase = getSupabase();

  const ingest = await ingestarLeadsPrevioPago(supabase, contactos as ContactoIngest[], {
    etiquetarExistentes: true,
  });
  if ('error' in ingest) {
    return NextResponse.json({ error: ingest.error }, { status: ingest.status });
  }

  console.log(
    `[previo-pago/cargar] contactos=${contactos.length} nuevos=${ingest.nuevos} existentes=${ingest.existentes} templateKey=${templateKey}`
  );

  const result = await queueLeadsForSend(supabase, ingest.leadIds, templateKey);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    ...result,
    leads_nuevos: ingest.nuevos,
    leads_existentes: ingest.existentes,
  });
}
