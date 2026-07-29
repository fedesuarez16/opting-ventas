import { NextResponse } from 'next/server';
import { parseEstadoLog, resumirPrevioPago, type PrevioPagoResumen } from '@/lib/previoPagoLog';

// El log crece y se actualiza en vivo: nunca cachear la respuesta.
export const dynamic = 'force-dynamic';

const LOG_URL = process.env.PREVIO_PAGO_LOG_URL || 'https://optingsha.com.ar/estado.log';

const RESUMEN_VACIO: PrevioPagoResumen = {
  totalLineas: 0,
  telefonosUnicos: 0,
  compraron: 0,
  abandonaron: 0,
  tasaAbandono: 0,
  porEstado: {},
  contactos: [],
  compradores: [],
  generadoEn: new Date().toISOString(),
};

export async function GET() {
  try {
    const res = await fetch(LOG_URL, { cache: 'no-store' });

    if (!res.ok) {
      console.error(`[previo-pago] log respondió ${res.status}`);
      return NextResponse.json({ ...RESUMEN_VACIO, error: `log ${res.status}` });
    }

    const raw = await res.text();
    const resumen = resumirPrevioPago(parseEstadoLog(raw));
    return NextResponse.json(resumen);
  } catch (error) {
    console.error('[previo-pago] error al bajar/parsear el log:', error);
    return NextResponse.json({ ...RESUMEN_VACIO, error: 'fetch failed' });
  }
}
