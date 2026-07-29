import { createClient } from '@supabase/supabase-js';
import type { PrevioPagoResumen } from '@/lib/previoPagoLog';
import type { BulkSendResult } from '@/lib/bulkSendQueue';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let supabaseClient: ReturnType<typeof createClient> | null = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing. Define NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

export type { PrevioPagoResumen, PrevioPagoContacto } from '@/lib/previoPagoLog';

export const ETIQUETA_PREVIO_PAGO = 'previo_pago';

export const getPrevioPagoResumen = async (): Promise<PrevioPagoResumen> => {
  const res = await fetch('/api/previo-pago', { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`No se pudo obtener el log de previo pago (${res.status})`);
  }
  return res.json();
};

/**
 * leads.phone se guarda con formato +549XXXXXXXXXX, así que para saber si un contacto ya
 * fue cargado como lead 'previo_pago' comparamos por los últimos 10 dígitos.
 */
export const getPhonesYaCargados = async (): Promise<Set<string>> => {
  const normalizados = new Set<string>();
  const { data, error } = await (getSupabase() as any)
    .from('leads')
    .select('phone')
    .eq('etiqueta', ETIQUETA_PREVIO_PAGO);

  if (error) {
    console.error('Error obteniendo leads previo_pago:', error.message);
    return normalizados;
  }
  for (const row of data ?? []) {
    const digitos = String(row.phone ?? '').replace(/\D/g, '');
    if (digitos.length >= 8) normalizados.add(digitos.slice(-10));
  }
  return normalizados;
};

export type CargarPrevioPagoResultado =
  | (BulkSendResult & { success: true; leads_nuevos: number; leads_existentes: number })
  | { success: false; error: string };

/**
 * Crea/etiqueta los leads de previo pago y dispara el envío real (mismo mecanismo que
 * "Envíos masivos": encola en cola_envio_masivo y llama al webhook de n8n que manda los
 * mensajes). No hay "programar para después": el envío arranca apenas se confirma.
 */
export const cargarPrevioPago = async (
  contactos: { remoteJid: string; nombre?: string; estados?: string[] }[],
  templateKey: string
): Promise<CargarPrevioPagoResultado> => {
  if (contactos.length === 0) return { success: false, error: 'Sin contactos seleccionados' };
  if (!templateKey.trim()) return { success: false, error: 'Falta la plantilla' };

  const res = await fetch('/api/previo-pago/cargar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactos, templateKey }),
  });
  const json = await res.json();
  if (!res.ok) {
    return { success: false, error: json.error || 'Error desconocido' };
  }
  return { success: true, ...json };
};
