import { createClient } from '@supabase/supabase-js';
import { getTemplateByKey } from '@/lib/whatsapp-templates';
import { isAllowedPhoneFrom } from '@/lib/whatsapp-lines';

const N8N_WEBHOOK_URL = 'https://mia-n8n.w9weud.easypanel.host/webhook/bulk-send';

export interface BulkSendCounts {
  estado_bloqueado: number;
  deriva_humano: number;
  phone_from_null: number;
  phone_from_invalido: number;
  duplicado: number;
}

export interface BulkSendResult {
  batch_id: string;
  total_seleccionado: number;
  total_efectivo: number;
  total_excluido: number;
  excluded_by_reason: BulkSendCounts;
  warning?: string;
}

export type BulkSendError = { error: string; status: number };

/**
 * Crea un batch en envios_masivos_batch, encola en cola_envio_masivo y dispara el
 * webhook de n8n que efectivamente manda los mensajes de WhatsApp (HSM aprobado por Meta).
 * Compartido entre /api/leads/bulk-send y /api/previo-pago/cargar para que las reglas de
 * exclusión (estado bloqueado, deriva a humano, línea inválida, duplicados) no diverjan.
 */
export async function queueLeadsForSend(
  supabase: ReturnType<typeof createClient>,
  leadIds: number[],
  templateKey: string
): Promise<BulkSendResult | BulkSendError> {
  if (leadIds.length === 0) {
    return { error: 'Sin leads seleccionados', status: 400 };
  }
  if (leadIds.length > 1000) {
    return { error: 'Máximo 1000 leads por envío', status: 400 };
  }
  const template = getTemplateByKey(templateKey);
  if (!template) {
    return { error: 'Plantilla inválida', status: 400 };
  }

  const { data: leadsData, error: leadsError } = await (supabase as any)
    .from('leads')
    .select('id, phone, phone_from, estado, deriva_humano')
    .in('id', leadIds);

  if (leadsError) {
    console.error('[bulkSendQueue] Error fetching leads:', leadsError);
    return { error: 'Error interno', status: 500 };
  }

  const counts: BulkSendCounts = {
    estado_bloqueado: 0,
    deriva_humano: 0,
    phone_from_null: 0,
    phone_from_invalido: 0,
    duplicado: 0,
  };

  const efectivos: Array<{ id: number; phone: string | null; phone_from: string | null }> = [];
  const excluidos: Array<{
    lead_id: number;
    phone: string | null;
    phone_from: string | null;
    exclusion_reason: string;
  }> = [];

  const seenPhones = new Set<string>();
  const sorted = [...(leadsData ?? [])].sort((a: any, b: any) => a.id - b.id);

  for (const lead of sorted as any[]) {
    if (lead.estado === 'llamada') {
      counts.estado_bloqueado++;
      excluidos.push({ lead_id: lead.id, phone: lead.phone, phone_from: lead.phone_from, exclusion_reason: 'estado_bloqueado' });
      continue;
    }
    if (lead.deriva_humano === true) {
      counts.deriva_humano++;
      excluidos.push({ lead_id: lead.id, phone: lead.phone, phone_from: lead.phone_from, exclusion_reason: 'deriva_humano' });
      continue;
    }
    if (!lead.phone_from) {
      counts.phone_from_null++;
      excluidos.push({ lead_id: lead.id, phone: lead.phone, phone_from: lead.phone_from, exclusion_reason: 'phone_from_null' });
      continue;
    }
    if (!isAllowedPhoneFrom(lead.phone_from)) {
      counts.phone_from_invalido++;
      excluidos.push({ lead_id: lead.id, phone: lead.phone, phone_from: lead.phone_from, exclusion_reason: 'phone_from_invalido' });
      continue;
    }
    if (lead.phone && seenPhones.has(lead.phone)) {
      counts.duplicado++;
      excluidos.push({ lead_id: lead.id, phone: lead.phone, phone_from: lead.phone_from, exclusion_reason: 'duplicado' });
      continue;
    }
    if (lead.phone) seenPhones.add(lead.phone);
    efectivos.push({ id: lead.id, phone: lead.phone, phone_from: lead.phone_from });
  }

  const { data: batchData, error: batchError } = await (supabase as any)
    .from('envios_masivos_batch')
    .insert({
      template_key: template.key,
      template_hsm_name: template.hsmName,
      template_language: template.language,
      total_seleccionado: leadIds.length,
      total_efectivo: efectivos.length,
      total_excluido: excluidos.length,
      status: 'procesando',
    })
    .select('id')
    .single();

  if (batchError || !batchData?.id) {
    console.error('[bulkSendQueue] Error creando batch:', batchError);
    return { error: 'Error interno', status: 500 };
  }

  const batchId: string = batchData.id;

  const colaRows = [
    ...efectivos.map((lead) => ({
      batch_id: batchId,
      lead_id: lead.id,
      phone: lead.phone,
      phone_from: lead.phone_from,
      template_key: template.key,
      template_hsm_name: template.hsmName,
      template_language: template.language,
      status: 'pendiente',
    })),
    ...excluidos.map((e) => ({
      batch_id: batchId,
      lead_id: e.lead_id,
      phone: e.phone,
      phone_from: e.phone_from,
      template_key: template.key,
      template_hsm_name: template.hsmName,
      template_language: template.language,
      status: 'excluido',
      exclusion_reason: e.exclusion_reason,
    })),
  ];

  const { error: colaError } = await (supabase as any).from('cola_envio_masivo').insert(colaRows);

  if (colaError) {
    console.error('[bulkSendQueue] Error insertando cola, revirtiendo batch:', colaError);
    await (supabase as any).from('envios_masivos_batch').delete().eq('id', batchId);
    return { error: 'Error interno', status: 500 };
  }

  let warning: string | undefined;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const webhookRes = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batch_id: batchId }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!webhookRes.ok) {
      warning = 'Cola creada pero webhook no respondió, revisar n8n';
      console.error(`[bulkSendQueue] Webhook n8n status=${webhookRes.status}`);
    }
  } catch (err) {
    warning = 'Cola creada pero webhook no respondió, revisar n8n';
    console.error('[bulkSendQueue] Webhook n8n error:', err);
  }

  console.log(
    `[bulkSendQueue] batch_id=${batchId} total=${leadIds.length} efectivo=${efectivos.length} excluido=${excluidos.length}${warning ? ` warning=${warning}` : ''}`
  );

  return {
    batch_id: batchId,
    total_seleccionado: leadIds.length,
    total_efectivo: efectivos.length,
    total_excluido: excluidos.length,
    excluded_by_reason: counts,
    ...(warning ? { warning } : {}),
  };
}
