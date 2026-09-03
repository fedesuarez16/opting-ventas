import { describe, it, expect } from 'vitest';
import { esExclusionDefinitiva, type ExclusionReason } from '../bulkSendQueue';

/**
 * La distinción es la que decide si el lead vuelve a la cola en la próxima corrida del
 * cron. Confundirla tiene las dos consecuencias caras: marcar de más deja gente sin la
 * plantilla para siempre, marcar de menos hace que el cron reclame y desmarque los mismos
 * leads en cada corrida (y que en la UI figuren como "sin seguimiento" habiendo recibido).
 */
describe('esExclusionDefinitiva', () => {
  it('ya_enviado es definitiva: es la prueba de que la persona recibió el mensaje', () => {
    expect(esExclusionDefinitiva('ya_enviado')).toBe(true);
  });

  it('duplicado es definitiva: otro lead con el mismo teléfono sí recibió', () => {
    expect(esExclusionDefinitiva('duplicado')).toBe(true);
  });

  it.each<ExclusionReason>(['phone_from_null', 'phone_from_invalido', 'linea_incompatible'])(
    '%s es reintentable: se arregla editando el lead',
    (reason) => {
      expect(esExclusionDefinitiva(reason)).toBe(false);
    }
  );

  it.each<ExclusionReason>(['estado_bloqueado', 'deriva_humano'])(
    '%s es reintentable: si cambia el estado del lead vuelve a corresponder',
    (reason) => {
      expect(esExclusionDefinitiva(reason)).toBe(false);
    }
  );
});
