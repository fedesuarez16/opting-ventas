import { createClient } from '@supabase/supabase-js';
import { getTemplateByKey } from '@/lib/whatsapp-templates';
import { isAllowedPhoneFrom } from '@/lib/whatsapp-lines';
import { sendTemplate } from '@/lib/ycloudSender';

/** Pausa entre mensajes para no golpear el rate limit de YCloud. */
const DELAY_ENTRE_ENVIOS_MS = 300;

export interface BulkSendCounts {
  estado_bloqueado: number;
  deriva_humano: number;
  phone_from_null: number;
  phone_from_invalido: number;
  duplicado: number;
  /** La plantilla vive en otra WABA que la línea del lead: YCloud la rechazaría. */
  linea_incompatible: number;
}

export interface BulkSendResult {
  batch_id: string;
  total_seleccionado: number;
  total_efectivo: number;
  total_excluido: number;
  excluded_by_reason: BulkSendCounts;
  /** Mensajes que Meta aceptó. */
  total_enviado: number;
  /** Mensajes que Meta rechazó, con el motivo del primero. */
  total_fallado: number;
  primer_error?: string;
  warning?: string;
}

export type BulkSendError = { error: string; status: number };

/**
 * Crea un batch en envios_masivos_batch, encola en cola_envio_masivo y manda los mensajes
 * de WhatsApp (HSM aprobado por Meta) contra la Cloud API, sin pasar por n8n.
 *
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
    linea_incompatible: 0,
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
    // La plantilla vive en la WABA de una línea concreta: mandarla desde la otra da 403.
    // Se excluye acá en vez de dejar que YCloud lo rechace mensaje por mensaje.
    if (template.phoneFrom && lead.phone_from !== template.phoneFrom) {
      counts.linea_incompatible++;
      excluidos.push({ lead_id: lead.id, phone: lead.phone, phone_from: lead.phone_from, exclusion_reason: 'linea_incompatible' });
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

  const { data: colaInsertada, error: colaError } = await (supabase as any)
    .from('cola_envio_masivo')
    .insert(colaRows)
    .select('id, lead_id, phone, status');

  if (colaError) {
    console.error('[bulkSendQueue] Error insertando cola, revirtiendo batch:', colaError);
    await (supabase as any).from('envios_masivos_batch').delete().eq('id', batchId);
    return { error: 'Error interno', status: 500 };
  }

  // Envío real contra la Cloud API, fila por fila: cada mensaje actualiza su propia fila
  // para que un fallo puntual no arrastre al resto del batch.
  const pendientes = ((colaInsertada ?? []) as any[]).filter((r) => r.status === 'pendiente');
  const phoneFromPorFila = new Map<number, string | null>();
  for (const lead of efectivos) phoneFromPorFila.set(lead.id, lead.phone_from);

  let totalEnviado = 0;
  let totalFallado = 0;
  let primerError: string | undefined;

  for (let i = 0; i < pendientes.length; i++) {
    const fila = pendientes[i];
    const envio = await sendTemplate({
      from: template.phoneFrom ?? phoneFromPorFila.get(fila.lead_id) ?? null,
      phone: fila.phone,
      templateName: template.hsmName,
      language: template.language,
    });

    if (envio.ok) {
      totalEnviado++;
      await (supabase as any)
        .from('cola_envio_masivo')
        .update({ status: 'enviado', sent_at: new Date().toISOString(), ycloud_message_id: envio.messageId })
        .eq('id', fila.id);
    } else {
      totalFallado++;
      if (!primerError) primerError = envio.error;
      console.error(`[bulkSendQueue] fallo lead_id=${fila.lead_id}: ${envio.error}`);
      await (supabase as any)
        .from('cola_envio_masivo')
        .update({ status: 'fallado', error_message: envio.error })
        .eq('id', fila.id);
    }

    if (i < pendientes.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_ENTRE_ENVIOS_MS));
    }
  }

  await (supabase as any)
    .from('envios_masivos_batch')
    .update({ status: totalFallado === 0 ? 'completado' : 'completado_con_errores' })
    .eq('id', batchId);

  const warning =
    totalFallado > 0 ? `${totalFallado} de ${pendientes.length} fallaron: ${primerError}` : undefined;

  console.log(
    `[bulkSendQueue] batch_id=${batchId} total=${leadIds.length} efectivo=${efectivos.length} ` +
      `excluido=${excluidos.length} enviado=${totalEnviado} fallado=${totalFallado}` +
      `${primerError ? ` primer_error=${primerError}` : ''}`
  );

  return {
    batch_id: batchId,
    total_seleccionado: leadIds.length,
    total_efectivo: efectivos.length,
    total_excluido: excluidos.length,
    excluded_by_reason: counts,
    total_enviado: totalEnviado,
    total_fallado: totalFallado,
    ...(primerError ? { primer_error: primerError } : {}),
    ...(warning ? { warning } : {}),
  };
}
