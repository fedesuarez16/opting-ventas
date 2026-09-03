import { describe, it, expect } from 'vitest';
import {
  LOOKBACK_HORAS,
  DIAS_INGESTA,
  inicioVentanaSeguimiento,
  fechaArgentina,
  contactosDeUltimosDias,
} from '../previoPagoSeguimiento';
import type { PrevioPagoContacto } from '../previoPagoLog';

// Argentina es UTC-3 fijo (sin DST desde 2009), así que el día AR arranca a las 03:00 UTC.
describe('inicioVentanaSeguimiento', () => {
  it('retrocede exactamente LOOKBACK_HORAS desde el momento de la corrida', () => {
    const now = new Date('2026-07-31T18:00:00.000Z'); // 15hs AR del 31
    expect(inicioVentanaSeguimiento(now)).toBe('2026-07-29T18:00:00.000Z');
  });

  it('acepta un lookback explícito', () => {
    const now = new Date('2026-07-31T18:00:00.000Z');
    expect(inicioVentanaSeguimiento(now, 6)).toBe('2026-07-31T12:00:00.000Z');
  });

  // Este es el bug que la ventana rodante viene a arreglar: con la ventana de día
  // calendario, un lead creado a las 22hs AR del 31 quedaba fuera de la corrida de las
  // 15hs del 1 (día distinto) y no volvía a entrar nunca.
  it('alcanza al lead que entró entre las 21 y las 24hs AR del día anterior', () => {
    const corrida = new Date('2026-08-01T18:00:00.000Z'); // 15hs AR del 1
    const leadDeLaNoche = new Date('2026-08-01T01:00:00.000Z'); // 22hs AR del 31
    expect(leadDeLaNoche >= new Date(inicioVentanaSeguimiento(corrida))).toBe(true);
  });

  it('cubre un día entero de log caído: el lead de anteayer sigue adentro a 48hs', () => {
    const corrida = new Date('2026-08-02T18:00:00.000Z'); // 15hs AR del 2
    const leadDeAntesDeAyer = new Date('2026-07-31T19:00:00.000Z'); // 16hs AR del 31
    expect(leadDeAntesDeAyer >= new Date(inicioVentanaSeguimiento(corrida))).toBe(true);
  });

  // El piso existe para que el cron no resucite leads viejos: los de hace una semana
  // ya no son un "recupero", son spam.
  it('deja fuera lo anterior al lookback', () => {
    const corrida = new Date('2026-08-02T18:00:00.000Z');
    const leadViejo = new Date('2026-07-29T17:59:00.000Z');
    expect(leadViejo >= new Date(inicioVentanaSeguimiento(corrida))).toBe(false);
  });

  it('cruza fin de mes sin romperse', () => {
    const now = new Date('2026-09-01T13:00:00.000Z');
    expect(inicioVentanaSeguimiento(now)).toBe('2026-08-30T13:00:00.000Z');
  });

  it('el lookback por defecto cubre el hueco nocturno con margen', () => {
    // El peor caso es entrar 00:00 AR (justo después de la corrida de las 21hs) y tener
    // que esperar a la corrida de las 15hs del día siguiente: 15hs de espera.
    expect(LOOKBACK_HORAS).toBeGreaterThan(15);
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
describe('contactosDeUltimosDias', () => {
  const now = new Date('2026-07-31T18:00:00.000Z'); // 15hs AR del 31

  it('incluye los que hicieron su primer intento hoy', () => {
    const lista = [
      contacto({ remoteJid: 'a', primerIntento: '2026-07-31 09:15:00' }),
      contacto({ remoteJid: 'b', primerIntento: '2026-07-31 00:01:00' }),
    ];
    expect(contactosDeUltimosDias(lista, now).map((c) => c.remoteJid)).toEqual(['a', 'b']);
  });

  // El que abandonó el pago a las 22hs no llegaba a ninguna corrida de su propio día, y
  // al día siguiente el filtro "sólo hoy" lo descartaba: nunca se creaba como lead.
  it('incluye al que abandonó anoche, después de la última corrida', () => {
    const lista = [contacto({ remoteJid: 'nocturno', primerIntento: '2026-07-30 22:30:00' })];
    expect(contactosDeUltimosDias(lista, now).map((c) => c.remoteJid)).toEqual(['nocturno']);
  });

  it('excluye los anteriores al lookback de días', () => {
    const lista = [
      contacto({ remoteJid: 'viejo', primerIntento: '2026-07-28 12:00:00' }),
      contacto({ remoteJid: 'ayer', primerIntento: '2026-07-30 08:00:00' }),
      contacto({ remoteJid: 'hoy', primerIntento: '2026-07-31 08:00:00' }),
    ];
    expect(contactosDeUltimosDias(lista, now).map((c) => c.remoteJid)).toEqual(['ayer', 'hoy']);
  });

  it('respeta un lookback explícito de un solo día', () => {
    const lista = [
      contacto({ remoteJid: 'ayer', primerIntento: '2026-07-30 08:00:00' }),
      contacto({ remoteJid: 'hoy', primerIntento: '2026-07-31 08:00:00' }),
    ];
    expect(contactosDeUltimosDias(lista, now, 1).map((c) => c.remoteJid)).toEqual(['hoy']);
  });

  it('excluye a los que ya compraron aunque hayan entrado hoy', () => {
    const lista = [
      contacto({ remoteJid: 'compro', primerIntento: '2026-07-31 08:00:00', compro: true }),
      contacto({ remoteJid: 'no-compro', primerIntento: '2026-07-31 08:00:00' }),
    ];
    expect(contactosDeUltimosDias(lista, now).map((c) => c.remoteJid)).toEqual(['no-compro']);
  });

  it('cruza el cambio de mes hacia atrás', () => {
    const primeroDeAgosto = new Date('2026-08-01T18:00:00.000Z');
    const lista = [contacto({ remoteJid: 'julio', primerIntento: '2026-07-31 20:00:00' })];
    expect(contactosDeUltimosDias(lista, primeroDeAgosto).map((c) => c.remoteJid)).toEqual(['julio']);
  });

  it('devuelve vacío si no entró nadie en la ventana', () => {
    const lista = [contacto({ primerIntento: '2026-07-25 12:00:00' })];
    expect(contactosDeUltimosDias(lista, now)).toEqual([]);
  });

  it('ignora fechas con formato inesperado en vez de romperse', () => {
    const lista = [
      contacto({ remoteJid: 'raro', primerIntento: 'no-es-fecha' }),
      contacto({ remoteJid: 'ok', primerIntento: '2026-07-31 11:00:00' }),
    ];
    expect(contactosDeUltimosDias(lista, now).map((c) => c.remoteJid)).toEqual(['ok']);
  });

  it('la ingesta mira al menos hoy y ayer', () => {
    expect(DIAS_INGESTA).toBeGreaterThanOrEqual(2);
  });
});
