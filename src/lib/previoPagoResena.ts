/**
 * Pedido de reseña a quien SÍ compró.
 *
 * El log de optingsha.com.ar/estado.log no distingue sólo abandonos: el teléfono que
 * aparece con estado `approved` completó el pago. Ese es el momento de pedirle la reseña,
 * y es exactamente la gente que el cron de recupero tiene que dejar en paz.
 *
 * Comparte el log y el horario con el seguimiento de recupero (`previoPagoSeguimiento.ts`):
 * una sola bajada del log por corrida y ningún cron nuevo que agendar en Vercel. Lo que
 * cambia es la ventana (se mide desde la COMPRA, no desde el primer intento), la etiqueta y
 * la columna de marcado.
 *
 * El envío es una CASCADA de dos vías sobre poblaciones disjuntas, porque WhatsApp no deja
 * usar una sola para todos:
 *
 *   1. Ventana de servicio ABIERTA (escribió en las últimas 24hs) → texto libre con
 *      `sendText`. No necesita aprobación de Meta y no cuesta nada.
 *   2. Ventana CERRADA → plantilla aprobada vía `queueLeadsForSend`. Es la ÚNICA forma de
 *      alcanzarlos: fuera de las 24hs Meta rechaza todo lo que no sea un HSM aprobado.
 *
 * Nadie recibe las dos cosas: `separarPorVentana` parte la lista, y el claim de
 * `resena_previo_pago_enviada` es atómico y único por lead.
 *
 * Mientras `previo_pago_resena` siga siendo un placeholder, la vía 2 no envía ni marca a
 * nadie y avisa por qué. Esos leads quedan en NULL y vuelven a entrar en cada corrida, así
 * que el día que Meta apruebe la plantilla los levanta sola, sin backfill.
 */

import type { createClient } from '@supabase/supabase-js';
import { buildChatHistoryMessage } from './chatHistory';
import { queueLeadsForSend } from './bulkSendQueue';
import { PREVIO_PAGO_PHONE_FROM, ingestarLeadsPrevioPago } from './previoPagoIngest';
import type { PrevioPagoContacto } from './previoPagoLog';
import { fechaArgentina } from './previoPagoSeguimiento';
import { esPlantillaPendiente, getTemplateByKey } from './whatsapp-templates';
import { sendText } from './ycloudSender';

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
  'https://g.page/r/Cf2VgyVMnUb-EBE/review — nos toma un minuto y nos ayuda un montón. ¡Gracias!';

/** Pausa entre mensajes, mismo criterio que `bulkSendQueue`: no golpear el rate limit. */
const DELAY_ENTRE_ENVIOS_MS = 300;

/**
 * Tope de mensajes entrantes que se leen para armar la ventana de servicio.
 *
 * Existe porque PostgREST corta en 1000 filas por defecto y sin avisar. Se sube el techo y
 * además se avisa si se toca, que es la señal de que la ventana quedó incompleta.
 */
const MAX_SESIONES_VENTANA = 10000;

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
  /** Compradores del log dentro de la ventana de compra (`DIAS_COMPRA_RESENA`). */
  compradores_en_ventana: number;
  leads_ingestados: number;
  /** Leads enviables: con teléfono, sin derivar a humano y no en estado `llamada`. */
  candidatos: number;
  /** Compradores que no escribieron en 24hs: no se les puede mandar texto libre. */
  sin_ventana_abierta: number;
  reclamados: number;
  /** Total enviado por las dos vias. */
  enviados: number;
  /** Los que tenian la ventana de 24hs abierta: gratis, sin plantilla. */
  enviados_texto_libre: number;
  /** Los que estaban fuera de la ventana: unica via posible, HSM aprobado. */
  enviados_plantilla: number;
  fallados: number;
  desmarcados: number;
  warning?: string;
}

