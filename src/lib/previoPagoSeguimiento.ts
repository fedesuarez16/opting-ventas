/**
 * Seguimiento automático de previo pago: a las 15hs AR se le manda la plantilla de
 * recupero a todos los leads `previo_pago` que entraron ese mismo día y todavía no
 * la recibieron.
 *
 * El corte del día se calcula en hora Argentina, NO en UTC: un lead que entra a las
 * 22hs AR ya figura como del día siguiente en UTC, y con un corte UTC se quedaría
 * afuera del envío de su propio día.
 */

/** Key en WHATSAPP_TEMPLATES de la plantilla de recupero (HSM template_utility_20260730160029). */
export const TEMPLATE_KEY_SEGUIMIENTO_PREVIO_PAGO = 'previo_pago_seguimiento';

/** Columna de `leads` que marca que ya se mandó el seguimiento. Timestamp, no booleano. */
export const COLUMNA_SEGUIMIENTO_ENVIADO = 'seguimiento_previo_pago_enviado';

/** Argentina es UTC-3 fijo: no aplica horario de verano desde 2009. */
const AR_OFFSET_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Ventana `[desde, hasta)` en ISO/UTC que cubre el día calendario argentino de `now`.
 * Función pura: no lee el reloj salvo que no le pases `now`.
 */
export function ventanaDiaArgentina(now: Date = new Date()): { desde: string; hasta: string } {
  const arNow = new Date(now.getTime() - AR_OFFSET_MS);
  const medianocheAr = Date.UTC(arNow.getUTCFullYear(), arNow.getUTCMonth(), arNow.getUTCDate());
  const desde = new Date(medianocheAr + AR_OFFSET_MS);
  const hasta = new Date(desde.getTime() + DIA_MS);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
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
 * Contactos del log que iniciaron el pago HOY y no compraron.
 *
 * El log de optingsha.com.ar escribe la fecha en hora local del servidor (AR) y sin
 * offset, así que alcanza con comparar la parte `YYYY-MM-DD` contra el día AR actual:
 * convertir a Date sería inventar un timezone que el log no declara.
 *
 * Función pura.
 */
export function contactosDelDiaArgentino<T extends { primerIntento: string; compro: boolean }>(
  contactos: T[],
  now: Date = new Date()
): T[] {
  const hoy = fechaArgentina(now);
  return contactos.filter((c) => !c.compro && c.primerIntento?.slice(0, 10) === hoy);
}
