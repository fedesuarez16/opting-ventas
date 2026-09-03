/**
 * Pedido de reseña a quien SÍ compró.
 *
 * El log de optingsha.com.ar/estado.log no distingue sólo abandonos: el teléfono que
 * aparece con estado `approved` completó el pago. Ese es el momento de pedirle la reseña,
 * y es exactamente la gente que el cron de recupero tiene que dejar en paz.
 *
 * Comparte el log, el horario y el motor de envío con el seguimiento de recupero
 * (`previoPagoSeguimiento.ts`): una sola bajada del log por corrida y ningún cron nuevo
 * que agendar en Vercel. Lo que cambia es la ventana (se mide desde la COMPRA, no desde
 * el primer intento), la etiqueta, la columna de marcado y la plantilla.
 */

import type { createClient } from '@supabase/supabase-js';
import { queueLeadsForSend, type BulkSendResult } from './bulkSendQueue';
import { ingestarLeadsPrevioPago } from './previoPagoIngest';
import type { PrevioPagoContacto } from './previoPagoLog';
import { fechaArgentina } from './previoPagoSeguimiento';
import { esPlantillaPendiente, getTemplateByKey } from './whatsapp-templates';

/** Key en WHATSAPP_TEMPLATES de la plantilla de pedido de reseña. */
export const TEMPLATE_KEY_RESENA_PREVIO_PAGO = 'previo_pago_resena';

/** Columna de `leads` que marca que ya se pidió la reseña. Timestamp, no booleano. */
export const COLUMNA_RESENA_ENVIADA = 'resena_previo_pago_enviada';

/**
 * Etiqueta de los leads creados a partir de una compra confirmada.
 *
 * Distinta de `previo_pago` a propósito: son dos poblaciones opuestas —el que abandonó y
 * el que compró— y el cron de recupero elige destinatarios justamente por etiqueta.
 */
export const ETIQUETA_PREVIO_PAGO_COMPRADOR = 'previo_pago_comprador';

/**
 * Cuántos días calendario argentinos hacia atrás mira la ventana de reseñas, contados
 * desde la COMPRA.
 *
 * Mismo criterio que la ingesta de recupero: hoy + ayer. El que pagó a las 22hs no llega a
 * ninguna corrida de su propio día, y sin el día anterior no recibiría el pedido nunca.
 * Más atrás que esto la reseña llega descolgada de la compra y rinde mucho menos.
 */
export const DIAS_COMPRA_RESENA = 2;

/**
 * El link de la reseña NO se configura desde acá, y no hay que agregar una env var para él.
 *
 * Va adentro del body de la plantilla HSM que aprueba Meta, y `buildTemplateBody` manda la
 * plantilla sin `components`: no hay forma de inyectarle una URL en tiempo de envío. Una
 * `RESENA_URL` configurable sería una mentira — la podrías cambiar sin que a nadie le
 * llegue un link distinto, porque el que sale es el que quedó congelado en la plantilla.
 *
 * O sea: el link tiene que estar DEFINITIVO antes de mandar la plantilla a aprobar.
 * Cambiarlo después es dar de alta una plantilla nueva. Ver `whatsapp-templates.ts`.
 */

/**
 * Ventana de servicio de WhatsApp, en horas. La define Meta, no nosotros: son 24hs desde el
 * último mensaje ENTRANTE de esa persona. Adentro se puede mandar texto libre, gratis y sin
 * plantilla aprobada; afuera, Meta lo rechaza y hay que usar sí o sí una plantilla.
 */
export const VENTANA_SERVICIO_HORAS = 24;

/** Texto que se manda. Es texto libre, así que se edita acá y sale en la corrida siguiente. */
export const TEXTO_RESENA =
  'Hola! Gracias por inscribirte al curso de Manipulación de Alimentos. ' +
  'Queremos saber cómo fue tu experiencia: dejanos tu reseña acá 👉 ' +
  'https://optingsha.com.ar/resena — nos toma un minuto y nos ayuda un montón. ¡Gracias!';

/** Pausa entre mensajes, mismo criterio que `bulkSendQueue`: no golpear el rate limit. */
const DELAY_ENTRE_ENVIOS_MS = 300;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Compradores cuya compra cayó en los últimos `dias` días calendario argentinos.
 *
 * Filtra por `fechaCompra` (primer `approved`), NO por `primerIntento`: el que entró el
 * lunes, falló dos veces y compró el jueves tiene `primerIntento` del lunes y quedaría
 * fuera de la ventana para siempre.
 *
 * El log escribe la fecha en hora local del servidor (AR) y sin offset, así que se compara
 * la parte `YYYY-MM-DD` contra el set de días AR: convertir a Date sería inventar un
 * timezone que el log no declara.
 *
 * Función pura.
 */