/**
 * Fase de reseñas de la corrida del cron: ingesta a los compradores recientes como leads y
 * les manda el pedido de reseña, una sola vez por persona.
 *
 * Va por TEXTO LIBRE, no por plantilla. WhatsApp deja mandar texto libre sin plantilla
 * aprobada mientras la persona haya escrito en las últimas `VENTANA_SERVICIO_HORAS`, y es
 * gratis. El precio es la cobertura: el que pagó en la web sin hablar nunca con el agente
 * NO tiene ventana abierta y no recibe nada. Para llegar a ese también hace falta la
 * plantilla `previo_pago_resena`, que sigue registrada y esperando aprobación de Meta.
 *
 * Contrato de seguridad, igual que el recupero:
 *   - se chequea la ventana ANTES de reclamar: marcar a alguien que no va a recibir nada lo
 *     saca de la cola para siempre, y es peor que dejarlo sin marcar;
 *   - marcado ANTES del envío y atómico (`IS NULL` en el WHERE) → un cron disparado dos
 *     veces no manda el mensaje duplicado;
 *   - los envíos que fallan se DESMARCAN para volver a entrar en la próxima corrida.
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
    sin_ventana_abierta: 0,
    reclamados: 0,
    enviados: 0,
    enviados_texto_libre: 0,
    enviados_plantilla: 0,
    fallados: 0,
    desmarcados: 0,
  };

  if (enVentana.length === 0) return vacio;

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
  if (ingest.leadIds.length === 0) {
    return { ...vacio, leads_ingestados: ingest.nuevos };
  }

  // Se traen los mismos campos que mira `bulkSendQueue` para excluir: un lead derivado a un
  // humano o en estado `llamada` no tiene que recibir un mensaje automático, tenga la
  // ventana abierta o no.
  const { data: leadsData, error: leadsError } = await (supabase as any)
    .from('leads')
    .select('id, phone, phone_from, estado, deriva_humano')
    .in('id', ingest.leadIds);

  if (leadsError) {
    console.error('[previoPagoResena] error trayendo leads', leadsError);
    return {
      ...vacio,
      leads_ingestados: ingest.nuevos,
      warning: `no se pudieron traer los leads: ${leadsError.message}`,
    };
  }

  const enviables = ((leadsData ?? []) as any[]).filter(
    (l) => l.estado !== 'llamada' && l.deriva_humano !== true && l.phone
  );

  // Ventana de servicio: sólo cuentan los mensajes ENTRANTES (`type = 'human'`) de las
  // últimas 24hs. Los salientes no abren ventana — si los contáramos, nuestro propio envío
  // la mantendría abierta para siempre.
  //
  // No se filtra por los teléfonos de los candidatos: `session_id` lo escribe n8n y a veces
  // es un JID (`549...@s.whatsapp.net`), así que un `.in('session_id', phones)` se comería
  // justo a esos. Se trae la ventana entera y se matchea en memoria por últimos 10 dígitos.
  //
  // El `limit` explícito es la parte importante: PostgREST corta en 1000 filas por defecto y
  // lo hace EN SILENCIO. Con más de 1000 mensajes entrantes en 24hs —perfectamente posible en
  // este volumen— se perderían sesiones y esa gente quedaría marcada como "sin ventana"
  // habiéndola tenido abierta.
  const { data: sesiones, error: sesionesError } = await (supabase as any)
    .from('chat_histories')
    .select('session_id')
    .eq('message->>type', 'human')
    .gte('created_at', inicioVentanaServicio(ahora))
    .limit(MAX_SESIONES_VENTANA);

  if (sesionesError) {
    console.error('[previoPagoResena] error leyendo ventana de servicio', sesionesError);
    return {
      ...vacio,
      leads_ingestados: ingest.nuevos,
      candidatos: enviables.length,
      warning: `no se pudo determinar la ventana de 24hs: ${sesionesError.message}`,
    };
  }

  const filasSesiones = (sesiones ?? []) as any[];
  const { abiertos, cerrados } = separarPorVentana(enviables, filasSesiones);

  // Si se tocó el tope, la ventana que leímos está recortada: puede haber gente con la
  // conversación abierta que no vimos. Se avisa en vez de dar el resultado por bueno.
  const avisoVentanaRecortada =
    filasSesiones.length >= MAX_SESIONES_VENTANA
      ? `Se leyeron ${MAX_SESIONES_VENTANA} mensajes entrantes (tope): la ventana de 24hs puede estar incompleta y algún comprador con conversación abierta puede haber quedado sin reseña`
      : undefined;

  const base: ResenaResult = {
    ...vacio,
    leads_ingestados: ingest.nuevos,
    candidatos: enviables.length,
    sin_ventana_abierta: cerrados.length,
  };

  // Los avisos estructurales viajan en TODAS las salidas de aca para abajo. Armarlos una vez
  // y adjuntarlos con `conAvisos` evita el bug clasico de que un `return` temprano se olvide
  // de uno y el cron reporte una corrida limpia que en realidad quedo coja.
  const avisosBase = avisoVentanaRecortada ? [avisoVentanaRecortada] : [];
  const conAvisos = (resultado: ResenaResult, extra: string[] = []): ResenaResult => {
    const todos = [...avisosBase, ...extra];
    return todos.length ? { ...resultado, warning: todos.join(' | ') } : resultado;
  };

  if (dryRun) {
    return conAvisos({
      ...base,
      reclamados: abiertos.length + (esPlantillaPendiente(getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO)) ? 0 : cerrados.length),
    });
  }

  // Cascada de dos vias sobre poblaciones DISJUNTAS: nadie puede recibir las dos cosas,
  // porque `separarPorVentana` ya los partio y ademas el claim de
  // `resena_previo_pago_enviada` es atomico y unico por lead.
  //   1. ventana de 24hs abierta -> texto libre, gratis y sin esperar a Meta
  //   2. ventana cerrada         -> plantilla aprobada, unica forma de alcanzarlos
  const libre = await enviarTextoLibre(supabase, abiertos);
  const plantilla = await enviarPorPlantilla(supabase, cerrados);

  return conAvisos(
    {
      ...base,
      reclamados: libre.reclamados + plantilla.reclamados,
      enviados: libre.enviados + plantilla.enviados,
      enviados_texto_libre: libre.enviados,
      enviados_plantilla: plantilla.enviados,
      fallados: libre.fallados + plantilla.fallados,
      desmarcados: libre.desmarcados + plantilla.desmarcados,
    },
    [...libre.warnings, ...plantilla.warnings]
  );
}

interface EnvioParcial {
  reclamados: number;
  enviados: number;
  fallados: number;
  desmarcados: number;
  warnings: string[];
}

const SIN_ENVIO: EnvioParcial = {
  reclamados: 0,
  enviados: 0,
  fallados: 0,
  desmarcados: 0,
  warnings: [],
};

/** Reclama leads de forma atomica. Devuelve las filas efectivamente ganadas por esta corrida. */
async function reclamar(
  supabase: ReturnType<typeof createClient>,
  ids: number[]
): Promise<{ filas: any[]; error?: string }> {
  const { data, error } = await (supabase as any)
    .from('leads')
    .update({ [COLUMNA_RESENA_ENVIADA]: new Date().toISOString() })
    .in('id', ids)
    .is(COLUMNA_RESENA_ENVIADA, null)
    .select('id, phone, phone_from');
  if (error) {
    console.error('[previoPagoResena] CLAIM error', error);
    return { filas: [], error: error.message };
  }
  return { filas: (data ?? []) as any[] };
}

