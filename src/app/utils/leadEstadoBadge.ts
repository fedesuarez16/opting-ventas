/** Normaliza estado para comparar (minúsculas, sin acentos). */
export function normalizeLeadEstadoKey(estado: string | null | undefined): string {
  return (estado || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Pill de estado en tablas: caliente → rojo, frío/frio → azul, tibio → amarillo.
 * Otros estados → gris neutro.
 */
export function getLeadEstadoPillClass(estado: string | null | undefined): string {
  const key = normalizeLeadEstadoKey(estado);
  if (key === 'caliente' || key === 'calientes') {
    return 'bg-red-100 text-red-800 ring-1 ring-inset ring-red-600/20';
  }
  if (key === 'frio' || key === 'frios') {
    return 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-600/20';
  }
  if (key === 'tibio' || key === 'tibios') {
    return 'bg-yellow-100 text-yellow-900 ring-1 ring-inset ring-yellow-600/25';
  }
  return 'bg-gray-100 text-gray-800';
}
