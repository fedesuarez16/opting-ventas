import { describe, it, expect } from 'vitest';
import { parseWebhookLog, resumirCarnets } from '../carnetsLog';

// Bloque real (estructura verbatim del log de Gerardo, dígitos redactados).
const LOG = `==== NUEVO WEBHOOK ====
RAW:
{"resource":"https://api.mercadolibre.com/merchant_orders/37660797225","topic":"merchant_order"}

==== NUEVO WEBHOOK ====
RAW:
{"action":"payment.created","api_version":"v1","data":{"id":"143845427326"},"date_created":"2026-01-28T16:09:18Z","id":128483944749,"live_mode":true,"type":"payment","user_id":"239610915"}
Payment ID: 143845427326
RAW:
{"resource":"143845679916","topic":"payment"}
Payment ID: 143845679916
Pago | Ref:22 | Estado:approved | Monto:50
BD OK
Mail ya enviado

==== NUEVO WEBHOOK ====
RAW:
{"action":"payment.created","data":{"id":"200"},"date_created":"2026-02-10T09:00:00Z","type":"payment"}
Payment ID: 200
Pago | Ref:23 | Estado:rejected | Monto:50
`;

describe('parseWebhookLog', () => {
  it('extrae solo las ventas approved con fecha, monto, ref y paymentId', () => {
    const ventas = parseWebhookLog(LOG);
    expect(ventas).toEqual([
      { fecha: '2026-01-28T16:09:18Z', monto: 50, ref: '22', paymentId: '143845679916' },
    ]);
  });

  it('ignora estados que no son approved (rejected, pending, etc.)', () => {
    const ventas = parseWebhookLog(LOG);
    expect(ventas.some(v => v.ref === '23')).toBe(false);
  });

  it('deduplica por paymentId cuando Mercado Pago reintenta el webhook', () => {
    const dup = `==== NUEVO WEBHOOK ====
{"action":"payment.created","data":{"id":"9"},"date_created":"2026-03-01T00:00:00Z","type":"payment"}
Payment ID: 9
Pago | Ref:5 | Estado:approved | Monto:50
==== NUEVO WEBHOOK ====
{"action":"payment.created","data":{"id":"9"},"date_created":"2026-03-01T00:05:00Z","type":"payment"}
Payment ID: 9
Pago | Ref:5 | Estado:approved | Monto:50`;
    expect(parseWebhookLog(dup)).toHaveLength(1);
  });

  it('venta approved sin date_created previo queda con fecha null', () => {
    const noDate = `==== NUEVO WEBHOOK ====
Payment ID: 77
Pago | Ref:1 | Estado:approved | Monto:30`;
    expect(parseWebhookLog(noDate)[0].fecha).toBe(null);
  });

  it('parsea montos decimales', () => {
    const dec = `Payment ID: 1
Pago | Ref:1 | Estado:approved | Monto:49.99`;
    expect(parseWebhookLog(dec)[0].monto).toBeCloseTo(49.99);
  });

  it('log vacío retorna array vacío', () => {
    expect(parseWebhookLog('')).toEqual([]);
  });
});

describe('resumirCarnets', () => {
  it('agrega totales, monto y serie por día UTC', () => {
    const resumen = resumirCarnets([
      { fecha: '2026-01-28T16:09:18Z', monto: 50, ref: '22', paymentId: 'a' },
      { fecha: '2026-01-28T20:00:00Z', monto: 50, ref: '24', paymentId: 'b' },
      { fecha: '2026-02-01T10:00:00Z', monto: 50, ref: '25', paymentId: 'c' },
    ]);
    expect(resumen.totalAprobados).toBe(3);
    expect(resumen.montoTotal).toBe(150);
    expect(resumen.sinFecha).toBe(0);
    expect(resumen.porDia).toEqual([
      { fecha: '2026-01-28', cantidad: 2, monto: 100 },
      { fecha: '2026-02-01', cantidad: 1, monto: 50 },
    ]);
  });

  it('cuenta las ventas sin fecha aparte y no las mete en la serie', () => {
    const resumen = resumirCarnets([
      { fecha: null, monto: 50, ref: '1', paymentId: 'a' },
      { fecha: '2026-01-28T16:09:18Z', monto: 50, ref: '2', paymentId: 'b' },
    ]);
    expect(resumen.totalAprobados).toBe(2);
    expect(resumen.sinFecha).toBe(1);
    expect(resumen.porDia).toHaveLength(1);
  });
});
