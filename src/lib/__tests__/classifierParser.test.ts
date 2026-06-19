import { describe, it, expect } from 'vitest';
import { parseClassifierOutput } from '../classifierParser';
import { PARSER_FIXTURES } from '../classifierParser.fixtures';

describe('parseClassifierOutput — contrato espejo (fixtures compartidos)', () => {
  for (const fx of PARSER_FIXTURES) {
    it(fx.name, () => {
      expect(parseClassifierOutput(fx.input, fx.phone)).toEqual(fx.expected);
    });
  }
});

describe('parseClassifierOutput — invariantes', () => {
  it('nunca lanza ante input no-string', () => {
    expect(() => parseClassifierOutput(undefined as unknown, 'p')).not.toThrow();
    expect(() => parseClassifierOutput(42 as unknown, 'p')).not.toThrow();
    expect(() => parseClassifierOutput(null as unknown, 'p')).not.toThrow();
  });
  it('servicio siempre es null o un valor canonico (nunca undefined)', () => {
    const r = parseClassifierOutput('{"servicio":"xyz"}', 'p');
    expect(r.servicio).toBeNull();
    expect('servicio' in r).toBe(true); // clave SIEMPRE presente (contrato del array binding)
  });
  it('booleanos no-true se quedan en false (estrictos)', () => {
    const r = parseClassifierOutput('{"llamar":"true","empleado":1}', 'p');
    expect(r.llamar).toBe(false); // string "true" NO cuenta
    expect(r.empleado).toBe(false); // 1 NO cuenta
  });
});
