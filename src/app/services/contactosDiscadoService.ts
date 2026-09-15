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
  observacion: string | null;
  estado: EstadoContacto;
  ultima_llamada_id: string | null;
  ultimo_error: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT = `
  id, nombre, direccion, telefono_crudo, telefono_e164, tipo, asumido, lote,
  observacion, estado, ultima_llamada_id, ultimo_error, created_at, updated_at
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
    observacion: c.observacion,
    lote: lote.trim() || null,
    estado: 'pendiente' as const,
  }));

  // Una base real trae miles de filas: un solo request no entra. Se manda por
  // tandas, y `ignoreDuplicates` + el índice único por teléfono hacen que
  // reimportar la misma base no cree repetidos ni pise lo ya llamado.
  const TANDA = 500;
  let insertados = 0;

  for (let i = 0; i < filas.length; i += TANDA) {
    const { data, error } = await (getSupabase() as any)
      .from('contactos_discado')
      .upsert(filas.slice(i, i + TANDA), {
        onConflict: 'telefono_e164',
        ignoreDuplicates: true,
      })
      .select('id');

    if (error) {
      console.error('[contactosDiscadoService.importarContactos]', error);
      throw new Error(
        `${error.message} (se alcanzaron a importar ${insertados} de ${filas.length})`,
      );
    }
    insertados += (data ?? []).length;
  }
  return {
    insertados,
    yaExistian: validos.length - insertados,
    invalidos,
    duplicadosEnElArchivo: duplicados,
    descartadas: descartadas.length,
  };
}

/** Alta manual de un contacto suelto, sin pasar por la importación. */
export async function agregarContacto(entrada: {
  nombre: string;
  telefono: string;
  direccion?: string | null;
  observacion?: string | null;
  lote?: string | null;
}): Promise<ContactoDiscado> {
  const nombre = entrada.nombre.trim();
  if (!nombre) throw new Error('El nombre es obligatorio');

  const { e164, tipo, asumido, motivo } = normalizarTelefonoAR(entrada.telefono);
  if (!e164) throw new Error(motivo ?? 'Teléfono inválido');

  const { data, error } = await (getSupabase() as any)
    .from('contactos_discado')
    .insert({
      nombre,
      direccion: entrada.direccion?.trim() || null,
      observacion: entrada.observacion?.trim() || null,
      telefono_crudo: entrada.telefono.trim(),
      telefono_e164: e164,
      tipo,
      asumido,
      lote: entrada.lote?.trim() || null,
      estado: 'pendiente',
    })
    .select(SELECT)
    .single();

  if (error) {
    // 23505 = choque con el índice único por teléfono.
    if ((error as any).code === '23505') {
      throw new Error(`Ese teléfono ya está en la base (${e164})`);
    }
    console.error('[contactosDiscadoService.agregarContacto]', error);
    throw new Error(error.message);
  }
  return data as ContactoDiscado;
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
