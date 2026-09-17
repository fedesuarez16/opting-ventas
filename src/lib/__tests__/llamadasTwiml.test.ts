import { describe, it, expect } from 'vitest';
import {
  toE164, buildDialTwiml, buildConferenceTwiml, HANGUP_TWIML, DIAL_TIMEOUT_SEGUNDOS,
} from '../llamadasTwiml';

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

  it('acorta el timeout del <Dial> para no pagar el silencio del agente', () => {
    const twiml = buildDialTwiml({ destino: '+5492215551234' });
    expect(DIAL_TIMEOUT_SEGUNDOS).toBe(15);
    expect(twiml).toContain('timeout="15"');
  });

  it('permite pisar el timeout', () => {
    const twiml = buildDialTwiml({ destino: '+5492215551234', timeoutSegundos: 25 });
    expect(twiml).toContain('timeout="25"');
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

describe('buildConferenceTwiml', () => {
  it('el agente espera y puede cortar la tanda', () => {
    const twiml = buildConferenceTwiml({ sala: 'sesion-abc123', rol: 'agente' });
    expect(twiml).toContain('startConferenceOnEnter="false"');
    expect(twiml).toContain('endConferenceOnExit="true"');
    expect(twiml).toContain('>sesion-abc123</Conference>');
  });

  it('el lead arranca la charla pero no termina la conferencia al colgar', () => {
    const twiml = buildConferenceTwiml({ sala: 'sesion-abc123', rol: 'lead' });
    expect(twiml).toContain('startConferenceOnEnter="true"');
    expect(twiml).toContain('endConferenceOnExit="false"');
  });

  it('sanitiza el nombre de sala', () => {
    const twiml = buildConferenceTwiml({ sala: 'sala</Conference><Hangup/>', rol: 'lead' });
    expect(twiml).not.toContain('<Hangup/>');
    expect(twiml).toContain('>salaConferenceHangup</Conference>');
  });

  it('cuelga si la sala queda vacía tras sanitizar', () => {
    expect(buildConferenceTwiml({ sala: '!!!', rol: 'lead' })).toBe(HANGUP_TWIML);
  });

  it('incluye el statusCallback de join/leave cuando se pasa', () => {
    const twiml = buildConferenceTwiml({
      sala: 'x1',
      rol: 'agente',
      statusCallbackUrl: 'https://opting-ventas.vercel.app/api/llamadas/discado/sesion/eventos',
    });
    expect(twiml).toContain('statusCallbackEvent="join leave"');
  });
});

describe('buildConferenceTwiml — señal audible', () => {
  it('el lead entra con beep: es la única señal que tiene el agente', () => {
    expect(buildConferenceTwiml({ sala: 'x1', rol: 'lead' })).toContain('beep="onEnter"');
  });

  it('el agente entra sin beep', () => {
    expect(buildConferenceTwiml({ sala: 'x1', rol: 'agente' })).toContain('beep="false"');
  });
});