/** Deja en NULL a los leads que no recibieron nada, para que vuelvan a entrar. */
async function desmarcar(
  supabase: ReturnType<typeof createClient>,
  ids: number[]
): Promise<number> {
  if (ids.length === 0) return 0;
  const { error } = await (supabase as any)
    .from('leads')
    .update({ [COLUMNA_RESENA_ENVIADA]: null })
    .in('id', ids);
  if (error) {
    console.error('[previoPagoResena] error desmarcando', error);
    return 0;
  }
  return ids.length;
}

/**
 * Via 1: texto libre a quienes tienen la ventana de servicio abierta. Gratis y sin plantilla.
 */
async function enviarTextoLibre(
  supabase: ReturnType<typeof createClient>,
  abiertos: Array<{ id: number }>
): Promise<EnvioParcial> {
  if (abiertos.length === 0) return SIN_ENVIO;

  const { filas, error } = await reclamar(supabase, abiertos.map((l) => l.id));
  if (error) return { ...SIN_ENVIO, warnings: [`no se pudo reclamar para texto libre: ${error}`] };
  if (filas.length === 0) return SIN_ENVIO;

  let enviados = 0;
  const idsFallados: number[] = [];
  let primerError: string | undefined;

  // Fila por fila para que un fallo puntual no arrastre al resto, igual que `bulkSendQueue`.
  for (let i = 0; i < filas.length; i++) {
    const fila = filas[i];
    const envio = await sendText({
      from: fila.phone_from ?? PREVIO_PAGO_PHONE_FROM,
      phone: fila.phone,
      texto: TEXTO_RESENA,
    });

    if (envio.ok) {
      enviados++;
      await registrarEnChatHistories(supabase, fila.phone, new Date().toISOString());
    } else {
      idsFallados.push(fila.id);
      if (!primerError) primerError = envio.error;
      console.error(`[previoPagoResena] fallo texto libre lead_id=${fila.id}: ${envio.error}`);
    }

    if (i < filas.length - 1) {
      await new Promise((r) => setTimeout(r, DELAY_ENTRE_ENVIOS_MS));
    }
  }

  // Los fallados se desmarcan: no recibieron nada y tienen que volver a entrar. Un fallo aca
  // suele ser la ventana cerrada entre el chequeo y el envio, o un telefono invalido.
  const desmarcados = await desmarcar(supabase, idsFallados);

  return {
    reclamados: filas.length,
    enviados,
    fallados: idsFallados.length,
    desmarcados,
    warnings: idsFallados.length
      ? [`${idsFallados.length} envios de texto libre fallaron: ${primerError}`]
      : [],
  };
}

