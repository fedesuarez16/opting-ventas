import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queueLeadsForSend } from '@/lib/bulkSendQueue';

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

// WABA de Carnet de Manipulación — confirmado por el usuario para esta campaña.
const CARNET_PHONE_FROM = '+5491141872290';
export const ETIQUETA_PREVIO_PAGO = 'previo_pago';

interface ContactoInput {
  remoteJid: string;
  nombre?: string;
  estados?: string[];
}

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

  const items = (contactos as ContactoInput[]).map((c) => ({
    ...c,
    phone: `+${String(c.remoteJid).replace(/\D/g, '')}`,
  }));

  const phones = items.map((i) => i.phone);
  const { data: existentes, error: existentesError } = await (supabase as any)
    .from('leads')
    .select('id, phone')
    .in('phone', phones);

  if (existentesError) {
    console.error('[previo-pago/cargar] Error buscando leads existentes:', existentesError);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }

  const idPorPhone = new Map<string, number>();
  for (const row of existentes ?? []) idPorPhone.set(row.phone, row.id);

  const nuevos = items.filter((i) => !idPorPhone.has(i.phone));

  if (nuevos.length > 0) {
    const filas = nuevos.map((i) => ({
      phone: i.phone,
      nombre: i.nombre || null,
      estado: 'frio',
      chat_activo: 0,
      phone_from: CARNET_PHONE_FROM,
      etiqueta: ETIQUETA_PREVIO_PAGO,
      mensaje_inicial: `Previo pago sin completar (${(i.estados || []).join(', ') || 'previopago'}) — optingsha.com.ar/estado.log`,
      timestamp_mensaje: new Date().toISOString(),
    }));

    const { data: insertados, error: insertError } = await (supabase as any)
      .from('leads')
      .insert(filas)
      .select('id, phone');

    if (insertError) {
      console.error('[previo-pago/cargar] Error creando leads:', insertError);
      return NextResponse.json({ error: 'Error interno creando leads' }, { status: 500 });
    }
    for (const row of insertados ?? []) idPorPhone.set(row.phone, row.id);
  }

  const idsExistentesPrevios = [...idPorPhone.entries()]
    .filter(([phone]) => phones.includes(phone) && existentes?.some((e: any) => e.phone === phone))
    .map(([, id]) => id);

  if (idsExistentesPrevios.length > 0) {
    const { error: updateError } = await (supabase as any)
      .from('leads')
      .update({ etiqueta: ETIQUETA_PREVIO_PAGO })
      .in('id', idsExistentesPrevios);
    if (updateError) {
      console.error('[previo-pago/cargar] Error etiquetando leads existentes:', updateError);
    }
  }

  const leadIds = phones.map((p) => idPorPhone.get(p)).filter((id): id is number => typeof id === 'number');

  console.log(
    `[previo-pago/cargar] contactos=${items.length} nuevos=${nuevos.length} existentes=${idsExistentesPrevios.length} templateKey=${templateKey}`
  );

  const result = await queueLeadsForSend(supabase, leadIds, templateKey);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ...result, leads_nuevos: nuevos.length, leads_existentes: idsExistentesPrevios.length });
}
