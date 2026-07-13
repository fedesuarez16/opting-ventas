import { describe, it, expect } from 'vitest';
import { computeSourceCounts } from '../sourceChart';
import type { Lead } from '../../app/types';

const META_BLUE = '#1877F2';
const GOOGLE_RED = '#EA4335';
const SIN_DATO = '#9CA3AF';

function makeLead(source: Lead['source']): Lead {
  return {
    id: `id-${Math.random()}`,
    nombreCompleto: 'Test',
    email: '',
    telefono: '',
    estado: 'frío',
    presupuesto: 0,
    zonaInteres: '',
    tipoPropiedad: 'departamento',
    superficieMinima: 0,
    cantidadAmbientes: 0,
    motivoInteres: 'otro',
    fechaContacto: '',
    source,
  };
}

describe('computeSourceCounts', () => {
  it('cuenta meta, google y agrupa null/undefined en "Sin dato"', () => {
    const leads = [
      makeLead('meta'),
      makeLead('meta'),
      makeLead('google'),
      makeLead(null),
      makeLead(undefined),
    ];
    const result = computeSourceCounts(leads);
    expect(result).toEqual([
      { name: 'Meta', value: 2, fill: META_BLUE },
      { name: 'Google', value: 1, fill: GOOGLE_RED },
      { name: 'Sin dato', value: 2, fill: SIN_DATO },
    ]);
  });

  it('filtra buckets con value 0 (ej. sin leads de google)', () => {
    const leads = [makeLead('meta'), makeLead(null)];
    const result = computeSourceCounts(leads);
    expect(result).toEqual([
      { name: 'Meta', value: 1, fill: META_BLUE },
      { name: 'Sin dato', value: 1, fill: SIN_DATO },
    ]);
    expect(result.find(d => d.name === 'Google')).toBeUndefined();
  });

  it('caso 100% "Sin dato" (pre-rollout n8n)', () => {
    const leads = [makeLead(null), makeLead(undefined), makeLead(null)];
    const result = computeSourceCounts(leads);
    expect(result).toEqual([{ name: 'Sin dato', value: 3, fill: SIN_DATO }]);
  });

  it('array vacío retorna array vacío', () => {
    expect(computeSourceCounts([])).toEqual([]);
  });
});
