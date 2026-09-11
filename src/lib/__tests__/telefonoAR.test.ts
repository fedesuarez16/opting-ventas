import { describe, it, expect } from 'vitest';
import { normalizarTelefonoAR, esTelefonoArgentino } from '../telefonoAR';

describe('normalizarTelefonoAR — formatos reales de la base de Google Maps', () => {
  it('formato internacional con 9 (móvil)', () => {
    const r = normalizarTelefonoAR('54 9 11 3302-2112');
    expect(r.e164).toBe('+5491133022112');
    expect(r.tipo).toBe('movil');
    expect(r.asumido).toBe(false);
  });

  it('formato internacional con + y 9', () => {
    expect(normalizarTelefonoAR('+54 9 11 6620-8689').e164).toBe('+5491166208689');
  });

  it('formato internacional sin 9 se respeta como fijo', () => {
    const r = normalizarTelefonoAR('+54 11 7854-8612');
    expect(r.e164).toBe('+541178548612');
    expect(r.tipo).toBe('fijo');
    expect(r.asumido).toBe(false);
  });

  it('10 dígitos crudos se respetan literales (fijo) y quedan marcados', () => {
    const r = normalizarTelefonoAR('1124579173');
    expect(r.e164).toBe('+541124579173');
    expect(r.tipo).toBe('fijo');
    expect(r.asumido).toBe(true);
  });

  it('el mismo número crudo y en formato internacional normalizan igual', () => {
    // Konu Bar en la base real: '1150257177' y '+54 11 5025-7177'.
    expect(normalizarTelefonoAR('1150257177').e164)
      .toBe(normalizarTelefonoAR('+54 11 5025-7177').e164);
  });

  it('prefijo 15 legacy de CABA', () => {
    const r = normalizarTelefonoAR('1524794191');
    expect(r.e164).toBe('+5491124794191');
    expect(r.tipo).toBe('movil');
  });

  it('formato nacional con 0 adelante', () => {
    expect(normalizarTelefonoAR('011 4829-3321').e164).toBe('+541148293321');
  });

  it('formato nacional 0 + área + 15 + abonado', () => {
    const r = normalizarTelefonoAR('011 15 2479-4191');
    expect(r.e164).toBe('+5491124794191');
    expect(r.tipo).toBe('movil');
  });

  it('área de 3 dígitos (La Plata)', () => {
    expect(normalizarTelefonoAR('+54 221 555-1234').e164).toBe('+542215551234');
  });

  it('área de 4 dígitos (interior)', () => {
    expect(normalizarTelefonoAR('+54 2284 55-1234').e164).toBe('+542284551234');
  });

  it('8 dígitos sin área asume CABA y lo marca', () => {
    const r = normalizarTelefonoAR('4829-3321');
    expect(r.e164).toBe('+541148293321');
    expect(r.asumido).toBe(true);
  });
});

describe('normalizarTelefonoAR — rechazos', () => {
  it('rechaza vacío o basura', () => {
    expect(normalizarTelefonoAR('').e164).toBeNull();
    expect(normalizarTelefonoAR(null).e164).toBeNull();
    expect(normalizarTelefonoAR('sin telefono').e164).toBeNull();
  });

  it('rechaza números demasiado cortos', () => {
    expect(normalizarTelefonoAR('12345').e164).toBeNull();
  });

  it('rechaza números demasiado largos', () => {
    expect(normalizarTelefonoAR('549111234567890123').e164).toBeNull();
  });

  it('RECHAZA un número de Estados Unidos', () => {
    const r = normalizarTelefonoAR('+1 415 555 2671');
    expect(r.e164).toBeNull();
    expect(r.motivo).toMatch(/argentin/i);
  });

  it('RECHAZA cualquier código de país que no sea 54', () => {
    expect(normalizarTelefonoAR('+55 11 91234-5678').e164).toBeNull();
    expect(normalizarTelefonoAR('+34 600 123 456').e164).toBeNull();
  });

  it('nunca devuelve un e164 que no empiece con +54', () => {
    const entradas = ['+1 415 555 2671', '1124579173', '+54 11 7854-8612', '00 1 415 555 2671'];
    for (const e of entradas) {
      const { e164 } = normalizarTelefonoAR(e);
      if (e164 !== null) expect(e164.startsWith('+54')).toBe(true);
    }
  });
});

describe('esTelefonoArgentino — guarda final antes de discar', () => {
  it('acepta E.164 argentino', () => {
    expect(esTelefonoArgentino('+5491133022112')).toBe(true);
    expect(esTelefonoArgentino('+541178548612')).toBe(true);
  });

  it('rechaza Estados Unidos y cualquier otro país', () => {
    expect(esTelefonoArgentino('+14155552671')).toBe(false);
    expect(esTelefonoArgentino('+1124579173')).toBe(false);
    expect(esTelefonoArgentino('+5511912345678')).toBe(false);
    expect(esTelefonoArgentino(null)).toBe(false);
  });
});
