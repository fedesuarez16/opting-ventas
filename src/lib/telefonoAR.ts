/**
 * Normalización de teléfonos argentinos a E.164.
 *
 * Reemplaza al `toE164` genérico (que sólo hacía `replace(/\D/g,'')` + `+`)
 * para el caso de bases importadas. Ese atajo convertía `1124579173` en
 * `+1124579173` — código de país +1, Estados Unidos — y Twilio discaba de
 * verdad, porque EEUU está habilitado por defecto en toda cuenta.
 *
 * INVARIANTE: `e164` es siempre `null` o un número que empieza con `+54`.
 * Nunca devuelve otro país.
 *
 * Formato argentino: código de país 54, área + abonado = SIEMPRE 10 dígitos.
 *   móvil internacional → +54 9 <area> <abonado>
 *   fijo  internacional → +54   <area> <abonado>
 */

export type TipoTelefono = 'movil' | 'fijo';

export interface TelefonoNormalizado {
  /** E.164 listo para Twilio, o null si no se pudo resolver. Siempre +54… */
  e164: string | null;
  /** Qué se interpretó. Relevante porque el 9 cambia a qué línea entra la llamada. */
  tipo: TipoTelefono | null;
  /** true si hubo que adivinar (área faltante, o móvil/fijo no explícito). */
  asumido: boolean;
  /** Por qué se rechazó, para mostrar en la UI. */
  motivo: string | null;
}

const AREA_CABA = '11';

function fail(motivo: string): TelefonoNormalizado {
  return { e164: null, tipo: null, asumido: false, motivo };
}

/** Áreas argentinas: '11' (CABA/GBA) o 3-4 dígitos empezando en 2 o 3. */
function areaValida(areaYAbonado: string): boolean {
  if (areaYAbonado.startsWith('11')) return true;
  const primero = areaYAbonado[0];
  return primero === '2' || primero === '3';
}

export function normalizarTelefonoAR(entrada: string | null | undefined): TelefonoNormalizado {
  if (!entrada) return fail('Vacío');

  const original = String(entrada).trim();
  let digits = original.replace(/\D/g, '');
  if (!digits) return fail('Sin dígitos');

  // Marca de "esto vino en formato internacional": un + al principio o un 00.
  let internacionalExplicito = original.startsWith('+');
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
    internacionalExplicito = true;
  }

  let tienePais = false;
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    tienePais = true;
  } else if (internacionalExplicito) {
    // Vino con + pero el código de país no es 54: NO es argentino.
    return fail('No es un número argentino (código de país distinto de +54)');
  }

  // Prefijo nacional: 0 <area> … También es un formato explícito: si trae el 0
  // y no trae el 15, el número es un fijo.
  let tieneNacional = false;
  if (digits.startsWith('0')) {
    digits = digits.slice(1);
    tieneNacional = true;
  }

  // Móvil marcado con 9 (sólo tiene sentido con código de país).
  let esMovilExplicito = false;
  if (tienePais && digits.startsWith('9')) {
    digits = digits.slice(1);
    esMovilExplicito = true;
  }

  // Prefijo 15 (formato local viejo de móvil).
  let esMovil15 = false;
  if (digits.length === 12 && digits.slice(2, 4) === '15' && digits.startsWith(AREA_CABA)) {
    digits = digits.slice(0, 2) + digits.slice(4);
    esMovil15 = true;
  } else if (digits.length === 13 && digits.slice(3, 5) === '15') {
    digits = digits.slice(0, 3) + digits.slice(5);
    esMovil15 = true;
  } else if (digits.length === 10 && digits.startsWith('15')) {
    // 15 XXXX-XXXX sin área: en esta base todo es CABA/GBA.
    digits = AREA_CABA + digits.slice(2);
    esMovil15 = true;
  }

  let asumido = false;

  // Abonado de 8 dígitos sin área: asumimos CABA.
  if (digits.length === 8) {
    digits = AREA_CABA + digits;
    asumido = true;
  }

  if (digits.length < 10) return fail(`Faltan dígitos (quedaron ${digits.length}, hacen falta 10)`);
  if (digits.length > 10) return fail(`Sobran dígitos (quedaron ${digits.length}, hacen falta 10)`);
  if (!areaValida(digits)) return fail(`Código de área no reconocido (${digits.slice(0, 3)}…)`);

  // Móvil vs fijo: explícito si el número lo dijo (9 o 15). Si vino crudo, sin
  // código de país, asumimos móvil — en una base scrapeada es lo habitual.
  let tipo: TipoTelefono;
  if (esMovilExplicito || esMovil15) {
    tipo = 'movil';
  } else if (tienePais || tieneNacional) {
    tipo = 'fijo';
  } else {
    // Número crudo, sin código de país ni prefijo nacional. Se respeta literal
    // (fijo) en vez de inventarle el 9: en la base real, `1150257177` y
    // `+54 11 5025-7177` son el MISMO comercio — el crudo era el fijo.
    // Queda marcado como asumido para poder corregirlo desde la UI.
    tipo = 'fijo';
    asumido = true;
  }

  const e164 = tipo === 'movil' ? `+549${digits}` : `+54${digits}`;
  return { e164, tipo, asumido, motivo: null };
}

/**
 * Guarda final antes de entregarle un número a Twilio.
 * Se usa en los route handlers como defensa en profundidad: aunque alguien
 * escriba a mano un teléfono en la base, no sale una llamada fuera de Argentina.
 */
export function esTelefonoArgentino(e164: string | null | undefined): boolean {
  if (!e164) return false;
  if (!/^\+54\d{10,11}$/.test(e164)) return false;
  // +54 9 XXXXXXXXXX (móvil, 11 dígitos) o +54 XXXXXXXXXX (fijo, 10)
  const resto = e164.slice(3);
  if (resto.length === 11) return resto.startsWith('9');
  return resto.length === 10;
}
