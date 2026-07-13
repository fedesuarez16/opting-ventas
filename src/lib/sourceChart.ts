import type { Lead } from '../app/types';

export const META_BLUE = '#1877F2';
export const GOOGLE_RED = '#EA4335';
export const SIN_DATO = '#9CA3AF';

/**
 * Agrega leads por source (meta | google | null/undefined => "Sin dato").
 * Ver design ADR-4: única agregación de dashboard extraída como función pura testeable.
 */
export function computeSourceCounts(leads: Lead[]): { name: string; value: number; fill: string }[] {
  let meta = 0;
  let google = 0;
  let sin = 0;

  for (const l of leads) {
    if (l.source === 'meta') meta++;
    else if (l.source === 'google') google++;
    else sin++;
  }

  return [
    { name: 'Meta', value: meta, fill: META_BLUE },
    { name: 'Google', value: google, fill: GOOGLE_RED },
    { name: 'Sin dato', value: sin, fill: SIN_DATO },
  ].filter(d => d.value > 0);
}
