import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase env vars missing');
  }
  return createClient(url, key);
};

const last10 = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = String(value).replace(/\D/g, '');
  if (digits.length < 6) return null;
  return digits.slice(-10);
};

const calcEstado = (count: number): 'frío' | 'tibio' | 'caliente' => {
  if (count < 3) return 'frío';
  if (count <= 8) return 'tibio';
  return 'caliente';
};

const normEstado = (s: string | null | undefined): string =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

// Estados que el sistema puede sobreescribir automáticamente.
// 'llamada', 'visita', 'lista de difusion' son seteados a mano y NO se tocan.
const AUTO_ESTADOS_NORM = new Set([
  'frio',
  'tibio',
  'caliente',
  'frios',
  'tibios',
  'calientes',
  'inicial',
  'activo',
  '',
]);

const PAGE_SIZE = 1000;

// Cuántos requests de paginado mandamos a la vez. `chat_histories` son ~56
// páginas: en serie tardaba ~1 minuto, en tandas de 8 baja a unos segundos sin
// abrir 56 conexiones de golpe contra PostgREST.
const FETCH_CONCURRENCY = 8;

/**
 * Trae todas las filas de una tabla en páginas de `PAGE_SIZE` pedidas en
 * paralelo, en tandas de `FETCH_CONCURRENCY`.
 *
 * Cuenta primero con un request `head` para saber cuántas páginas hay, así no
 * depende de ir descubriendo el final de a una.
 */
const fetchAllRows = async <T>(
  supabase: ReturnType<typeof getSupabase>,
  table: string,
  columns: string,
  orderBy: string,
): Promise<{ rows: T[]; error: string | null }> => {
  const { count, error: countError } = await supabase
    .from(table)
    .select(orderBy, { count: 'exact', head: true });

  if (countError) return { rows: [], error: countError.message };

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const rows: T[] = [];

  for (let start = 0; start < totalPages; start += FETCH_CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(FETCH_CONCURRENCY, totalPages - start) },
      (_, i) => start + i,
    );
    const results = await Promise.all(
      batch.map((page) =>
        supabase
          .from(table)
          .select(columns)
          // Orden explícito y estable: sin él, dos requests paralelos pueden
          // devolver la misma fila dos veces y saltearse otra.
          .order(orderBy, { ascending: true })
          .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
      ),
    );
    for (const { data, error } of results) {
      if (error) return { rows: [], error: error.message };
      rows.push(...((data as T[]) || []));
    }
  }

  return { rows, error: null };
};

export async function POST() {
  try {
    const supabase = getSupabase();

    const [chatResult, leadsResult] = await Promise.all([
      fetchAllRows<{ session_id: string }>(supabase, 'chat_histories', 'session_id', 'id'),
      fetchAllRows<{ id: number | string; phone: string | null; estado: string | null }>(
        supabase,
        'leads',
        'id, phone, estado',
        'id',
      ),
    ]);

    if (chatResult.error) {
      return NextResponse.json(
        { error: 'Error leyendo chat_histories', message: chatResult.error },
        { status: 500 },
      );
    }
    if (leadsResult.error) {
      return NextResponse.json(
        { error: 'Error leyendo leads', message: leadsResult.error },
        { status: 500 },
      );
    }

    const countByPhone = new Map<string, number>();
    for (const row of chatResult.rows) {
      const key = last10(row.session_id);
      if (!key) continue;
      countByPhone.set(key, (countByPhone.get(key) || 0) + 1);
    }

    const allLeads = leadsResult.rows;

    const updates: { id: number | string; newEstado: string }[] = [];
    let skippedManual = 0;
    let unchanged = 0;
    let noPhone = 0;

    for (const lead of allLeads) {
      const phoneKey = last10(lead.phone);
      if (!phoneKey) {
        noPhone++;
        continue;
      }
      const cur = normEstado(lead.estado);
      if (!AUTO_ESTADOS_NORM.has(cur)) {
        skippedManual++;
        continue;
      }
      const count = countByPhone.get(phoneKey) || 0;
      const newEstado = calcEstado(count);
      if (normEstado(newEstado) === cur) {
        unchanged++;
        continue;
      }
      updates.push({ id: lead.id, newEstado });
    }

    const BATCH = 25;
    let updated = 0;
    let failed = 0;
    for (let i = 0; i < updates.length; i += BATCH) {
      const batch = updates.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map((u) =>
          (supabase as any).from('leads').update({ estado: u.newEstado }).eq('id', u.id),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && !(r.value as any)?.error) updated++;
        else failed++;
      }
    }

    return NextResponse.json({
      success: true,
      totalLeads: allLeads.length,
      sessionsCounted: countByPhone.size,
      candidates: updates.length,
      updated,
      failed,
      unchanged,
      skippedManual,
      noPhone,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: 'Error interno', message: e?.message || String(e) },
      { status: 500 },
    );
  }
}
