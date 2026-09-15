import { createClient } from '@supabase/supabase-js';

let client: ReturnType<typeof createClient> | null = null;

/** Cliente Supabase para route handlers. Singleton por proceso, como el resto del proyecto. */
export function getSupabaseServer() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars faltantes');
  client = createClient(url, key);
  return client;
}
