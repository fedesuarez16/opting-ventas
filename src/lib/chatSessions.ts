/**
 * Identidad de una conversación en `public.chat_histories`.
 *
 * El `session_id` de esa tabla lo escriben n8n y el CRM, y NO tiene un formato
 * único: al 2026-09-23 hay 9.755 session_id distintos, 9.701 con `+` adelante
 * (`+5491164962963`) y 54 sin él (`5491160169361`). Peor: 24 contactos tienen la
 * conversación PARTIDA entre las dos formas, así que un `eq('session_id', x)`
 * devuelve la mitad de los mensajes.
 *
 * Por eso ningún lector puede comparar `session_id` por igualdad cruda. La regla
 * del proyecto (ver CLAUDE.md) es normalizar y comparar por los ÚLTIMOS 10
 * DÍGITOS, que es lo que sobrevive a todos los formatos que llegan de WhatsApp:
 * `+5492215...`, `549221...@s.whatsapp.net`, `WAID:549221...`, `wa_id`.
 */

/** Cuántas filas devuelve PostgREST si no se le pide un rango explícito. */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Últimos 10 dígitos de un teléfono, JID o `session_id`.
 *
 * Es la clave de identidad de un contacto: `+5491164962963`, `5491164962963` y
 * `5491164962963@s.whatsapp.net` colapsan todos a `1164962963`.
 *
 * Devuelve `null` si no hay dígitos suficientes para identificar a nadie.
 */
export function ultimos10Digitos(value: string | null | undefined): string | null {
  if (!value) return null;
  let texto = String(value).trim();
  // Sufijos de JID (`@s.whatsapp.net`, `@c.us`) y prefijos comunes.
  if (texto.includes('@')) texto = texto.split('@')[0];
  texto = texto.replace(/^WAID:/i, '').replace(/^whatsapp:/i, '');
  const digitos = texto.replace(/\D/g, '');
  if (digitos.length < 10) return null;
  return digitos.slice(-10);
}

/**
 * Formas exactas de `session_id` con las que puede estar guardada la
 * conversación de un contacto, para un `eq`/`in` que aproveche el índice.
 *
 * Se usa como primer intento rápido; si no devuelve filas hay que caer a
 * `ultimos10Digitos` + `ilike`, que sí cubre cualquier formato.
 */
export function variantesSessionId(value: string | null | undefined): string[] {
  if (!value) return [];
  const original = String(value).trim();
  const variantes = new Set<string>();
  if (original) variantes.add(original);

  let texto = original;
  if (texto.includes('@')) texto = texto.split('@')[0];
  texto = texto.replace(/^WAID:/i, '').replace(/^whatsapp:/i, '');
  const digitos = texto.replace(/\D/g, '');

  if (digitos.length >= 10) {
    variantes.add(digitos);
    variantes.add(`+${digitos}`);
  }

  return Array.from(variantes);
}