export function compradoresDeUltimosDias<T extends { fechaCompra?: string; compro: boolean }>(
  compradores: T[],
  now: Date = new Date(),
  dias: number = DIAS_COMPRA_RESENA
): T[] {
  const diasAr = new Set<string>();
  for (let i = 0; i < dias; i++) {
    diasAr.add(fechaArgentina(new Date(now.getTime() - i * DIA_MS)));
  }
  return compradores.filter(
    (c) => c.compro && !!c.fechaCompra && diasAr.has(c.fechaCompra.slice(0, 10))
  );
}

/** Últimos 10 dígitos, mismo criterio de matcheo de teléfonos que el resto del CRM. */
function ultimos10(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digitos = phone.replace(/\D/g, '');
  return digitos.length >= 8 ? digitos.slice(-10) : null;
}

/**
 * Parte una tanda de candidatos al recupero según quién ya compró, según el log.
 *
 * Es el parche a la fuga que tenía el cron: la fase de envío elige leads por etiqueta en la
 * tabla, sin volver a mirar el log. El que fue ingestado ayer como abandonado y compró hoy
 * a la mañana seguía recibiendo el "no completaste el pago" — y encima nunca la reseña,
 * porque quedaba marcado por la columna equivocada.
 *
 * El lead sin teléfono queda en `aRecuperar`: no se lo puede descartar sin evidencia, y el
 * motor de envío ya lo excluye más adelante si el número no sirve.
 *
 * Función pura.
 */
export function separarCompradores<T extends { phone?: string | null }>(
  candidatos: T[],
  compradores: Array<{ telefonoNormalizado: string }>
): { aRecuperar: T[]; yaCompraron: T[] } {
  const telefonosComprador = new Set(compradores.map((c) => c.telefonoNormalizado));
  const aRecuperar: T[] = [];
  const yaCompraron: T[] = [];

  for (const candidato of candidatos) {
    const key = ultimos10(candidato.phone);
    if (key && telefonosComprador.has(key)) yaCompraron.push(candidato);
    else aRecuperar.push(candidato);
  }

  return { aRecuperar, yaCompraron };
}

/**
 * Piso de la ventana de servicio, en ISO/UTC: sólo cuentan los mensajes entrantes desde acá.
 * Función pura.
 */
export function inicioVentanaServicio(
  now: Date = new Date(),
  horas: number = VENTANA_SERVICIO_HORAS
): string {
  return new Date(now.getTime() - horas * 60 * 60 * 1000).toISOString();
}

/**
 * Parte los candidatos entre los que tienen la ventana de servicio ABIERTA (escribieron en
 * las últimas 24hs) y los que no.
 *
 * El chequeo va ANTES de intentar el envío, y no es para ahorrarse el error de Meta: es para
 * no reclamar en `resena_previo_pago_enviada` a gente que no va a recibir nada. Un lead
 * marcado sin haber recibido el mensaje es peor que un lead sin marcar — el sin marcar
 * vuelve a entrar en la próxima corrida, el marcado no vuelve nunca.
 *
 * El `session_id` de `chat_histories` lo escribe n8n y no tiene formato garantizado (a veces
 * es el teléfono, a veces un JID `...@s.whatsapp.net`), así que el match es por los últimos
 * 10 dígitos, mismo criterio que el resto del CRM.
 *
 * El lead sin teléfono cae en `cerrados`: no se le puede mandar texto libre ni identificar su
 * conversación.
 *
 * Función pura.
 */
export function separarPorVentana<T extends { phone?: string | null }>(
  candidatos: T[],
  sesionesAbiertas: Array<{ session_id: string | null }>
): { abiertos: T[]; cerrados: T[] } {
  const telefonosAbiertos = new Set(
    sesionesAbiertas
      .map((s) => ultimos10(s.session_id))
      .filter((p): p is string => p !== null)
  );

  const abiertos: T[] = [];
  const cerrados: T[] = [];
  for (const candidato of candidatos) {
    const key = ultimos10(candidato.phone);
    if (key && telefonosAbiertos.has(key)) abiertos.push(candidato);
    else cerrados.push(candidato);
  }
  return { abiertos, cerrados };
}

export interface ResenaResult {
  compradores_en_ventana: number;
  leads_ingestados: number;
  candidatos: number;
  reclamados: number;
  enviados: number;
  desmarcados: number;
  warning?: string;
  envio?: BulkSendResult;
}

/**
 * Fase de reseñas de la corrida del cron: ingesta a los compradores recientes como leads y
 * les manda la plantilla con el link, una sola vez por persona.
 *
 * Mismo contrato de seguridad que el recupero, por las mismas razones:
 *   - marcado ANTES del envío y atómico (`IS NULL` en el WHERE) → un cron disparado dos
 *     veces no manda el mensaje duplicado;
 *   - si el encolado falla entero, se revierte la marca para reintentar en la próxima;
 *   - sólo se desmarcan los REINTENTABLES. Los excluidos por `ya_enviado`/`duplicado`
 *     quedan marcados: esa exclusión es la prueba de que la persona ya tiene el mensaje.
 *
 * No envía nada si la plantilla sigue siendo un placeholder: ver `esPlantillaPendiente`.
 */
