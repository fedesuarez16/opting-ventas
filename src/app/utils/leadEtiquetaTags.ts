import type { Lead } from '../types';

/** Etiquetas desde columnas boolean en leads / leads_outbound */
export const LEAD_BOOLEAN_ETIQUETA_FIELDS: { field: keyof Lead; label: string }[] = [
  { field: 'llamada_agendada', label: 'Llamada agendada' },
  { field: 'llamar', label: 'Llamar' },
  { field: 'deriva_humano', label: 'Deriva humano' },
  { field: 'presupuesto_etiqueta', label: 'Presupuesto' },
  { field: 'inspeccion', label: 'Inspección' },
  { field: 'empleado', label: 'Empleado' },
  { field: 'dueno', label: 'Dueño' },
];

export function getLeadBooleanEtiquetaLabels(lead: Lead): string[] {
  return LEAD_BOOLEAN_ETIQUETA_FIELDS.filter(({ field }) => lead[field] === true).map(
    ({ label }) => label
  );
}

/** Inspección, presupuesto o deriva humano: requieren seguimiento / notificación. */
export function leadHasAttentionEtiquetas(lead: Lead): boolean {
  return (
    lead.inspeccion === true || lead.presupuesto_etiqueta === true || lead.deriva_humano === true
  );
}
