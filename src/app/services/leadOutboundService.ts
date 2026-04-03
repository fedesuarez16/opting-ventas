import { createClient } from '@supabase/supabase-js';
import { Lead, FilterOptions, LeadStatus } from '../types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string | undefined;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let supabaseClient: ReturnType<typeof createClient> | null = null;
const getSupabase = () => {
  if (supabaseClient) return supabaseClient;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars missing.');
  }
  supabaseClient = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseClient;
};

// Cache para filtrado en cliente (mismo patrón que leadService)
let cachedOutboundLeads: Lead[] = [];

const normalizeEstado = (estado: string | null | undefined): string => {
  if (!estado) return 'active';
  return estado.toLowerCase().trim();
};

/** Mapea una fila de leads_outbound a Lead para reutilizar la UI */
function mapOutboundRow(row: any): Lead {
  const estado = normalizeEstado(row.estado) || 'active';
  const phone = row.phone ?? '';
  const fechaContacto = row.last_interaction_at ?? row.created_at ?? new Date().toISOString();

  return {
    id: String(row.id),
    nombreCompleto: row.customer_name ?? '',
    email: '',
    telefono: phone,
    estado: estado as LeadStatus,
    presupuesto: 0,
    zonaInteres: '',
    tipoPropiedad: 'departamento',
    superficieMinima: 0,
    cantidadAmbientes: 0,
    motivoInteres: 'otro',
    fechaContacto,
    phone: phone.startsWith('+') ? phone : `+${phone}`,
    phone_from: row.phone_from ?? undefined,
    nombre: row.customer_name ?? undefined,
    ultima_interaccion: row.last_interaction_at ?? undefined,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? undefined,
    whatsapp_id: phone,
    chat_activo:
      row.chat_activo === 1 || row.chat_activo === '1'
        ? 1
        : row.chat_activo === 0 || row.chat_activo === '0'
          ? 0
          : undefined,
  } as Lead;
}

/** Obtiene todos los leads de leads_outbound */
export async function getAllOutboundLeads(): Promise<Lead[]> {
  try {
    const PAGE_SIZE = 1000;
    let allData: any[] = [];
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await getSupabase()
        .from('leads_outbound')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching leads_outbound:', error);
        return [];
      }
      const chunk = (data ?? []) as any[];
      allData = allData.concat(chunk);
      hasMore = chunk.length === PAGE_SIZE;
      from += PAGE_SIZE;
    }

    const normalized: Lead[] = allData.map(mapOutboundRow);
    normalized.sort((a, b) => new Date(b.fechaContacto).getTime() - new Date(a.fechaContacto).getTime());
    cachedOutboundLeads = normalized;
    return cachedOutboundLeads;
  } catch (e) {
    console.error('getAllOutboundLeads error:', e);
    return [];
  }
}

/** Filtra los leads outbound en memoria (por estado y opciones básicas) */
export function filterOutboundLeads(options: FilterOptions): Lead[] {
  return cachedOutboundLeads.filter((lead) => {
    if (options.estado && lead.estado !== options.estado) return false;
    return true;
  });
}

/** Estados únicos presentes en los leads outbound cargados */
export function getUniqueOutboundStatuses(): string[] {
  const set = new Set<string>();
  cachedOutboundLeads.forEach((l) => {
    const e = normalizeEstado(l.estado);
    if (e) set.add(e);
  });
  return Array.from(set).sort();
}

/**
 * Actualiza chat_activo en filas de leads_outbound cuyo phone coincide (mismo criterio que leads).
 * No lanza si no hay filas; errores de red/DB se registran y retornan false.
 */
