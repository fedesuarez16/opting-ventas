import { createClient } from '@supabase/supabase-js';
import { parsearBaseDiscado, type ResultadoImport } from '@/lib/contactosDiscadoImport';
import { normalizarTelefonoAR, type TipoTelefono } from '@/lib/telefonoAR';

let supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
  supabase = createClient(url, key);
  return supabase;
}

export type EstadoContacto = 'pendiente' | 'llamando' | 'llamado' | 'error' | 'descartado';

export interface ContactoDiscado {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono_crudo: string;
  telefono_e164: string | null;
  tipo: TipoTelefono | null;
  asumido: boolean;
  lote: string | null;
  estado: EstadoContacto;
  ultima_llamada_id: string | null;
  ultimo_error: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT = `
  id, nombre, direccion, telefono_crudo, telefono_e164, tipo, asumido, lote,
  estado, ultima_llamada_id, ultimo_error, created_at, updated_at
`;

export async function getContactos(filtros?: {
  estado?: EstadoContacto | 'todos';
  lote?: string | 'todos';
}): Promise<ContactoDiscado[]> {
  let q = (getSupabase() as any)
    .from('contactos_discado')
    .select(SELECT)
    .order('created_at', { ascending: false })
    .limit(2000);

  if (filtros?.estado && filtros.estado !== 'todos') q = q.eq('estado', filtros.estado);
  if (filtros?.lote && filtros.lote !== 'todos') q = q.eq('lote', filtros.lote);

  const { data, error } = await q;
  if (error) {
    console.error('[contactosDiscadoService.getContactos]', error);
    throw new Error(error.message);
  }
  return (data ?? []) as ContactoDiscado[];
}

export async function getLotes(): Promise<string[]> {
  const { data, error } = await (getSupabase() as any)
    .from('contactos_discado')
    .select('lote')
    .not('lote', 'is', null)
    .limit(2000);

  if (error) {
    console.error('[contactosDiscadoService.getLotes]', error);
    return [];
  }
  const set = new Set<string>((data ?? []).map((r: any) => r.lote).filter(Boolean));
  return Array.from(set).sort();
}

/** Parseo sin tocar la base: alimenta la vista previa antes de importar. */
export function previsualizar(texto: string): ResultadoImport {
  return parsearBaseDiscado(texto);
}

export interface ResultadoGuardado {
  insertados: number;
  yaExistian: number;
  invalidos: number;
  duplicadosEnElArchivo: number;
  descartadas: number;
}

export async function importarContactos(
  texto: string,
  lote: string,
): Promise<ResultadoGuardado> {
  const { contactos, descartadas, duplicados } = parsearBaseDiscado(texto);

  const validos = contactos.filter((c) => c.telefono_e164);
  const invalidos = contactos.length - validos.length;

  if (validos.length === 0) {
    return {
      insertados: 0,
      yaExistian: 0,
      invalidos,
      duplicadosEnElArchivo: duplicados,
      descartadas: descartadas.length,
    };
  }

  const filas = validos.map((c) => ({
    nombre: c.nombre,
    direccion: c.direccion,
    telefono_crudo: c.telefono_crudo,
    telefono_e164: c.telefono_e164,
    tipo: c.tipo,
    asumido: c.asumido,
    lote: lote.trim() || null,
    estado: 'pendiente' as const,
  }));

  // ignoreDuplicates: el índice único por teléfono hace que reimportar la misma
  // base no cree filas repetidas ni pise el estado de las que ya se llamaron.
  const { data, error } = await (getSupabase() as any)
    .from('contactos_discado')
    .upsert(filas, { onConflict: 'telefono_e164', ignoreDuplicates: true })
    .select('id');

  if (error) {
    console.error('[contactosDiscadoService.importarContactos]', error);
    throw new Error(error.message);
  }

  const insertados = (data ?? []).length;
  return {
    insertados,
    yaExistian: validos.length - insertados,
    invalidos,
    duplicadosEnElArchivo: duplicados,
    descartadas: descartadas.length,
  };
}

/** Corrección manual del teléfono desde la tabla. */
export async function corregirTelefono(
  id: string,
  telefono: string,
): Promise<ContactoDiscado> {
  const { e164, tipo, motivo } = normalizarTelefonoAR(telefono);
  if (!e164) throw new Error(motivo ?? 'Teléfono inválido');

  const { data, error } = await (getSupabase() as any)
    .from('contactos_discado')
    .update({ telefono_e164: e164, tipo, asumido: false, ultimo_error: null })
    .eq('id', id)
    .select(SELECT)
    .single();

  if (error) {
    console.error('[contactosDiscadoService.corregirTelefono]', error);
    throw new Error(error.message);
  }
  return data as ContactoDiscado;
}

export async function cambiarEstado(
  id: string,
  estado: EstadoContacto,
): Promise<void> {
  const { error } = await (getSupabase() as any)
    .from('contactos_discado')
    .update({ estado })
    .eq('id', id);

  if (error) {
    console.error('[contactosDiscadoService.cambiarEstado]', error);
    throw new Error(error.message);
  }
}

export async function dispararContacto(
  contactoId: string,
  agenteTelefono: string,
): Promise<{ llamadaId: string; sid: string }> {
  const res = await fetch('/api/llamadas/discado/disparar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contactoId, agenteTelefono }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? 'No se pudo disparar la llamada');
  return { llamadaId: json.llamadaId, sid: json.sid };
}
