import { describe, it, expect } from 'vitest';
import {
  ventanaDiaArgentina,
  fechaArgentina,
  contactosDelDiaArgentino,
} from '../previoPagoSeguimiento';
import type { PrevioPagoContacto } from '../previoPagoLog';

// Argentina es UTC-3 fijo (sin DST desde 2009), así que el día AR arranca a las 03:00 UTC.
describe('ventanaDiaArgentina', () => {
  it('devuelve el día AR completo cuando el cron corre a las 15hs AR', () => {
    // 2026-07-31 15:00 AR === 2026-07-31 18:00 UTC
    const now = new Date('2026-07-31T18:00:00.000Z');
    expect(ventanaDiaArgentina(now)).toEqual({
      desde: '2026-07-31T03:00:00.000Z',
      hasta: '2026-08-01T03:00:00.000Z',
    });
  });

  it('sigue apuntando al día AR aunque en UTC ya sea el día siguiente', () => {
    // 2026-07-31 22:00 AR === 2026-08-01 01:00 UTC. El día AR sigue siendo el 31.
    const now = new Date('2026-08-01T01:00:00.000Z');
    expect(ventanaDiaArgentina(now)).toEqual({
      desde: '2026-07-31T03:00:00.000Z',
      hasta: '2026-08-01T03:00:00.000Z',
    });
  });

  it('incluye un lead creado a las 00:30 AR y excluye el de las 23:30 AR del día anterior', () => {
    const now = new Date('2026-07-31T18:00:00.000Z');
    const { desde, hasta } = ventanaDiaArgentina(now);

    const dentro = new Date('2026-07-31T03:30:00.000Z'); // 00:30 AR del 31
    const fuera = new Date('2026-07-31T02:30:00.000Z'); // 23:30 AR del 30

    expect(dentro >= new Date(desde) && dentro < new Date(hasta)).toBe(true);
    expect(fuera >= new Date(desde) && fuera < new Date(hasta)).toBe(false);
  });

  it('el límite superior es exclusivo: 00:00 AR del día siguiente ya no entra', () => {
    const now = new Date('2026-07-31T18:00:00.000Z');
    const { hasta } = ventanaDiaArgentina(now);
    const medianocheSiguiente = new Date('2026-08-01T03:00:00.000Z');
    expect(medianocheSiguiente < new Date(hasta)).toBe(false);
  });

  it('en la corrida de las 21hs AR (00:00 UTC exacto) sigue apuntando al día que termina', () => {
    // 2026-07-31 21:00 AR === 2026-08-01 00:00 UTC. El día AR es todavía el 31.
    const now = new Date('2026-08-01T00:00:00.000Z');
    expect(ventanaDiaArgentina(now)).toEqual({
      desde: '2026-07-31T03:00:00.000Z',
      hasta: '2026-08-01T03:00:00.000Z',
    });
  });

  it('cruza fin de mes sin romperse', () => {
    // 2026-09-01 10:00 AR === 2026-09-01 13:00 UTC
    const now = new Date('2026-09-01T13:00:00.000Z');
    expect(ventanaDiaArgentina(now)).toEqual({
      desde: '2026-09-01T03:00:00.000Z',
      hasta: '2026-09-02T03:00:00.000Z',
    });
  });
});

describe('fechaArgentina', () => {
  it('devuelve el día calendario AR en formato YYYY-MM-DD', () => {
    expect(fechaArgentina(new Date('2026-07-31T18:00:00.000Z'))).toBe('2026-07-31');
  });

  it('no adelanta el día cuando en UTC ya cambió pero en AR no', () => {
    // 2026-08-01 01:00 UTC === 2026-07-31 22:00 AR
    expect(fechaArgentina(new Date('2026-08-01T01:00:00.000Z'))).toBe('2026-07-31');
  });

  it('padea mes y día con cero', () => {
    expect(fechaArgentina(new Date('2026-03-05T15:00:00.000Z'))).toBe('2026-03-05');
  });
});

function contacto(over: Partial<PrevioPagoContacto>): PrevioPagoContacto {
  return {
    telefonoNormalizado: '2215551234',
    remoteJid: '5492215551234',
    nombre: 'Test',
    telefonoRaw: '2215551234',
    estados: ['previopago'],
    intentos: 1,
    primerIntento: '2026-07-31 10:00:00',
    ultimoIntento: '2026-07-31 10:00:00',
    compro: false,
    ...over,
  };
}

// El log de optingsha.com.ar se escribe en hora local del servidor (AR), sin offset.
describe('contactosDelDiaArgentino', () => {
  const now = new Date('2026-07-31T18:00:00.000Z'); // 15hs AR del 31

  it('incluye los que hicieron su primer intento hoy', () => {
    const lista = [
      contacto({ remoteJid: 'a', primerIntento: '2026-07-31 09:15:00' }),
      contacto({ remoteJid: 'b', primerIntento: '2026-07-31 00:01:00' }),
    ];
    expect(contactosDelDiaArgentino(lista, now).map((c) => c.remoteJid)).toEqual(['a', 'b']);
  });

  it('excluye los de días anteriores', () => {
    const lista = [
      contacto({ remoteJid: 'viejo', primerIntento: '2026-07-30 23:59:00' }),
      contacto({ remoteJid: 'hoy', primerIntento: '2026-07-31 08:00:00' }),
    ];
    expect(contactosDelDiaArgentino(lista, now).map((c) => c.remoteJid)).toEqual(['hoy']);
  });

  it('excluye a los que ya compraron aunque hayan entrado hoy', () => {
    const lista = [
      contacto({ remoteJid: 'compro', primerIntento: '2026-07-31 08:00:00', compro: true }),
      contacto({ remoteJid: 'no-compro', primerIntento: '2026-07-31 08:00:00' }),
    ];
    expect(contactosDelDiaArgentino(lista, now).map((c) => c.remoteJid)).toEqual(['no-compro']);
  });

  it('devuelve vacío si no entró nadie hoy', () => {
    const lista = [contacto({ primerIntento: '2026-07-29 12:00:00' })];
    expect(contactosDelDiaArgentino(lista, now)).toEqual([]);
  });

  it('ignora fechas con formato inesperado en vez de romperse', () => {
    const lista = [
      contacto({ remoteJid: 'raro', primerIntento: 'no-es-fecha' }),
      contacto({ remoteJid: 'ok', primerIntento: '2026-07-31 11:00:00' }),
    ];
    expect(contactosDelDiaArgentino(lista, now).map((c) => c.remoteJid)).toEqual(['ok']);
  });
});
