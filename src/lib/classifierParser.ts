// src/lib/classifierParser.ts
// FUENTE UNICA de la logica de parseo/normalizacion del output del classifier LLM.
// El Code node "Classifier - Parse Flags" / " 1" en n8n es una COPIA ESPEJO del
// bloque marcado como CONTRATO ESPEJO abajo. Si cambia el shape:
//   1) editar aca primero, 2) actualizar fixtures, 3) copiar el bloque al Code node.
// Fixtures de contrato: src/lib/classifierParser.fixtures.ts
// NO usar APIs de n8n aca ($input, $json, etc.) — esto es TS puro y testeable.

export type Servicio = 'carnet' | 's&h' | null;

export interface ClassifierFlags {
  llamada_agendada: boolean;
  llamar: boolean;
  deriva_humano: boolean;
  presupuesto_etiqueta: boolean;
  inspeccion: boolean;
  empleado: boolean;
  dueno: boolean;
}

export interface ClassifierResult extends ClassifierFlags {
  servicio: Servicio;
  phone: string;
}

// ===== CONTRATO ESPEJO (inicio) — byte-identico al Code node n8n =====
const SAFE: ClassifierFlags = {
  llamada_agendada: false,
  llamar: false,
  deriva_humano: false,
  presupuesto_etiqueta: false,
  inspeccion: false,
  empleado: false,
  dueno: false,
};
const FLAG_KEYS = Object.keys(SAFE) as (keyof ClassifierFlags)[];

function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '');
}

function parseRaw(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const obj = JSON.parse(stripFences(raw));
    return obj && typeof obj === 'object' && !Array.isArray(obj)
      ? (obj as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function normalizeServicio(value: unknown): Servicio {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (v === 'carnet') return 'carnet';
  if (v === 's&h') return 's&h';
  return null; // 'sh', 'syh', 'seguridad e higiene', 'ambos', 'Carnet', etc. -> null
}

// Logica nucleo: de raw (string del LLM) -> flags + servicio (sin phone).
function classifyCore(raw: unknown): ClassifierFlags & { servicio: Servicio } {
  const parsed = parseRaw(raw);
  const flags: ClassifierFlags = { ...SAFE };
  let servicio: Servicio = null;
  if (parsed) {
    for (const k of FLAG_KEYS) {
      if (parsed[k] === true) flags[k] = true; // booleanos estrictos, default false
    }
    servicio = normalizeServicio(parsed['servicio']);
  }
  return { ...flags, servicio };
}
// ===== CONTRATO ESPEJO (fin) =====

/**
 * Parsea el output crudo del classifier LLM.
 * @param input texto crudo del LLM (puede traer fences markdown) — unknown-tolerant.
 * @param phone telefono del lead, se devuelve sin transformar.
 * Nunca lanza: ante cualquier fallo devuelve SAFE + servicio null.
 */
export function parseClassifierOutput(input: unknown, phone: string): ClassifierResult {
  const { servicio, ...flags } = classifyCore(input);
  return { ...flags, servicio, phone };
}
