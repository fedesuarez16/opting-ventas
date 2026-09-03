import { describe, it, expect } from 'vitest';
import { toE164, buildTemplateBody, buildTextBody } from '../ycloudSender';

describe('toE164', () => {
  it('agrega el + y saca separadores', () => {
    expect(toE164('54 9 11 5387-1016')).toBe('+5491153871016');
  });

  it('no duplica el + si ya viene en formato E.164', () => {
    expect(toE164('+5491153871016')).toBe('+5491153871016');
  });

  it('devuelve null si no hay suficientes dígitos', () => {
    expect(toE164('123')).toBeNull();
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe('buildTemplateBody', () => {
  it('arma el body que espera YCloud sendDirectly', () => {
    expect(
      buildTemplateBody({
        from: '+5491123312054',
        to: '+5491153871016',
        templateName: 'template_utility_20260730160029',
        language: 'es_AR',
      })
    ).toEqual({
      from: '+5491123312054',
      to: '+5491153871016',
      type: 'template',
      template: {
        name: 'template_utility_20260730160029',
        language: { code: 'es_AR', policy: 'deterministic' },
      },
    });
  });
});

describe('buildTextBody', () => {
  // Texto libre: sólo se puede mandar dentro de la ventana de servicio de 24hs, pero a
  // cambio no necesita plantilla aprobada por Meta y no tiene costo.
  it('arma el body de un mensaje de texto libre', () => {
    expect(
      buildTextBody({
        from: '+5491141872290',
        to: '+5491153871016',
        texto: 'Gracias por inscribirte!',
      })
    ).toEqual({
      from: '+5491141872290',
      to: '+5491153871016',
      type: 'text',
      text: { body: 'Gracias por inscribirte!' },
    });
  });

  it('no arrastra la estructura de template', () => {
    expect(
      buildTextBody({ from: '+5491141872290', to: '+5491153871016', texto: 'hola' })
    ).not.toHaveProperty('template');
  });
});