export async function procesarResenasPrevioPago(
  supabase: ReturnType<typeof createClient>,
  compradores: PrevioPagoContacto[],
  { ahora = new Date(), dryRun = false }: { ahora?: Date; dryRun?: boolean } = {}
): Promise<ResenaResult> {
  const enVentana = compradoresDeUltimosDias(compradores, ahora);
  const vacio: ResenaResult = {
    compradores_en_ventana: enVentana.length,
    leads_ingestados: 0,
    candidatos: 0,
    reclamados: 0,
    enviados: 0,
    desmarcados: 0,
  };

  if (enVentana.length === 0) return vacio;

  // El chequeo va ANTES de la ingesta: sin plantilla real no hay nada que mandar, y crear
  // los leads igual los dejaría con la columna en NULL hasta que la plantilla exista — que
  // es justo lo que queremos. Pero no vale la pena escribir si no se puede enviar.
  const template = getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO);
  if (esPlantillaPendiente(template)) {
    return {
      ...vacio,
      warning: `La plantilla ${TEMPLATE_KEY_RESENA_PREVIO_PAGO} todavía es un placeholder (${template?.hsmName ?? 'no registrada'}); no se envió ninguna reseña`,
    };
  }

  // `etiquetarExistentes: false`: `etiqueta` es un campo libre que el equipo edita desde el
  // CRM y un cron no debería pisarlo. Los que ya existían igual entran al envío — la
  // ingesta devuelve TODOS los ids, no sólo los nuevos.
  const ingest = await ingestarLeadsPrevioPago(
    supabase,
    enVentana.map((c) => ({
      remoteJid: c.remoteJid,
      nombre: c.nombre,
      estados: c.estados,
      fechaCompra: c.fechaCompra,
    })),
    {
      etiquetarExistentes: false,
      dryRun,
      etiqueta: ETIQUETA_PREVIO_PAGO_COMPRADOR,
      mensajeInicial: (c) =>
        `Pago aprobado (${c.fechaCompra ?? 'fecha desconocida'}) — optingsha.com.ar/estado.log`,
    }
  );

  if ('error' in ingest) {
    return { ...vacio, warning: `ingesta de compradores falló: ${ingest.error}` };
  }

  if (dryRun) {
    return {
      ...vacio,
      leads_ingestados: ingest.nuevos,
      candidatos: ingest.leadIds.length + ingest.nuevos,
    };
  }

  // Claim atómico sobre los leads de la ventana (nuevos y preexistentes). Se filtra por
  // `IS NULL` acá y no en un SELECT previo para que dos corridas simultáneas no reclamen
  // la misma fila.
  const { data: reclamados, error: claimError } = await (supabase as any)
    .from('leads')
    .update({ [COLUMNA_RESENA_ENVIADA]: new Date().toISOString() })
    .in('id', ingest.leadIds)
    .is(COLUMNA_RESENA_ENVIADA, null)
    .select('id');

  if (claimError) {
    console.error('[previoPagoResena] CLAIM error', claimError);
    return {
      ...vacio,
      leads_ingestados: ingest.nuevos,
      candidatos: ingest.leadIds.length,
      warning: `no se pudo reclamar leads para reseña: ${claimError.message}`,
    };
  }

  const idsReclamados = (reclamados ?? []).map((r: any) => r.id as number);
  const base: ResenaResult = {
    ...vacio,
    leads_ingestados: ingest.nuevos,
    candidatos: ingest.leadIds.length,
    reclamados: idsReclamados.length,
  };
  if (idsReclamados.length === 0) return base;

  const result = await queueLeadsForSend(
    supabase,
    idsReclamados,
    TEMPLATE_KEY_RESENA_PREVIO_PAGO
  );

  if ('error' in result) {
    const { error: rollbackError } = await (supabase as any)
      .from('leads')
      .update({ [COLUMNA_RESENA_ENVIADA]: null })
      .in('id', idsReclamados);
    if (rollbackError) console.error('[previoPagoResena] ROLLBACK error', rollbackError);
    return { ...base, warning: `envío de reseñas falló: ${result.error}` };
  }

  let desmarcados = 0;
  if (result.lead_ids_reintentables.length > 0) {
    const { error: unmarkError } = await (supabase as any)
      .from('leads')
      .update({ [COLUMNA_RESENA_ENVIADA]: null })
      .in('id', result.lead_ids_reintentables);
    if (unmarkError) console.error('[previoPagoResena] error desmarcando reintentables', unmarkError);
    else desmarcados = result.lead_ids_reintentables.length;
  }

  return {
    ...base,
    enviados: result.total_enviado,
    desmarcados,
    envio: result,
    ...(result.warning ? { warning: result.warning } : {}),
  };
}
