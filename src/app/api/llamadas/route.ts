import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Normaliza a últimos 10 dígitos para matchear formatos:
//   +5491141872290, 5491141872290, 9491141872290, 549221...@s.whatsapp.net, WAID:..., wa_id
const lastTenDigits = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length < 6) return null;
  return digits.slice(-10);
};

// Acepta solo ISO 8601 con offset explícito (-03:00 o Z); rechaza naive.
const ISO_WITH_OFFSET = /[+-]\d{2}:?\d{2}$|Z$/;
const parseIsoStrict = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value) return null;
  if (!ISO_WITH_OFFSET.test(value)) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
};

interface RequestBody {
  lead_phone?: string;
  lead_name?: string;
  fecha_hora_iso?: string;
  confirmation_text?: string;
  duracion_min?: number;
}

export async function POST(request: Request) {
  // 1) Auth — fail-closed
  if (!webhookSecret) {
    console.error('[api/llamadas] N8N_WEBHOOK_SECRET no configurado');
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }
  const provided = request.headers.get('x-webhook-secret');
  if (provided !== webhookSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2) Body parse
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 });
  }

  const { lead_phone, lead_name, fecha_hora_iso, confirmation_text, duracion_min } = body;

  // 3) Validación
  const inicioDate = parseIsoStrict(fecha_hora_iso);
  if (!inicioDate) {
    return NextResponse.json(
      { error: 'fecha_hora_iso inválido: requiere ISO 8601 con offset (e.g. 2026-05-13T15:00:00-03:00)' },
      { status: 400 },
    );
  }

  const duracion = typeof duracion_min === 'number' && duracion_min > 0 ? duracion_min : 30;
  const finDate = new Date(inicioDate.getTime() + duracion * 60_000);

  // 4) Phone lookup (last-10-digits)
  let leadId: number | null = null;
  let resolvedNombre: string | null = (lead_name ?? '').trim() || null;

  const phoneKey = lastTenDigits(lead_phone);
  if (phoneKey) {
    const { data: candidates, error: lookupError } = await (supabase as any)
      .from('leads')
      .select('id, nombre, phone, whatsapp_id')
      .or(`phone.ilike.%${phoneKey},whatsapp_id.ilike.%${phoneKey}%`)
      .limit(5);

    if (lookupError) {
      console.error('[api/llamadas] lookup error', lookupError);
      // Continue with leadId=null — never fail the request on lookup miss.
    } else if (candidates && candidates.length > 0) {
      // Match strict by last-10-digits on either column
      const match = candidates.find((c: any) => {
        const a = lastTenDigits(c.phone);
        const b = lastTenDigits(c.whatsapp_id);
        return a === phoneKey || b === phoneKey;
      });
      if (match) {
        leadId = match.id as number;
        if (!resolvedNombre) resolvedNombre = (match.nombre as string) || null;
      }
    }
  }

  // 5) Title (Spanish, UI shows this in calendar slots)
  const titulo = resolvedNombre ? `Llamada con ${resolvedNombre}` : 'Llamada agendada';

  const notas = (confirmation_text ?? '').trim() || null;

  // 6) INSERT
  const { data: inserted, error: insertError } = await (supabase as any)
    .from('llamadas_agendadas')
    .insert({
      lead_id: leadId,
      nombre_contacto: resolvedNombre,
      titulo,
      notas,
      inicio: inicioDate.toISOString(),
      fin: finDate.toISOString(),
      estado: 'agendada',
      resultado: null,
      agente: null,
    })
    .select('id, lead_id, inicio, fin, estado')
    .single();

  if (insertError || !inserted) {
    console.error('[api/llamadas] insert error', insertError);
    return NextResponse.json({ error: 'Error al persistir llamada' }, { status: 500 });
  }

  // 7) Update leads.llamada_agendada = true (best-effort)
  if (leadId != null) {
    const { error: updateError } = await (supabase as any)
      .from('leads')
      .update({ llamada_agendada: true, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (updateError) {
      console.error('[api/llamadas] update leads error (non-fatal)', updateError);
      // No revertimos el INSERT — la llamada ya quedó agendada.
    }
  }

  console.log(
    `[api/llamadas] OK id=${inserted.id} lead_id=${leadId ?? 'null'} inicio=${inicioDate.toISOString()}`,
  );

  return NextResponse.json(
    {
      id: inserted.id,
      lead_id: inserted.lead_id,
      inicio: inserted.inicio,
      fin: inserted.fin,
      estado: inserted.estado,
      matched_lead: leadId != null,
    },
    { status: 201 },
  );
}
