import { createClient } from '@supabase/supabase-js';

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

export type EstadoLlamada = 'agendada' | 'realizada' | 'cancelada';

export interface LlamadaAgendada {
  id: string;
  lead_id: number | null;
  nombre_contacto: string | null;
  titulo: string;
  notas: string | null;
  inicio: string;
  fin: string;
  estado: EstadoLlamada;
  resultado: string | null;
  agente: string | null;
  agente_telefono: string | null;
  twilio_call_sid: string | null;
  estado_twilio: string | null;
  grabacion_url: string | null;
  created_at: string;
  updated_at: string;
  lead?: {
    id: number;
    nombre: string | null;
    phone: string | null;
  } | null;
}

export interface LlamadaInput {
  lead_id?: number | null;
  nombre_contacto?: string | null;
  titulo: string;
  notas?: string | null;
  inicio: string;
  fin: string;
  estado?: EstadoLlamada;
  resultado?: string | null;
  agente?: string | null;
  agente_telefono?: string | null;
}

const SELECT_WITH_LEAD = `
  id, lead_id, nombre_contacto, titulo, notas, inicio, fin, estado, resultado, agente,
  agente_telefono, twilio_call_sid, estado_twilio, grabacion_url,
  created_at, updated_at,
  lead:leads ( id, nombre, phone )
`;

export const getLlamadasInRange = async (
  rangeStart: Date,
  rangeEnd: Date,
): Promise<LlamadaAgendada[]> => {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any)
    .from('llamadas_agendadas')
    .select(SELECT_WITH_LEAD)
    .gte('inicio', rangeStart.toISOString())
    .lt('inicio', rangeEnd.toISOString())
    .order('inicio', { ascending: true });

  if (error) {
    console.error('[llamadasService.getLlamadasInRange]', error);
    throw error;
  }
  return (data ?? []) as LlamadaAgendada[];
};

export const getLlamadasByLead = async (leadId: number): Promise<LlamadaAgendada[]> => {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any)
    .from('llamadas_agendadas')
    .select(SELECT_WITH_LEAD)
    .eq('lead_id', leadId)
    .order('inicio', { ascending: false });

  if (error) {
    console.error('[llamadasService.getLlamadasByLead]', error);
    throw error;
  }
  return (data ?? []) as LlamadaAgendada[];
};

export const getLlamadasAll = async (estado?: EstadoLlamada): Promise<LlamadaAgendada[]> => {
  const supabase = getSupabase();
  let q = (supabase as any)
    .from('llamadas_agendadas')
    .select(SELECT_WITH_LEAD)
    .order('inicio', { ascending: false });
  if (estado) q = q.eq('estado', estado);
  const { data, error } = await q;
  if (error) {
    console.error('[llamadasService.getLlamadasAll]', error);
    throw error;
  }
  return (data ?? []) as LlamadaAgendada[];
};

export const createLlamada = async (input: LlamadaInput): Promise<LlamadaAgendada> => {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any)
    .from('llamadas_agendadas')
    .insert({
      lead_id: input.lead_id ?? null,
      nombre_contacto: input.nombre_contacto ?? null,
      titulo: input.titulo,
      notas: input.notas ?? null,
      inicio: input.inicio,
      fin: input.fin,
      estado: input.estado ?? 'agendada',
      resultado: input.resultado ?? null,
      agente: input.agente ?? null,
      agente_telefono: input.agente_telefono ?? null,
    })
    .select(SELECT_WITH_LEAD)
    .single();

  if (error) {
    console.error('[llamadasService.createLlamada]', error);
    throw error;
  }
  return data as LlamadaAgendada;
};

export const updateLlamada = async (
  id: string,
  patch: Partial<LlamadaInput>,
): Promise<LlamadaAgendada> => {
  const supabase = getSupabase();
  const { data, error } = await (supabase as any)
    .from('llamadas_agendadas')
    .update(patch)
    .eq('id', id)
    .select(SELECT_WITH_LEAD)
    .single();

  if (error) {
    console.error('[llamadasService.updateLlamada]', error);
    throw error;
  }
  return data as LlamadaAgendada;
};

export const deleteLlamada = async (id: string): Promise<void> => {
  const supabase = getSupabase();
  const { error } = await (supabase as any)
    .from('llamadas_agendadas')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[llamadasService.deleteLlamada]', error);
    throw error;
  }
};

export interface LeadLite {
  id: number;
  nombre: string | null;
  phone: string | null;
}

export const searchLeadsLite = async (query: string, limit = 25): Promise<LeadLite[]> => {
  const supabase = getSupabase();
  const trimmed = query.trim();

  let q = (supabase as any)
    .from('leads')
    .select('id, nombre, phone')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (trimmed.length > 0) {
    const safe = trimmed.replace(/[%,()]/g, ' ').trim();
    q = q.or(`nombre.ilike.%${safe}%,phone.ilike.%${safe}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[llamadasService.searchLeadsLite]', error);
    return [];
  }
  return (data ?? []) as LeadLite[];
};

export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  return `+${digits}`;
}

export function buildConversacionUrl(phone: string | null | undefined): string | null {
  const e164 = toE164(phone);
  if (!e164) return null;
  return `/chat?phoneNumber=${encodeURIComponent(e164)}`;
}
