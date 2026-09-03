/**
 * Parser del log de intentos de pago (optingsha.com.ar/estado.log).
 *
 * Cada línea es `YYYY-MM-DD HH:mm:ss - Nombre Apellido - telefono - estado`, con
 * `estado` en {previopago, approved, rejected, cancelled, pending, in_mediation, refunded}.
 * Un teléfono "abandonó" el pago si nunca aparece con `approved` en todo el log.
 * Los teléfonos se ingresan a mano en el formulario de pago, así que llegan con formatos
 * inconsistentes (con/sin 0 inicial, con/sin código de país) — se normalizan a los
 * últimos 10 dígitos, mismo criterio que usa el resto del CRM para matchear números.
 */

/** Etiqueta que marca en `leads` a los contactos ya cargados desde el log de previo pago. */
export const ETIQUETA_PREVIO_PAGO = 'previo_pago';

export interface PrevioPagoEvento {
  fecha: string;
  nombre: string;
  telefonoRaw: string;
  estado: string;
}

export interface PrevioPagoContacto {
  /** Últimos 10 dígitos del teléfono, usados como clave de agrupación. */
  telefonoNormalizado: string;
  /** '549' + telefonoNormalizado, listo para usar como remote_jid de WhatsApp AR. */
  remoteJid: string;
  nombre: string;
  telefonoRaw: string;
  estados: string[];
  intentos: number;
  primerIntento: string;
  ultimoIntento: string;
  /** true si el teléfono llegó a `approved` en algún momento del log. */
  compro: boolean;
  /**
   * Fecha del PRIMER evento `approved`, o `undefined` si nunca compró.
   *
   * No alcanza con `primerIntento` para decidir a quién pedirle una reseña: el que entró
   * el lunes, falló dos veces y recién compró el jueves tiene `primerIntento` del lunes.
   * Filtrar por ahí lo dejaría fuera de la ventana de reseñas para siempre.
   */
  fechaCompra?: string;
}

export interface PrevioPagoResumen {
  totalLineas: number;
  telefonosUnicos: number;
  compraron: number;
  abandonaron: number;
  /** % de teléfonos únicos que nunca llegaron a `approved`. */
  tasaAbandono: number;
  porEstado: Record<string, number>;
  /** Nunca llegaron a `approved` — el foco de esta página. */
  contactos: PrevioPagoContacto[];
  /** Sí llegaron a `approved` — ocultos por defecto en la UI. */
  compradores: PrevioPagoContacto[];
  generadoEn: string;
}

const RE_LINEA = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) - (.+?) - (.+?) - (\w+)\s*$/;
const MIN_DIGITOS = 8;

/** Parsea el log crudo. Función pura: no toca red ni estado global. */
export function parseEstadoLog(raw: string): PrevioPagoEvento[] {
  const eventos: PrevioPagoEvento[] = [];
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(RE_LINEA);
    if (!m) continue;
    const [, fecha, nombre, telefonoRaw, estado] = m;
    eventos.push({ fecha, nombre: nombre.trim(), telefonoRaw: telefonoRaw.trim(), estado });
  }
  return eventos;
}

function telefonoNormalizado(telefonoRaw: string): string | null {
  const digitos = telefonoRaw.replace(/\D/g, '');
  if (digitos.length < MIN_DIGITOS) return null;
  return digitos.slice(-10);
}

/** Agrupa por teléfono y separa quienes nunca llegaron a `approved`. Función pura. */
export function resumirPrevioPago(eventos: PrevioPagoEvento[]): PrevioPagoResumen {
  const porTelefono = new Map<
    string,
    { nombres: Set<string>; telefonosRaw: Set<string>; eventos: PrevioPagoEvento[] }
  >();

  for (const ev of eventos) {
    const key = telefonoNormalizado(ev.telefonoRaw);
    if (!key) continue;
    if (!porTelefono.has(key)) {
      porTelefono.set(key, { nombres: new Set(), telefonosRaw: new Set(), eventos: [] });
    }
    const entry = porTelefono.get(key)!;
    entry.nombres.add(ev.nombre);
    entry.telefonosRaw.add(ev.telefonoRaw);
    entry.eventos.push(ev);
  }

  const contactos: PrevioPagoContacto[] = [];
  const compradores: PrevioPagoContacto[] = [];
  const porEstado: Record<string, number> = {};

  for (const [key, entry] of porTelefono.entries()) {
    const compro = entry.eventos.some((e) => e.estado === 'approved');
    const ordenados = [...entry.eventos].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const estados = [...new Set(ordenados.map((e) => e.estado))];

    const contacto: PrevioPagoContacto = {
      telefonoNormalizado: key,
      remoteJid: `549${key}`,
      nombre: [...entry.nombres][0],
      telefonoRaw: [...entry.telefonosRaw][0],
      estados,
      intentos: ordenados.length,
      primerIntento: ordenados[0].fecha,
      ultimoIntento: ordenados[ordenados.length - 1].fecha,
      compro,
      ...(compro
        ? { fechaCompra: ordenados.find((e) => e.estado === 'approved')!.fecha }
        : {}),
    };

    if (compro) {
      compradores.push(contacto);
      continue;
    }
    for (const estado of estados) {
      porEstado[estado] = (porEstado[estado] ?? 0) + 1;
    }
    contactos.push(contacto);
  }

  contactos.sort((a, b) => b.ultimoIntento.localeCompare(a.ultimoIntento));
  compradores.sort((a, b) => b.ultimoIntento.localeCompare(a.ultimoIntento));

  const telefonosUnicos = porTelefono.size;
  const abandonaron = contactos.length;

  return {
    totalLineas: eventos.length,
    telefonosUnicos,
    compraron: compradores.length,
    abandonaron,
    tasaAbandono: telefonosUnicos > 0 ? Math.round((abandonaron / telefonosUnicos) * 1000) / 10 : 0,
    porEstado,
    contactos,
    compradores,
    generadoEn: new Date().toISOString(),
  };
}
