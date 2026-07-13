/**
 * Parser del log de webhooks de venta de carnets (optingsha.com.ar/webhook.log).
 *
 * El log NO es estructurado: mezcla headers de texto, JSON crudo de Mercado Pago y
 * confirmaciones legibles. El único dato confiable de una venta concreta es la línea
 * `Pago | Ref:22 | Estado:approved | Monto:50`. La fecha NO está en esa línea: se toma,
 * de forma aproximada, del último `date_created` visto en el JSON del mismo bloque
 * (el evento `payment.created` que precede a la venta). Ver conversación con Gerardo.
 */

export interface CarnetVenta {
  /** ISO 8601 aproximada (último date_created del bloque), o null si no se pudo resolver. */
  fecha: string | null;
  /** Monto de la línea `Monto:`. NaN-safe: 0 si no se pudo parsear. */
  monto: number;
  /** external_reference de la línea `Ref:`. */
  ref: string | null;
  /** Payment ID más cercano dentro del bloque, usado para deduplicar. */
  paymentId: string | null;
}

export interface CarnetsResumen {
  /** Total de ventas aprobadas (incluye las que no tienen fecha resoluble). */
  totalAprobados: number;
  /** Monto total de todas las ventas aprobadas. */
  montoTotal: number;
  /** Ventas aprobadas sin fecha resoluble (no aparecen en la serie por día). */
  sinFecha: number;
  /** Ventas agrupadas por día (YYYY-MM-DD UTC), ordenadas ascendente. */
  porDia: { fecha: string; cantidad: number; monto: number }[];
}

const RE_DATE = /"date_created":"([^"]+)"/;
const RE_PAYMENT_ID = /^Payment ID:\s*(\S+)/;
const RE_ESTADO = /Estado:\s*(\w+)/;
const RE_MONTO = /Monto:\s*([\d.,]+)/;
const RE_REF = /Ref:\s*(\S+)/;
const BLOQUE = '==== NUEVO WEBHOOK ====';

/**
 * Parsea el log crudo y devuelve las ventas aprobadas, deduplicadas por paymentId.
 * Función pura: no toca red ni estado global.
 */
export function parseWebhookLog(raw: string): CarnetVenta[] {
  const ventas: CarnetVenta[] = [];
  let lastDate: string | null = null;
  let lastPaymentId: string | null = null;

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith(BLOQUE)) {
      // Nuevo bloque: el paymentId no debe cruzar bloques; la fecha es best-effort.
      lastPaymentId = null;
      continue;
    }

    const dateMatch = line.match(RE_DATE);
    if (dateMatch) lastDate = dateMatch[1];

    const idMatch = line.match(RE_PAYMENT_ID);
    if (idMatch) {
      lastPaymentId = idMatch[1];
      continue;
    }

    if (line.startsWith('Pago')) {
      const estado = line.match(RE_ESTADO)?.[1];
      if (estado !== 'approved') continue;
      const montoRaw = line.match(RE_MONTO)?.[1] ?? '';
      const monto = parseFloat(montoRaw.replace(',', '.'));
      ventas.push({
        fecha: lastDate,
        monto: Number.isFinite(monto) ? monto : 0,
        ref: line.match(RE_REF)?.[1] ?? null,
        paymentId: lastPaymentId,
      });
    }
  }

  return dedupePorPaymentId(ventas);
}

/** Dedup por paymentId (Mercado Pago reintenta webhooks). Las ventas sin id se conservan. */
function dedupePorPaymentId(ventas: CarnetVenta[]): CarnetVenta[] {
  const vistos = new Set<string>();
  const out: CarnetVenta[] = [];
  for (const v of ventas) {
    if (v.paymentId) {
      if (vistos.has(v.paymentId)) continue;
      vistos.add(v.paymentId);
    }
    out.push(v);
  }
  return out;
}

/** Agrega las ventas en totales + serie por día (UTC). Función pura, testeable. */
export function resumirCarnets(ventas: CarnetVenta[]): CarnetsResumen {
  let montoTotal = 0;
  let sinFecha = 0;
  const dias = new Map<string, { cantidad: number; monto: number }>();

  for (const v of ventas) {
    montoTotal += v.monto;
    const dia = v.fecha ? diaUTC(v.fecha) : null;
    if (!dia) {
      sinFecha++;
      continue;
    }
    const acc = dias.get(dia) ?? { cantidad: 0, monto: 0 };
    acc.cantidad++;
    acc.monto += v.monto;
    dias.set(dia, acc);
  }

  const porDia = Array.from(dias.entries())
    .map(([fecha, { cantidad, monto }]) => ({ fecha, cantidad, monto }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  return { totalAprobados: ventas.length, montoTotal, sinFecha, porDia };
}

/** ISO string -> 'YYYY-MM-DD' UTC, o null si la fecha es inválida. */
function diaUTC(iso: string): string | null {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
