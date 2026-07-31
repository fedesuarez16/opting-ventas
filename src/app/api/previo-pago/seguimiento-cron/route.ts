import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queueLeadsForSend } from '@/lib/bulkSendQueue';
import { ETIQUETA_PREVIO_PAGO } from '@/lib/previoPagoLog';
import { fetchResumenPrevioPago, ingestarLeadsPrevioPago } from '@/lib/previoPagoIngest';
import {
  TEMPLATE_KEY_SEGUIMIENTO_PREVIO_PAGO,
  COLUMNA_SEGUIMIENTO_ENVIADO,
  ventanaDiaArgentina,
  contactosDelDiaArgentino,
} from '@/lib/previoPagoSeguimiento';

export const dynamic = 'force-dynamic';

/** Tope de queueLeadsForSend. Si un día entran más, el resto queda sin marcar para la próxima. */
const MAX_POR_CORRIDA = 1000;

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
 * Cron de seguimiento de previo pago. Se dispara una vez por día a las 15hs AR.
 *
 * Lo agenda Vercel Cron (`vercel.json`, `0 18 * * *` — los schedules de Vercel son en
 * UTC y Argentina es UTC-3). Vercel agrega solo el header `Authorization: Bearer
 * $CRON_SECRET` tomándolo de las env vars del proyecto, así que `CRON_SECRET` tiene que
 * estar definida en Vercel o este endpoint responde 401.
 *
 * Corre en dos fases:
 *   1. Ingesta — baja el log, se queda con los que iniciaron el pago HOY (día calendario
 *      argentino) sin llegar a `approved`, y crea como lead a los que no existían.
 *   2. Envío — toma los leads `previo_pago` que entraron HOY y todavía no recibieron el
 *      seguimiento, los marca y dispara el envío real.
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
  const { desde, hasta } = ventanaDiaArgentina(ahora);

  // Fase 1 — ingesta: traer del log a los que abandonaron el pago HOY y todavía no
  // existen como lead. Sin esto el cron dependería de que alguien cargue a mano desde
  // /previo-pago antes de las 15hs. No toca leads existentes: si ya estaban, no
  // "entraron hoy", y `etiqueta` es un campo libre que edita el equipo.
  let ingestados = 0;
  let logCaido = false;
  const resumen = await fetchResumenPrevioPago();
  if (!resumen) {
    logCaido = true;
  } else {
    const delDia = contactosDelDiaArgentino(resumen.contactos, ahora);
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

  // Fase 2 — envío.
  const { data: candidatos, error: selectError } = await (supabase as any)
    .from('leads')
    .select('id')
    .eq('etiqueta', ETIQUETA_PREVIO_PAGO)
    .gte('created_at', desde)
    .lt('created_at', hasta)
    .is(COLUMNA_SEGUIMIENTO_ENVIADO, null)
    .limit(MAX_POR_CORRIDA);

  if (selectError) {
    console.error('[previo-pago/seguimiento-cron] SELECT error', selectError);
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const ids = (candidatos ?? []).map((c: any) => c.id as number);

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
      ventana: { desde, hasta },
      leads_que_se_crearian: ingestados,
      leads_ya_en_tabla_pendientes: ids.length,
      leads_que_recibirian_el_mensaje: totalDestinatarios,
      nota: 'Simulación: no se creó ningún lead, no se marcó nada y no se envió ningún mensaje.',
      ...(logCaido ? { warning: 'El log de previo pago no respondió' } : {}),
    });
  }

  if (ids.length === 0) {
    console.log(
      `[previo-pago/seguimiento-cron] sin candidatos en ${desde} → ${hasta} (ingestados=${ingestados}${logCaido ? ', LOG_CAIDO' : ''})`
    );
    return NextResponse.json({
      ventana: { desde, hasta },
      ingestados,
      candidatos: 0,
      enviados: 0,
      ...(logCaido ? { warning: 'El log de previo pago no respondió; no hubo ingesta' } : {}),
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
      ventana: { desde, hasta },
      ingestados,
      candidatos: ids.length,
      enviados: 0,
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

  // Los que no recibieron el mensaje —excluidos por las reglas del motor, o rechazados
  // por Meta— tienen que volver a NULL: si quedan marcados, figuran como contactados sin
  // haber recibido nada y no entran nunca más.
  let desmarcados = 0;
  if (result.total_excluido > 0 || result.total_fallado > 0) {
    const { data: excluidos, error: excluidosError } = await (supabase as any)
      .from('cola_envio_masivo')
      .select('lead_id')
      .eq('batch_id', result.batch_id)
      .in('status', ['excluido', 'fallado']);

    if (excluidosError) {
      console.error('[previo-pago/seguimiento-cron] error leyendo excluidos', excluidosError);
    } else {
      const idsExcluidos = (excluidos ?? []).map((e: any) => e.lead_id as number);
      if (idsExcluidos.length > 0) {
        const { error: unmarkError } = await (supabase as any)
          .from('leads')
          .update({ [COLUMNA_SEGUIMIENTO_ENVIADO]: null })
          .in('id', idsExcluidos);
        if (unmarkError) {
          console.error('[previo-pago/seguimiento-cron] error desmarcando excluidos', unmarkError);
        } else {
          desmarcados = idsExcluidos.length;
        }
      }
    }
  }

  const topeAlcanzado = ids.length === MAX_POR_CORRIDA;
  const warnings = [
    ...(logCaido ? ['El log de previo pago no respondió; no hubo ingesta'] : []),
    ...(topeAlcanzado ? [`Se alcanzó el tope de ${MAX_POR_CORRIDA} leads por corrida`] : []),
    ...(result.warning ? [result.warning] : []),
  ];

  console.log(
    `[previo-pago/seguimiento-cron] ventana=${desde}→${hasta} ingestados=${ingestados} ` +
      `candidatos=${ids.length} reclamados=${idsReclamados.length} ` +
      `efectivos=${result.total_efectivo} excluidos=${result.total_excluido} ` +
      `desmarcados=${desmarcados}${warnings.length ? ` warnings=${warnings.join(' | ')}` : ''}`
  );

  return NextResponse.json({
    ventana: { desde, hasta },
    ingestados,
    candidatos: ids.length,
    enviados: result.total_enviado,
    desmarcados,
    ...result,
    ...(warnings.length ? { warning: warnings.join(' | ') } : {}),
  });
}