export async function updateOutboundLeadChatActivoByPhone(
  phoneRaw: string | null | undefined,
  chatActivo: 0 | 1
): Promise<boolean> {
  try {
    const digits = String(phoneRaw || '')
      .replace(/@s\.whatsapp\.net/gi, '')
      .replace(/@c\.us/gi, '')
      .replace(/^WAID:/i, '')
      .replace(/^whatsapp:/i, '')
      .replace(/\D/g, '');
    if (!digits) {
      console.warn('updateOutboundLeadChatActivoByPhone: sin dígitos en teléfono');
      return false;
    }
    const v = chatActivo === 1 || String(chatActivo) === '1' ? 1 : 0;
    const toUpdate = { chat_activo: v, updated_at: new Date().toISOString() };
    // No usar .or(phone.eq.+digits): el "+" sin comillas rompe el parser de PostgREST (400).
    const phoneVariants = [`+${digits}`, digits];
    const qb = getSupabase().from('leads_outbound') as any;
    const { data, error } = await qb.update(toUpdate).in('phone', phoneVariants).select('id');

    if (error) {
      console.error('Error updating leads_outbound.chat_activo:', error);
      return false;
    }
    const rows = (data ?? []) as { id: string }[];
    if (rows.length === 0) {
      console.log(
        'leads_outbound: ninguna fila con phone coincidente para chat_activo (no es error)'
      );
      return false;
    }
    cachedOutboundLeads = cachedOutboundLeads.map((l) => {
      const ld = String(l.phone || l.telefono || '').replace(/\D/g, '');
      return ld === digits ? { ...l, chat_activo: v } : l;
    });
    return true;
  } catch (e) {
    console.error('updateOutboundLeadChatActivoByPhone error:', e);
    return false;
  }
}

/** Actualiza el estado de un lead en leads_outbound */
export async function updateOutboundLeadStatus(leadId: string, newStatus: string): Promise<boolean> {
  try {
    const qb = getSupabase().from('leads_outbound') as any;
    const { error } = await qb
      .update({ estado: newStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (error) {
      console.error('Error updating leads_outbound status:', error);
      return false;
    }
    cachedOutboundLeads = cachedOutboundLeads.map((l) =>
      String(l.id) === String(leadId) ? { ...l, estado: newStatus as LeadStatus } : l
    );
    return true;
  } catch (e) {
    console.error('updateOutboundLeadStatus error:', e);
    return false;
  }
}

/** Actualiza un lead outbound (customer_name, phone) */
export async function updateOutboundLead(leadId: string, data: { customer_name?: string; phone?: string }): Promise<Lead | null> {
  try {
    const toUpdate: any = { updated_at: new Date().toISOString() };
    if (data.customer_name !== undefined) toUpdate.customer_name = data.customer_name;
    if (data.phone !== undefined) toUpdate.phone = data.phone;

    const qb = getSupabase().from('leads_outbound') as any;
    const { data: updated, error } = await qb
      .update(toUpdate)
      .eq('id', leadId)
      .select()
      .single();

    if (error || !updated) return null;
    const lead = mapOutboundRow(updated);
    cachedOutboundLeads = cachedOutboundLeads.map((l) => (String(l.id) === String(leadId) ? lead : l));
    return lead;
  } catch (e) {
    console.error('updateOutboundLead error:', e);
    return null;
  }
}

/** Crea un lead outbound (phone obligatorio) */
export async function createOutboundLead(data: { phone: string; customer_name?: string; phone_from?: string }): Promise<Lead | null> {
  try {
    const digits = (data.phone || '').trim().replace(/\D/g, '');
    if (!digits) return null;
    const phone = `+${digits}`;
    const row = {
      phone,
      customer_name: (data.customer_name || '').trim() || null,
      phone_from: (data.phone_from || '').trim() || null,
      opt_in: false,
      respondio: false,
      estado: 'active',
    };
    const qb = getSupabase().from('leads_outbound') as any;
    const { data: inserted, error } = await qb
      .insert([row])
      .select()
      .single();
    if (error) {
      console.error('createOutboundLead error:', error);
      return null;
    }
    const lead = mapOutboundRow(inserted);
    cachedOutboundLeads = [lead, ...cachedOutboundLeads];
    return lead;
  } catch (e) {
    console.error('createOutboundLead error:', e);
    return null;
  }
}
