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

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { leadIds, templateKey } = body as Record<string, unknown>;

  if (!Array.isArray(leadIds) || leadIds.some((id) => typeof id !== 'number')) {
    return NextResponse.json({ error: 'leadIds inválido' }, { status: 400 });
  }
  if (typeof templateKey !== 'string' || !templateKey) {
    return NextResponse.json({ error: 'Plantilla inválida' }, { status: 400 });
  }

  console.log(`[bulk-send] leadIds.length=${leadIds.length} templateKey=${templateKey}`);

  const result = await queueLeadsForSend(getSupabase(), leadIds as number[], templateKey);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result);
}
