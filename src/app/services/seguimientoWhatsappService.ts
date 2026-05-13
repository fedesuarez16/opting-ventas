import { createClient } from '@supabase/supabase-js';
import { getAllLeads } from './leadService';
import { Lead } from '../types';

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

export interface SeguimientoWhatsapp {
  phone: string;
  phone_from?: string;
  customer_name?: string;
  last_bot_message_at?: string;
  followup_30min_sent?: boolean | null;
  conversation_status?: string | null;
  lead_id?: string;
  lead_nombre?: string;
  lead_estado?: string;
  lead_phone?: string;
}

export interface SeguimientosWhatsappResult {
  pendientes: SeguimientoWhatsapp[];
  enviados: SeguimientoWhatsapp[];
}

const normalizePhone = (value: string | undefined | null): string => {
  if (!value) return '';
  return String(value).replace(/[^\d]/g, '').slice(-10);
};

// Replica la ventana del workflow "Opting - Seguimiento 30min":
// hoy 00:00 AR (UTC-3) y ayer 00:00 AR
const getArWindow = () => {
  const now = new Date();
  const arOffsetMs = 3 * 60 * 60 * 1000;
  const arNow = new Date(now.getTime() - arOffsetMs);
  const yyyy = arNow.getUTCFullYear();
  const mm = String(arNow.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(arNow.getUTCDate()).padStart(2, '0');
  const hoyARStart = new Date(`${yyyy}-${mm}-${dd}T00:00:00-03:00`);
  const ayerARStart = new Date(hoyARStart.getTime() - 24 * 60 * 60 * 1000);
  const hace24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return { hoyARStart, ayerARStart, hace24h };
};

const enrichWithLeads = (rows: SeguimientoWhatsapp[], leads: Lead[]): SeguimientoWhatsapp[] => {
  const leadsByPhone = new Map<string, Lead>();
  for (const l of leads) {
    const candidates = [
      (l as any).phone,
      (l as any).whatsapp_id,
      (l as any).phone_from,
      (l as any).telefono,
    ];
    for (const c of candidates) {
      const k = normalizePhone(c);
      if (k && !leadsByPhone.has(k)) leadsByPhone.set(k, l);
    }
  }
  return rows.map((s) => {
    const key = normalizePhone(s.phone);
    const lead = key ? leadsByPhone.get(key) : undefined;
    return {
      ...s,
      lead_id: lead?.id ? String(lead.id) : undefined,
      lead_nombre: (lead as any)?.nombreCompleto || (lead as any)?.nombre || undefined,
      lead_estado: (lead as any)?.estado || undefined,
      lead_phone: (lead as any)?.phone || (lead as any)?.whatsapp_id || undefined,
    };
  });
};

const filterByLastBotMessage = async (rows: SeguimientoWhatsapp[]): Promise<SeguimientoWhatsapp[]> => {
  if (rows.length === 0) return [];
  const phones = Array.from(new Set(rows.map((r) => r.phone).filter(Boolean)));
  if (phones.length === 0) return [];

  const { data, error } = await (getSupabase() as any)
    .from('chat_histories')
    .select('session_id, id, message')
    .in('session_id', phones)
    .order('id', { ascending: false });

  if (error || !data) {
    console.error('Error obteniendo chat_histories:', error?.message);
    return [];
  }

  const lastBySession = new Map<string, any>();
  for (const m of data) {
    if (!lastBySession.has(m.session_id)) lastBySession.set(m.session_id, m);
  }
  const phonesWithBotLast = new Set<string>();
  for (const [sid, m] of lastBySession) {
    const type = m?.message?.type;
    if (type === 'ai') phonesWithBotLast.add(sid);
  }

  return rows.filter((r) => phonesWithBotLast.has(r.phone));
};

export const getSeguimientosWhatsapp = async (): Promise<SeguimientosWhatsappResult> => {
  try {
    const { ayerARStart, hoyARStart, hace24h } = getArWindow();
    const lowerBound = ayerARStart.getTime() > hace24h.getTime() ? ayerARStart : hace24h;

    const [pendientesRes, enviadosRes] = await Promise.all([
      (getSupabase() as any)
        .from('seguimiento_whatsapp')
        .select('*')
        .or('followup_30min_sent.is.null,followup_30min_sent.eq.false')
        .gte('last_bot_message_at', lowerBound.toISOString())
        .lt('last_bot_message_at', hoyARStart.toISOString())
        .order('last_bot_message_at', { ascending: false }),
      (getSupabase() as any)
        .from('seguimiento_whatsapp')
        .select('*')
        .eq('followup_30min_sent', true)
        .order('last_bot_message_at', { ascending: false }),
    ]);

    if (pendientesRes.error) {
      console.error('Error obteniendo pendientes de seguimiento_whatsapp:', pendientesRes.error.message);
    }
    if (enviadosRes.error) {
      console.error('Error obteniendo enviados de seguimiento_whatsapp:', enviadosRes.error.message);
    }

    const pendientesRaw = ((pendientesRes.data || []) as SeguimientoWhatsapp[]).filter(
      (s) => !(typeof s.conversation_status === 'string' && s.conversation_status.startsWith('closed:'))
    );
    const enviadosRaw = (enviadosRes.data || []) as SeguimientoWhatsapp[];

    if (pendientesRaw.length === 0 && enviadosRaw.length === 0) {
      return { pendientes: [], enviados: [] };
    }

    let leads: Lead[] = [];
    try {
      leads = await getAllLeads();
    } catch (e) {
      console.error('No se pudieron cargar leads para enriquecer seguimiento_whatsapp:', e);
    }

    const pendientesEnriched = enrichWithLeads(pendientesRaw, leads);
    const enviadosEnriched = enrichWithLeads(enviadosRaw, leads);

    const pendientes = (await filterByLastBotMessage(pendientesEnriched)).sort((a, b) => {
      const ta = a.last_bot_message_at ? new Date(a.last_bot_message_at).getTime() : 0;
      const tb = b.last_bot_message_at ? new Date(b.last_bot_message_at).getTime() : 0;
      return ta - tb;
    });

    const enviados = enviadosEnriched.sort((a, b) => {
      const ta = a.last_bot_message_at ? new Date(a.last_bot_message_at).getTime() : 0;
      const tb = b.last_bot_message_at ? new Date(b.last_bot_message_at).getTime() : 0;
      return tb - ta;
    });

    return { pendientes, enviados };
  } catch (e) {
    console.error('Exception obteniendo seguimientos de seguimiento_whatsapp:', e);
    return { pendientes: [], enviados: [] };
  }
};
