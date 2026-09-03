import type { createClient } from '@supabase/supabase-js';
import {
  ETIQUETA_PREVIO_PAGO,
  parseEstadoLog,
  resumirPrevioPago,
  type PrevioPagoResumen,
} from './previoPagoLog';

/** Línea de Carnet de Manipulación: es la que corresponde a esta campaña. */
export const PREVIO_PAGO_PHONE_FROM = '+5491141872290';

export const PREVIO_PAGO_LOG_URL =
  process.env.PREVIO_PAGO_LOG_URL || 'https://optingsha.com.ar/estado.log';

/** Baja y parsea el log de intentos de pago. Devuelve null si el log no responde. */
export async function fetchResumenPrevioPago(): Promise<PrevioPagoResumen | null> {
  try {
    const res = await fetch(PREVIO_PAGO_LOG_URL, { cache: 'no-store' });
    if (!res.ok) {
      console.error(`[previoPagoIngest] log respondió ${res.status}`);
      return null;
    }
    return resumirPrevioPago(parseEstadoLog(await res.text()));
  } catch (error) {
    console.error('[previoPagoIngest] error al bajar/parsear el log:', error);
    return null;
  }
}

export interface ContactoIngest {
  remoteJid: string;
  nombre?: string;
  estados?: string[];
  /** Fecha del `approved`, sólo para los compradores. Ver `previoPagoResena.ts`. */
  fechaCompra?: string;
}

export interface IngestOptions {
  etiquetarExistentes: boolean;
  dryRun?: boolean;
  /**
   * Etiqueta con la que se crean los leads nuevos. Por defecto `previo_pago` (abandonos);
   * el flujo de reseñas usa `previo_pago_comprador`, que es la población opuesta.
   */
  etiqueta?: string;
  /** Cómo se arma `mensaje_inicial`. Por defecto, el texto de "previo pago sin completar". */
  mensajeInicial?: (contacto: ContactoIngest) => string;
}

export interface IngestResult {
  /** Ids de todos los contactos pedidos (nuevos + los que ya existían). */
  leadIds: number[];
  /** Ids de los leads recién creados en esta corrida. */
  idsNuevos: number[];
  nuevos: number;
  existentes: number;
}

export type IngestError = { error: string; status: number };

/**
 * Crea en `leads` los contactos de previo pago que todavía no existen y devuelve los ids.
 *
 * Compartido entre la carga manual (`/api/previo-pago/cargar`) y el cron de las 15hs
 * para que las reglas de creación (línea Carnet, estado inicial, etiqueta) no diverjan.
 *
 * `etiquetarExistentes` decide qué pasa con los leads que YA estaban en la tabla:
 * - `true` (carga manual): les pisa `etiqueta` con 'previo_pago', comportamiento histórico.
 * - `false` (cron): no los toca. Un lead que ya existía no "entró hoy", y `etiqueta` es un
 *   campo libre que el equipo edita desde el CRM — un cron diario no debería sobrescribirlo.
 */
export async function ingestarLeadsPrevioPago(
  supabase: ReturnType<typeof createClient>,
  contactos: ContactoIngest[],
  {
    etiquetarExistentes,
    dryRun = false,
    etiqueta = ETIQUETA_PREVIO_PAGO,
    mensajeInicial = (c) =>
      `Previo pago sin completar (${(c.estados || []).join(', ') || 'previopago'}) — optingsha.com.ar/estado.log`,
  }: IngestOptions
): Promise<IngestResult | IngestError> {
  if (contactos.length === 0) {
    return { leadIds: [], idsNuevos: [], nuevos: 0, existentes: 0 };
  }

  const items = contactos.map((c) => ({
    ...c,
    phone: `+${String(c.remoteJid).replace(/\D/g, '')}`,
  }));
  const phones = items.map((i) => i.phone);

  const { data: existentes, error: existentesError } = await (supabase as any)
    .from('leads')
    .select('id, phone')
    .in('phone', phones);

  if (existentesError) {
    console.error('[previoPagoIngest] Error buscando leads existentes:', existentesError);
    return { error: 'Error interno', status: 500 };
  }

  const idPorPhone = new Map<string, number>();
  const phonesExistentes = new Set<string>();
  for (const row of (existentes ?? []) as any[]) {
    idPorPhone.set(row.phone, row.id);
    phonesExistentes.add(row.phone);
  }

  const nuevos = items.filter((i) => !phonesExistentes.has(i.phone));
  const idsNuevos: number[] = [];

  // dryRun: ya sabemos cuántos se crearían y cuántos ya estaban; no escribimos nada.
  if (dryRun) {
    return {
      leadIds: [...phonesExistentes]
        .map((p) => idPorPhone.get(p))
        .filter((id): id is number => typeof id === 'number'),
      idsNuevos: [],
      nuevos: nuevos.length,
      existentes: phonesExistentes.size,
    };
  }

  if (nuevos.length > 0) {
    const filas = nuevos.map((i) => ({
      phone: i.phone,
      nombre: i.nombre || null,
      estado: 'frio',
      chat_activo: 0,
      phone_from: PREVIO_PAGO_PHONE_FROM,
      etiqueta,
      mensaje_inicial: mensajeInicial(i),
      timestamp_mensaje: new Date().toISOString(),
    }));

    const { data: insertados, error: insertError } = await (supabase as any)
      .from('leads')
      .insert(filas)
      .select('id, phone');

    if (insertError) {
      console.error('[previoPagoIngest] Error creando leads:', insertError);
      return { error: 'Error interno creando leads', status: 500 };
    }
    for (const row of (insertados ?? []) as any[]) {
      idPorPhone.set(row.phone, row.id);
      idsNuevos.push(row.id);
    }
  }

  const idsExistentes = [...phonesExistentes]
    .map((p) => idPorPhone.get(p))
    .filter((id): id is number => typeof id === 'number');

  if (etiquetarExistentes && idsExistentes.length > 0) {
    const { error: updateError } = await (supabase as any)
      .from('leads')
      .update({ etiqueta })
      .in('id', idsExistentes);
    if (updateError) {
      console.error('[previoPagoIngest] Error etiquetando leads existentes:', updateError);
    }
  }

  const leadIds = phones
    .map((p) => idPorPhone.get(p))
    .filter((id): id is number => typeof id === 'number');

  return { leadIds, idsNuevos, nuevos: nuevos.length, existentes: idsExistentes.length };
}
