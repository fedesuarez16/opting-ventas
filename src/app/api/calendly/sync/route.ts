import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const CALENDLY_API_TOKEN = process.env.CALENDLY_API_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function calendlyGet(path: string) {
  const res = await fetch(`https://api.calendly.com${path}`, {
    headers: { Authorization: `Bearer ${CALENDLY_API_TOKEN}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendly API error ${res.status}: ${text}`);
  }
  return res.json();
}

export async function POST() {
  if (!CALENDLY_API_TOKEN) {
    return NextResponse.json(
      { error: 'CALENDLY_API_TOKEN no configurado en .env.local' },
      { status: 500 },
    );
  }

  // 1. Obtener URI del usuario autenticado
  const meData = await calendlyGet('/users/me');
  const userUri: string = meData.resource?.uri;
  if (!userUri) {
    return NextResponse.json({ error: 'No se pudo obtener el usuario de Calendly' }, { status: 500 });
  }

  // 2. Listar eventos activos: últimos 7 días + próximos 60 días
  const minStart = new Date();
  minStart.setDate(minStart.getDate() - 7);
  const maxStart = new Date();
  maxStart.setDate(maxStart.getDate() + 60);

  const params = new URLSearchParams({
    user: userUri,
    min_start_time: minStart.toISOString(),
    max_start_time: maxStart.toISOString(),
    count: '100',
    status: 'active',
  });

  const eventsData = await calendlyGet(`/scheduled_events?${params}`);
  const events: any[] = eventsData.collection ?? [];

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  let created = 0;
  let skipped = 0;

  for (const ev of events) {
    // 3. Por cada evento, obtener sus invitees
    const eventUuid = ev.uri.split('/').pop();
    let invitees: any[] = [];
    try {
      const invData = await calendlyGet(`/scheduled_events/${eventUuid}/invitees?count=100`);
      invitees = invData.collection ?? [];
    } catch (err) {
      console.error('[calendly/sync] error obteniendo invitees de', eventUuid, err);
      continue;
    }

    for (const invitee of invitees) {
      // Idempotencia por calendly_uuid
      const { data: existing } = await (supabase as any)
        .from('llamadas_agendadas')
        .select('id')
        .eq('calendly_uuid', invitee.uri)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      const email: string = invitee.email ?? '';
      const notas = `Agendado vía Calendly${email ? `\nEmail: ${email}` : ''}`;

      const { error } = await (supabase as any)
        .from('llamadas_agendadas')
        .insert({
          titulo: ev.name || 'Llamada desde Calendly',
          nombre_contacto: invitee.name ?? null,
          inicio: ev.start_time,
          fin: ev.end_time,
          estado: invitee.status === 'canceled' ? 'cancelada' : 'agendada',
          notas,
          agente_telefono: invitee.text_reminder_number ?? null,
          calendly_uuid: invitee.uri,
        });

      if (error) {
        console.error('[calendly/sync] insert error:', error);
      } else {
        created++;
      }
    }
  }

  return NextResponse.json({ ok: true, created, skipped, total: events.length });
}
