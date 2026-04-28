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

export async function POST() {
  try {
    const supabase = getSupabase();

    const countByPhone = new Map<string, number>();
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('chat_histories')
        .select('session_id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) {
        return NextResponse.json(
          { error: 'Error leyendo chat_histories', message: error.message },
          { status: 500 },
        );
      }
      const rows = (data as { session_id: string }[]) || [];
      for (const row of rows) {
        const key = last10(row.session_id);
        if (!key) continue;
        countByPhone.set(key, (countByPhone.get(key) || 0) + 1);
      }
      if (rows.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const allLeads: { id: number | string; phone: string | null; estado: string | null }[] = [];
    let leadOffset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, phone, estado')
        .range(leadOffset, leadOffset + PAGE_SIZE - 1);
      if (error) {
        return NextResponse.json(
          { error: 'Error leyendo leads', message: error.message },
          { status: 500 },
        );
      }
      const rows = (data as any[]) || [];
      allLeads.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      leadOffset += PAGE_SIZE;
    }

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
