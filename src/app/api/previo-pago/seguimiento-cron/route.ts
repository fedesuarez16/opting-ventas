import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queueLeadsForSend } from '@/lib/bulkSendQueue';
import { ETIQUETA_PREVIO_PAGO } from '@/lib/previoPagoLog';
import { fetchResumenPrevioPago, ingestarLeadsPrevioPago } from '@/lib/previoPagoIngest';
import {
  TEMPLATE_KEY_SEGUIMIENTO_PREVIO_PAGO,
  COLUMNA_SEGUIMIENTO_ENVIADO,
  LOOKBACK_HORAS,
  inicioVentanaSeguimiento,
  contactosDeUltimosDias,
} from '@/lib/previoPagoSeguimiento';

export const dynamic = 'force-dynamic';

/**
 * Tope de queueLeadsForSend. El sobrante queda sin marcar y lo levanta la próxima corrida:
 * la ventana es rodante, así que sigue estando adentro mientras no pase `LOOKBACK_HORAS`.
 */
const MAX_POR_CORRIDA = 1000;

/** Días previos a la ventana que mira el diagnóstico de fugas (`vencidos_sin_enviar`). */
const DIAS_DIAGNOSTICO = 7;

let supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (supabaseClient) return supabaseClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase env vars faltantes');
  supabaseClient = createClient(url, key);
  return supabaseClient;
}

