import { describe, it, expect } from 'vitest';
import { toE164, buildDialTwiml, HANGUP_TWIML } from '../llamadasTwiml';

describe('toE164', () => {
  it('normaliza un celular argentino con separadores', () => {
    expect(toE164('+54 9 221 555-1234')).toBe('+5492215551234');
  });

  it('devuelve null si no hay dígitos', () => {
    expect(toE164('sin numero')).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164(undefined)).toBeNull();
  });
});

describe('buildDialTwiml', () => {
  it('arma el <Dial> hacia el destino normalizado como argentino', () => {
    const twiml = buildDialTwiml({ destino: '11 4123-4567' });
    // Sin el normalizador argentino esto daba '+1141234567' → Estados Unidos.
    expect(twiml).toContain('<Number>+541141234567</Number>');
    expect(twiml).toContain('answerOnBridge="true"');
  });

  it('cuelga en vez de discar si el destino no es argentino', () => {
    expect(buildDialTwiml({ destino: '+1 415 555 2671' })).toBe(HANGUP_TWIML);
    expect(buildDialTwiml({ destino: '+55 11 91234-5678' })).toBe(HANGUP_TWIML);
  });

  it('cuelga si el destino no es usable', () => {
    expect(buildDialTwiml({ destino: null })).toBe(HANGUP_TWIML);
    expect(buildDialTwiml({ destino: '   ' })).toBe(HANGUP_TWIML);
  });

  it('incluye callerId normalizado cuando se pasa', () => {
    const twiml = buildDialTwiml({ destino: '+5492215551234', callerId: '+1 318 583 6762' });
    expect(twiml).toContain('callerId="+13185836762"');
  });

  it('omite callerId si no se pasa', () => {
    const twiml = buildDialTwiml({ destino: '+5492215551234' });
    expect(twiml).not.toContain('callerId');
  });

  it('incluye action con method POST cuando se pasa', () => {
    const twiml = buildDialTwiml({
      destino: '+5492215551234',
      actionUrl: 'https://opting-ventas.vercel.app/api/llamadas/twiml',
    });
    expect(twiml).toContain('action="https://opting-ventas.vercel.app/api/llamadas/twiml"');
    expect(twiml).toContain('method="POST"');
  });

  it('escapa los & de la action url', () => {
    const twiml = buildDialTwiml({
      destino: '+5492215551234',
      actionUrl: 'https://x.test/api?a=1&b=2',
    });
    expect(twiml).toContain('a=1&amp;b=2');
  });
});
