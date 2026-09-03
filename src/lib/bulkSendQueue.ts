import { createClient } from '@supabase/supabase-js';
import { getTemplateByKey } from '@/lib/whatsapp-templates';
import { isAllowedPhoneFrom } from '@/lib/whatsapp-lines';
import { sendTemplate } from '@/lib/ycloudSender';
import { buildChatHistoryMessage } from '@/lib/chatHistory';

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
  /** Este lead ya recibió esta misma plantilla en una corrida anterior. */
  ya_enviado: number;
}

export type ExclusionReason = keyof BulkSendCounts;

/**
 * Exclusiones que significan "esta persona YA tiene el mensaje": no hay nada que
 * reintentar y el lead tiene que quedar marcado como contactado.
 *
 * `duplicado` entra acá porque la exclusión es por teléfono repetido dentro del mismo
 * lote: otro lead con ese mismo número sí recibió el mensaje, así que la persona lo tiene.
 *
 * El resto de las exclusiones son transitorias — `phone_from_*` y `linea_incompatible` se
 * arreglan corrigiendo el lead, y `estado_bloqueado`/`deriva_humano` dependen de un estado
 * que el equipo cambia desde el CRM — así que esos leads vuelven a la cola en la próxima
 * corrida.
 */
const EXCLUSIONES_DEFINITIVAS: ReadonlySet<string> = new Set<ExclusionReason>([
  'ya_enviado',
  'duplicado',
]);

/** Ver `EXCLUSIONES_DEFINITIVAS`. Función pura. */
export function esExclusionDefinitiva(reason: string): boolean {
  return EXCLUSIONES_DEFINITIVAS.has(reason);
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
  /**
   * Leads cuya persona quedó con el mensaje en la mano: se envió ahora, o ya lo tenía
   * (`ya_enviado`/`duplicado`). Quien lleve una columna de "seguimiento enviado" tiene que
   * marcarlos, incluso los que no generaron un envío en esta corrida.
   */
  lead_ids_contactados: number[];
  /**
   * Leads que no recibieron nada y podrían recibirlo más adelante: excluidos por un motivo
   * transitorio, o rechazados por Meta. Tienen que quedar SIN marcar para volver a entrar.
   */
  lead_ids_reintentables: number[];
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

  // Idempotencia: si este lead ya recibió ESTA plantilla antes (otra corrida del cron, un
  // doble click, una carga manual repetida), no se manda de nuevo. Sin esto, cualquier
  // solapamiento entre el cron y la carga manual —o un simple doble click— reenvía la
  // plantilla a gente que ya la recibió, incluso a quien ya contestó "no me interesa".
  const { data: yaEnviadosData, error: yaEnviadosError } = await (supabase as any)
    .from('cola_envio_masivo')
    .select('lead_id')
    .eq('template_key', templateKey)
    .eq('status', 'enviado')
    .in('lead_id', leadIds);

  if (yaEnviadosError) {
    console.error('[bulkSendQueue] Error chequeando envíos previos:', yaEnviadosError);
    return { error: 'Error interno', status: 500 };
  }
  const yaEnviados = new Set<number>((yaEnviadosData ?? []).map((r: any) => r.lead_id));

  const counts: BulkSendCounts = {
    estado_bloqueado: 0,
    deriva_humano: 0,
    phone_from_null: 0,
    phone_from_invalido: 0,
    duplicado: 0,
    linea_incompatible: 0,
    ya_enviado: 0,
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
    if (yaEnviados.has(lead.id)) {
      counts.ya_enviado++;
      excluidos.push({ lead_id: lead.id, phone: lead.phone, phone_from: lead.phone_from, exclusion_reason: 'ya_enviado' });
      continue;
    }
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
  const idsEnviados: number[] = [];
  const idsFallados: number[] = [];

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
      idsEnviados.push(fila.lead_id);
      const sentAt = new Date().toISOString();
      await (supabase as any)
        .from('cola_envio_masivo')
        .update({ status: 'enviado', sent_at: sentAt, ycloud_message_id: envio.messageId })
        .eq('id', fila.id);
      await registrarEnvioEnChatHistories(supabase, {
        phone: fila.phone,
        contenido: template.body || `[Plantilla enviada: ${template.displayName}]`,
        fecha: sentAt,
      });
    } else {
      totalFallado++;
      idsFallados.push(fila.lead_id);
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
    .update({
      status: totalFallado === 0 ? 'completado' : 'completado_con_errores',
      total_enviado: totalEnviado,
      total_fallado: totalFallado,
      completed_at: new Date().toISOString(),
    })
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
    lead_ids_contactados: [
      ...idsEnviados,
      ...excluidos.filter((e) => esExclusionDefinitiva(e.exclusion_reason)).map((e) => e.lead_id),
    ],
    lead_ids_reintentables: [
      ...idsFallados,
      ...excluidos.filter((e) => !esExclusionDefinitiva(e.exclusion_reason)).map((e) => e.lead_id),
    ],
    ...(primerError ? { primer_error: primerError } : {}),
    ...(warning ? { warning } : {}),
  };
}

/**
 * `/chat` no lee de Chatwoot (a pesar de lo que dice CLAUDE.md) — lee de `chat_histories`,
 * la misma tabla que llena el workflow de n8n con cada turno de conversación. Un envío que
 * pega directo a la API de YCloud nunca pasa por ahí, así que aunque el mensaje se mande de
 * verdad, la conversación no aparece en el CRM.
 *
 * No falla el envío si esto falla: el mensaje YA salió por WhatsApp: perder la fila de
 * historial es peor que no bloquear al usuario por un error de logging.
 */
async function registrarEnvioEnChatHistories(
  supabase: ReturnType<typeof createClient>,
  { phone, contenido, fecha }: { phone: string | null; contenido: string; fecha: string }
): Promise<void> {
  if (!phone) return;
  try {
    await (supabase as any).from('chat_histories').insert({
      session_id: phone,
      message: buildChatHistoryMessage({ phone, contenido, fecha }),
    });
  } catch (error) {
    console.error('[bulkSendQueue] no se pudo registrar en chat_histories:', error);
  }
}