/**
 * Cron de seguimiento de previo pago. Corre DOS veces por día: 15hs y 21hs AR.
 *
 * Lo agenda Vercel Cron (`vercel.json`: `0 18 * * *` y `0 0 * * *` — los schedules de
 * Vercel son en UTC y Argentina es UTC-3, así que 21hs AR cae a las 00:00 UTC del día
 * siguiente). Vercel agrega solo el header `Authorization: Bearer $CRON_SECRET` tomándolo
 * de las env vars del proyecto, así que `CRON_SECRET` tiene que estar definida en Vercel
 * o este endpoint responde 401.
 *
 * La ventana de selección es RODANTE (`LOOKBACK_HORAS`), no el día calendario argentino.
 * Con el filtro por día, el lead que entraba entre las 21 y las 24hs no llegaba a ninguna
 * corrida de su propio día y al día siguiente ya quedaba fuera de la ventana: no recibía
 * la plantilla nunca. Ver `previoPagoSeguimiento.ts` para el detalle.
 *
 * Que la ventana se solape entre corridas no duplica envíos: el SELECT pide
 * `seguimiento_previo_pago_enviado IS NULL`, el claim es atómico, y `queueLeadsForSend`
 * además excluye por `ya_enviado` contra `cola_envio_masivo`.
 *
 * Corre en dos fases:
 *   1. Ingesta — baja el log, se queda con los que iniciaron el pago en los últimos
 *      `DIAS_INGESTA` días argentinos sin llegar a `approved`, y crea como lead a los que
 *      no existían.
 *   2. Envío — toma los leads `previo_pago` de la ventana rodante que todavía no
 *      recibieron el seguimiento, los marca y dispara el envío real.
 *
 * El marcado ocurre ANTES del envío y de forma atómica (`IS NULL` en el WHERE del
 * UPDATE): si el cron se dispara dos veces, la segunda corrida no reclama ninguna fila
 * y nadie recibe el mensaje duplicado. Si el encolado falla, se revierte la marca.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? '';
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  // `?dry=1` simula la corrida completa sin escribir ni enviar nada. Sirve para validar
  // el cron en producción antes de dejarlo suelto.
  const dryRun = req.nextUrl.searchParams.get('dry') === '1';

  const supabase = getSupabase();
  const ahora = new Date();
  const desde = inicioVentanaSeguimiento(ahora);
  const hasta = ahora.toISOString();

  // Fase 1 — ingesta: traer del log a los que abandonaron el pago hace poco y todavía no
  // existen como lead. Sin esto el cron dependería de que alguien cargue a mano desde
  // /previo-pago antes de las 15hs. Mira hoy Y ayer porque el que abandona de noche no
  // llega a ninguna corrida de su propio día. No toca leads existentes: `etiqueta` es un
  // campo libre que edita el equipo y un cron no debería pisarlo.
  let ingestados = 0;
  let logCaido = false;
  const resumen = await fetchResumenPrevioPago();
  if (!resumen) {
    logCaido = true;
  } else {
    const delDia = contactosDeUltimosDias(resumen.contactos, ahora);
    if (delDia.length > 0) {
      const ingest = await ingestarLeadsPrevioPago(
        supabase,
        delDia.map((c) => ({ remoteJid: c.remoteJid, nombre: c.nombre, estados: c.estados })),
        { etiquetarExistentes: false, dryRun }
      );
      if ('error' in ingest) {
        // La ingesta falló, pero los leads cargados a mano sí pueden salir: seguimos.
        console.error('[previo-pago/seguimiento-cron] ingesta falló:', ingest.error);
      } else {
        ingestados = ingest.nuevos;
      }
    }
  }

  // Fase 2 — envío. Sin tope superior de fecha a propósito: los leads que se acaban de
  // ingestar (y los que entren mientras corre esto) tienen que entrar en esta misma
  // corrida. Se ordena por `created_at` para que, si se llega al tope, salgan primero los
  // más viejos — que son los que están más cerca de caerse de la ventana.
  const { data: candidatos, error: selectError } = await (supabase as any)
    .from('leads')
    .select('id')
    .eq('etiqueta', ETIQUETA_PREVIO_PAGO)
    .gte('created_at', desde)
    .is(COLUMNA_SEGUIMIENTO_ENVIADO, null)
    .order('created_at', { ascending: true })
    .limit(MAX_POR_CORRIDA);

  if (selectError) {
    console.error('[previo-pago/seguimiento-cron] SELECT error', selectError);
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const ids = (candidatos ?? []).map((c: any) => c.id as number);

  // Alarma del último agujero que queda: un lead que se cae de la ventana rodante sin
  // haber recibido nunca la plantilla (log caído varios días seguidos, tope alcanzado
  // muchas corridas al hilo). Antes eso pasaba en silencio; ahora sale en el log del cron.
  // Se calcula siempre, también cuando no hay nada para enviar: justo ahí es cuando más
  // interesa saber si se está filtrando gente.
  const vencidos = await contarVencidosSinEnviar(supabase, desde);
  const warningVencidos =
    vencidos > 0
      ? [`${vencidos} leads previo_pago quedaron fuera de las ${LOOKBACK_HORAS}hs sin recibir la plantilla`]
      : [];

  if (dryRun) {
    // En dry la ingesta no escribió, así que los que se crearían todavía no están en
    // `ids`: el total que recibiría el mensaje es la suma de ambos.
    const totalDestinatarios = ids.length + ingestados;
    console.log(
      `[previo-pago/seguimiento-cron] DRY RUN ventana=${desde}→${hasta} ` +
        `se_crearian=${ingestados} ya_en_tabla=${ids.length} total=${totalDestinatarios}`
    );
    return NextResponse.json({
      dry_run: true,
      ventana: { desde, hasta, lookback_horas: LOOKBACK_HORAS },
      leads_que_se_crearian: ingestados,
      leads_ya_en_tabla_pendientes: ids.length,
      leads_que_recibirian_el_mensaje: totalDestinatarios,
      vencidos_sin_enviar: vencidos,
      nota: 'Simulación: no se creó ningún lead, no se marcó nada y no se envió ningún mensaje.',
      ...(logCaido || warningVencidos.length
        ? {
            warning: [
              ...(logCaido ? ['El log de previo pago no respondió'] : []),
              ...warningVencidos,
            ].join(' | '),
          }
        : {}),
    });
  }

  if (ids.length === 0) {
    console.log(
      `[previo-pago/seguimiento-cron] sin candidatos en ${desde} → ${hasta} (ingestados=${ingestados}${logCaido ? ', LOG_CAIDO' : ''})`
    );
    return NextResponse.json({
      ventana: { desde, hasta, lookback_horas: LOOKBACK_HORAS },
      ingestados,
      candidatos: 0,
      enviados: 0,
      vencidos_sin_enviar: vencidos,
      ...(logCaido || warningVencidos.length
        ? {
            warning: [
              ...(logCaido ? ['El log de previo pago no respondió; no hubo ingesta'] : []),
              ...warningVencidos,
            ].join(' | '),
          }
        : {}),
    });
  }

  const marcadoEn = new Date().toISOString();

  // Claim atómico: solo reclama las filas que siguen sin seguimiento enviado.
  const { data: reclamados, error: claimError } = await (supabase as any)
    .from('leads')
    .update({ [COLUMNA_SEGUIMIENTO_ENVIADO]: marcadoEn })
    .in('id', ids)
    .is(COLUMNA_SEGUIMIENTO_ENVIADO, null)
    .select('id');

  if (claimError) {
    console.error('[previo-pago/seguimiento-cron] CLAIM error', claimError);
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }

  const idsReclamados = (reclamados ?? []).map((r: any) => r.id as number);
  if (idsReclamados.length === 0) {
    return NextResponse.json({
      ventana: { desde, hasta, lookback_horas: LOOKBACK_HORAS },
      ingestados,
      candidatos: ids.length,
      enviados: 0,
      vencidos_sin_enviar: vencidos,
    });
  }

  const result = await queueLeadsForSend(
    supabase,
    idsReclamados,
    TEMPLATE_KEY_SEGUIMIENTO_PREVIO_PAGO
  );

  // El encolado falló entero: devolvemos las filas a NULL para reintentar mañana.
  if ('error' in result) {
    const { error: rollbackError } = await (supabase as any)
      .from('leads')
      .update({ [COLUMNA_SEGUIMIENTO_ENVIADO]: null })
      .in('id', idsReclamados);
    if (rollbackError) {
      console.error('[previo-pago/seguimiento-cron] ROLLBACK error', rollbackError);
    }
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Sólo se desmarcan los REINTENTABLES: los que no recibieron nada y podrían recibirlo si
  // cambia algo (teléfono corregido, estado del lead, error de Meta transitorio). Si
  // quedaran marcados, figurarían como contactados sin haber recibido nada.
  //
  // Los excluidos por `ya_enviado`/`duplicado` NO se desmarcan: esa exclusión es la prueba
  // de que la persona ya tiene el mensaje. Desmarcarlos —lo que hacía la versión anterior,
  // que trataba a todos los excluidos por igual— los dejaba en NULL para siempre: cada
  // corrida los volvía a reclamar, el motor los volvía a excluir y el cron los volvía a
  // desmarcar, y en el CRM figuraban como "sin seguimiento" habiendo recibido la plantilla.
  let desmarcados = 0;
  if (result.lead_ids_reintentables.length > 0) {
    const { error: unmarkError } = await (supabase as any)
      .from('leads')
      .update({ [COLUMNA_SEGUIMIENTO_ENVIADO]: null })
      .in('id', result.lead_ids_reintentables);
    if (unmarkError) {
      console.error('[previo-pago/seguimiento-cron] error desmarcando reintentables', unmarkError);
    } else {
      desmarcados = result.lead_ids_reintentables.length;
    }
  }

  const topeAlcanzado = ids.length === MAX_POR_CORRIDA;
  const warnings = [
    ...(logCaido ? ['El log de previo pago no respondió; no hubo ingesta'] : []),
    ...(topeAlcanzado
      ? [`Se alcanzó el tope de ${MAX_POR_CORRIDA} leads por corrida; el resto sale en la próxima`]
      : []),
    ...warningVencidos,
    ...(result.warning ? [result.warning] : []),
  ];

  console.log(
    `[previo-pago/seguimiento-cron] ventana=${desde}→${hasta} ingestados=${ingestados} ` +
      `candidatos=${ids.length} reclamados=${idsReclamados.length} ` +
      `efectivos=${result.total_efectivo} excluidos=${result.total_excluido} ` +
      `desmarcados=${desmarcados} vencidos=${vencidos}` +
      `${warnings.length ? ` warnings=${warnings.join(' | ')}` : ''}`
  );

  return NextResponse.json({
    ventana: { desde, hasta, lookback_horas: LOOKBACK_HORAS },
    ingestados,
    candidatos: ids.length,
    enviados: result.total_enviado,
    desmarcados,
    vencidos_sin_enviar: vencidos,
    ...result,
    ...(warnings.length ? { warning: warnings.join(' | ') } : {}),
  });
}

/**
 * Cuántos leads `previo_pago` quedaron con `seguimiento_previo_pago_enviado` en NULL y ya
 * son más viejos que la ventana rodante: gente que nunca va a recibir la plantilla.
 *
 * Se mira solo la semana justo anterior a la ventana, no toda la historia: los leads de
 * antes de que existiera este cron también tienen la columna en NULL y contarlos daría un
 * número enorme y constante que no dice nada. Acotado así, cualquier valor > 0 es una
 * fuga real y reciente.
 *
 * Es puro diagnóstico. Si falla, devuelve 0 y no rompe la corrida: el envío ya ocurrió y
 * no vale la pena tirar un 500 por una métrica.
 */
async function contarVencidosSinEnviar(
  supabase: ReturnType<typeof createClient>,
  desde: string
): Promise<number> {
  const piso = new Date(new Date(desde).getTime() - DIAS_DIAGNOSTICO * 24 * 60 * 60 * 1000);

  const { count, error } = await (supabase as any)
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('etiqueta', ETIQUETA_PREVIO_PAGO)
    .gte('created_at', piso.toISOString())
    .lt('created_at', desde)
    .is(COLUMNA_SEGUIMIENTO_ENVIADO, null);

  if (error) {
    console.error('[previo-pago/seguimiento-cron] error contando vencidos', error);
    return 0;
  }
  return count ?? 0;
}
