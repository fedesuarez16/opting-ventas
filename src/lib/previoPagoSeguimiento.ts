/**
 * Seguimiento automático de previo pago: en cada corrida del cron se le manda la plantilla
 * de recupero a todos los leads `previo_pago` que todavía no la recibieron.
 *
 * La ventana es RODANTE (últimas `LOOKBACK_HORAS`), no el día calendario argentino.
 * La versión anterior filtraba por día AR y eso dejaba gente afuera para siempre: las
 * corridas son 15hs y 21hs AR, así que un lead creado entre las 21 y las 24hs no llegaba
 * a ninguna corrida de su propio día, y en la corrida de las 15hs del día siguiente ya
 * quedaba fuera de la ventana (otro día calendario). Nunca recibía la plantilla.
 *
 * La ventana rodante también cubre los otros casos donde el filtro por día perdía leads:
 * el log de optingsha caído en las dos corridas del día, los envíos `excluido`/`fallado`
 * que se desmarcan para reintentar, y el sobrante cuando se supera el tope por corrida.
 *
 * No hace falta que la ventana deduplique: de eso se encargan
 * `seguimiento_previo_pago_enviado IS NULL` en el SELECT + el claim atómico del cron, y
 * el chequeo `ya_enviado` de `queueLeadsForSend` contra `cola_envio_masivo`.
 */

/** Key en WHATSAPP_TEMPLATES de la plantilla de recupero (HSM template_utility_20260730160029). */
export const TEMPLATE_KEY_SEGUIMIENTO_PREVIO_PAGO = 'previo_pago_seguimiento';

/** Columna de `leads` que marca que ya se mandó el seguimiento. Timestamp, no booleano. */
export const COLUMNA_SEGUIMIENTO_ENVIADO = 'seguimiento_previo_pago_enviado';

/**
 * Cuánto hacia atrás mira el cron para elegir destinatarios.
 *
 * El peor caso a cubrir es entrar 00:01 AR —justo después de la corrida de las 21hs— y
 * esperar hasta la corrida de las 15hs del día siguiente: 15hs. 48 le da margen para
 * absorber además un día entero de log caído o de envíos fallados sin perder a nadie.
 *
 * Es también el techo de antigüedad: más atrás que esto ya no es un recupero, es spam.
 */
export const LOOKBACK_HORAS = 48;

/**
 * Cuántos días calendario argentinos hacia atrás mira la ingesta del log.
 *
 * Hoy + ayer: el que abandonó el pago a las 22hs no llegaba a ninguna corrida de su
 * propio día y con un filtro de "sólo hoy" jamás se creaba como lead.
 */
export const DIAS_INGESTA = 2;

/** Argentina es UTC-3 fijo: no aplica horario de verano desde 2009. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

/**
 * Piso `desde` de la ventana rodante, en ISO/UTC. No hay tope superior: nada se crea en
 * el futuro, y ponerle uno abriría una carrera con los leads que entran mientras corre.
 *
 * Función pura: no lee el reloj salvo que no le pases `now`.
 */
export function inicioVentanaSeguimiento(
  now: Date = new Date(),
  horas: number = LOOKBACK_HORAS
): string {
  return new Date(now.getTime() - horas * HORA_MS).toISOString();
}

/** Día calendario argentino de `now` como `YYYY-MM-DD`. Función pura. */
export function fechaArgentina(now: Date = new Date()): string {
  const arNow = new Date(now.getTime() - AR_OFFSET_MS);
  const y = arNow.getUTCFullYear();
  const m = String(arNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(arNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Contactos del log que iniciaron el pago en los últimos `dias` días calendario
 * argentinos (incluido hoy) y no compraron.
 *
 * El log de optingsha.com.ar escribe la fecha en hora local del servidor (AR) y sin
 * offset, así que se compara la parte `YYYY-MM-DD` contra el set de días AR de la
 * ventana: convertir a Date sería inventar un timezone que el log no declara.
 *
 * Reingestar un contacto ya cargado no duplica nada: `ingestarLeadsPrevioPago` busca por
 * teléfono y sólo crea los que no existen.
 *
 * Función pura.
 */
export function contactosDeUltimosDias<T extends { primerIntento: string; compro: boolean }>(
  contactos: T[],
  now: Date = new Date(),
  dias: number = DIAS_INGESTA
): T[] {
  const diasAr = new Set<string>();
  for (let i = 0; i < dias; i++) {
    diasAr.add(fechaArgentina(new Date(now.getTime() - i * DIA_MS)));
  }
  return contactos.filter((c) => !c.compro && diasAr.has(c.primerIntento?.slice(0, 10)));
}