/**
 * Via 2: plantilla aprobada a quienes tienen la ventana CERRADA. Es la unica forma de
 * alcanzarlos: fuera de las 24hs Meta rechaza cualquier mensaje que no sea un HSM aprobado.
 *
 * Mientras la plantilla siga siendo un placeholder, esto no envia ni marca a nadie y avisa
 * por que. Esos leads quedan en NULL y vuelven a entrar en la corrida siguiente, asi que el
 * dia que se apruebe la plantilla los levanta sin necesidad de backfill.
 */
async function enviarPorPlantilla(
  supabase: ReturnType<typeof createClient>,
  cerrados: Array<{ id: number }>
): Promise<EnvioParcial> {
  if (cerrados.length === 0) return SIN_ENVIO;

  const template = getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO);
  if (esPlantillaPendiente(template)) {
    return {
      ...SIN_ENVIO,
      warnings: [
        `${cerrados.length} compradores sin ventana de 24hs quedan sin resena: la plantilla ` +
          `${TEMPLATE_KEY_RESENA_PREVIO_PAGO} todavia es un placeholder ` +
          `(${template?.hsmName ?? 'no registrada'}). Setea PREVIO_PAGO_RESENA_HSM y los levanta la corrida siguiente`,
      ],
    };
  }

  const { filas, error } = await reclamar(supabase, cerrados.map((l) => l.id));
  if (error) return { ...SIN_ENVIO, warnings: [`no se pudo reclamar para plantilla: ${error}`] };
  if (filas.length === 0) return SIN_ENVIO;

  const result = await queueLeadsForSend(
    supabase,
    filas.map((f) => f.id),
    TEMPLATE_KEY_RESENA_PREVIO_PAGO
  );

  // Fallo el encolado entero: se devuelve todo a NULL para reintentar en la proxima corrida.
  if ('error' in result) {
    await desmarcar(supabase, filas.map((f) => f.id));
    return { ...SIN_ENVIO, warnings: [`envio por plantilla fallo: ${result.error}`] };
  }

  // Solo se desmarcan los REINTENTABLES. Los excluidos por `ya_enviado`/`duplicado` quedan
  // marcados: esa exclusion es la prueba de que la persona ya tiene el mensaje.
  const desmarcados = await desmarcar(supabase, result.lead_ids_reintentables);

  return {
    reclamados: filas.length,
    enviados: result.total_enviado,
    fallados: result.total_fallado,
    desmarcados,
    warnings: result.warning ? [result.warning] : [],
  };
}

/**
 * Deja el mensaje en `chat_histories` para que aparezca en `/chat` y quede en la memoria del
 * agente de n8n.
 *
 * Acá es MÁS importante que en `bulkSendQueue`: el texto libre entra en una conversación
 * viva. Si el agente no ve que le mandamos esto, puede repetirlo o contestar cualquier cosa
 * cuando la persona responda a la reseña.
 *
 * No falla el envío si esto falla: el mensaje YA salió por WhatsApp.
 */
async function registrarEnChatHistories(
  supabase: ReturnType<typeof createClient>,
  phone: string | null,
  fecha: string
): Promise<void> {
  if (!phone) return;
  try {
    await (supabase as any).from('chat_histories').insert({
      session_id: phone,
      message: buildChatHistoryMessage({ phone, contenido: TEXTO_RESENA, fecha }),
    });
  } catch (error) {
    console.error('[previoPagoResena] no se pudo registrar en chat_histories:', error);
  }
}
