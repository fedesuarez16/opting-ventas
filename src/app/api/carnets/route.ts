import { NextResponse } from 'next/server';
import { parseWebhookLog, resumirCarnets, type CarnetsResumen } from '@/lib/carnetsLog';

// El log crece y se actualiza en vivo: nunca cachear la respuesta.
export const dynamic = 'force-dynamic';

const LOG_URL = process.env.CARNETS_LOG_URL || 'https://optingsha.com.ar/webhook.log';

const RESUMEN_VACIO: CarnetsResumen = {
  totalAprobados: 0,
  montoTotal: 0,
  sinFecha: 0,
  porDia: [],
};

export async function GET() {
  try {
    const res = await fetch(LOG_URL, { cache: 'no-store' });

    if (!res.ok) {
      console.error(`[carnets] log respondió ${res.status}`);
      return NextResponse.json({ ...RESUMEN_VACIO, error: `log ${res.status}` });
    }

    const raw = await res.text();
    const resumen = resumirCarnets(parseWebhookLog(raw));
    return NextResponse.json(resumen);
  } catch (error) {
    console.error('[carnets] error al bajar/parsear el log:', error);
    return NextResponse.json({ ...RESUMEN_VACIO, error: 'fetch failed' });
  }
}
