export interface WhatsappTemplate {
  key: string;
  displayName: string;
  hsmName: string;
  language: string;
  description: string;
  body?: string;
  /**
   * Línea desde la que se puede enviar esta plantilla. Cada línea vive en una WABA
   * distinta y una plantilla solo existe dentro de SU WABA: mandarla desde la otra da
   * 403 WHATSAPP_TEMPLATE_UNAVAILABLE. `undefined` = todavía sin verificar contra YCloud.
   *   +5491141872290 (Carnet) → WABA 1140283618163985
   *   +5491123312054 (S&H)    → WABA 1975639926629842
   */
  phoneFrom?: string;
}

export const WHATSAPP_TEMPLATES: WhatsappTemplate[] = [
  {
    key: 'marketing_carnet',
    displayName: 'Marketing — Carnet (aprobada)',
    hsmName: 'template_marketing_20260509044108',
    language: 'es_AR',
    phoneFrom: '+5491141872290',
    description: 'Marketing aprobada el 2026-05-09. Verificada en YCloud: WABA 1140283618163985 (Carnet).',
  },
  {
    key: 'marketing_sh',
    displayName: 'Marketing — S&H (aprobada)',
    hsmName: 'template_marketing_20260401041159',
    language: 'es_AR',
    phoneFrom: '+5491123312054',
    description: 'Marketing aprobada el 2026-04-01. Verificada en YCloud: WABA 1975639926629842 (S&H).',
  },
  {
    key: 'previo_pago_seguimiento',
    displayName: 'Previo Pago — Seguimiento mismo día',
    hsmName: 'template_utility_20260731160820',
    language: 'es_AR',
    phoneFrom: '+5491141872290',
    description:
      'Utility del curso de manipulación de alimentos, dada de alta el 2026-07-31 en la WABA 1140283618163985 (Carnet) para poder enviarla por +5491141872290. La usa el cron de las 15hs AR.',
  },
  {
    key: 'previo_pago_resena',
    displayName: 'Previo Pago — Pedido de reseña (aprobada)',
    hsmName: 'template_utility_20260909173015',
    language: 'es_AR',
    phoneFrom: '+5491141872290',
    // Body propuesto para mandar a aprobar a Meta, mismo criterio que las `sh_seguimiento_*`.
    // SIN variables a propósito: `buildTemplateBody` no manda `components`, así que una
    // plantilla con {{1}} se envía con la variable vacía y Meta la rechaza en runtime.
    // El link va en el texto y no en un botón URL por la misma razón — los botones también
    // viajan en `components`. Categoría UTILITY: es el post-venta de una compra concreta,
    // que es lo que Meta acepta acá; redactada como MARKETING la rechazan o la recategorizan.
    body:
      'Hola! Gracias por inscribirte al curso de Manipulación de Alimentos. ' +
      'Queremos saber cómo fue tu experiencia: dejanos tu reseña acá 👉 ' +
      'https://g.page/r/Cf2VgyVMnUb-EBE/review — nos toma un minuto y nos ayuda un montón. ¡Gracias!',
    description:
      'Se le manda a quien SÍ completó el pago (estado `approved` en optingsha.com.ar/estado.log) ' +
      'para pedirle una reseña. Va por la línea de Carnet (WABA 1140283618163985), la misma que el ' +
      'recupero: la plantilla tiene que darse de alta en ESA WABA o YCloud responde 403. ' +
      'Aprobada por Meta el 2026-09-09 (utility, es_AR). Es la vía PRINCIPAL de las reseñas, no un ' +
      'plan B: medido contra el log real, 9 de cada 10 compradores pagan en la web sin escribir nunca ' +
      'por WhatsApp, así que no tienen ventana de servicio abierta y el texto libre no les llega. ' +
      'Se puede apuntar a otro HSM sin deploy seteando `PREVIO_PAGO_RESENA_HSM` (ver HSM_OVERRIDE_ENV).',
  },
  {
    key: 'carnet_recordatorio_v1',
    displayName: 'Recordatorio Carnet (placeholder)',
    hsmName: 'TODO_hsm_carnet_recordatorio',
    language: 'es',
    description: 'Recordatorio de inscripción al curso de carnet de manipulación.',
  },
  {
    key: 'sh_seguimiento_v1',
    displayName: 'Seguimiento S&H (placeholder)',
    hsmName: 'TODO_hsm_sh_seguimiento',
    language: 'es',
    description: 'Seguimiento de consulta de servicios de higiene.',
  },
  {
    key: 'sh_seguimiento_v1_t2',
    displayName: 'Seguimiento S&H — Toque 2 (pendiente Meta)',
    hsmName: 'TODO_hsm_sh_seguimiento_t2',
    language: 'es_AR',
    description: 'T2 (+2 dias) de la cadencia SYH multi-toque. Pendiente aprobacion Meta.',
    body: 'Hola {{nombre}}, soy del equipo de S&H Inmobiliaria. Te dejé un audio hace un par de días sobre las opciones que tenemos para vos en {{zona|CABA}}. ¿Querés que te llame uno de nuestros asesores para coordinar una visita? Respondé SÍ y te agendamos.',
  },
  {
    key: 'sh_seguimiento_v1_t3',
    displayName: 'Seguimiento S&H — Toque 3 (pendiente Meta)',
    hsmName: 'TODO_hsm_sh_seguimiento_t3',
    language: 'es_AR',
    description: 'T3 (+4 dias) de la cadencia SYH multi-toque. Pendiente aprobacion Meta.',
    body: 'Hola {{nombre}}, último mensaje del equipo S&H. Tenemos disponibilidad esta semana para mostrarte propiedades en tu zona. Si te interesa, respondé SÍ y te llamamos hoy mismo. Si no, no te molestamos más.',
  },
];

/**
 * Plantillas cuyo `hsmName` se puede pisar por env var, sin tocar código ni redeployar.
 *
 * Nació para el caso "la plantilla está esperando aprobación de Meta", y se queda como
 * escape hatch operativo: si Meta deshabilita un HSM o hay que rotarlo, se apunta a otro
 * seteando la env var, sin commit ni deploy.
 *
 * El default hardcodeado es siempre el nombre verificado contra YCloud — la env var es la
 * excepción, no el camino normal. Si está vacía o sin definir, gana el hardcodeado.
 */
const HSM_OVERRIDE_ENV: Readonly<Record<string, string>> = {
  previo_pago_resena: 'PREVIO_PAGO_RESENA_HSM',
};

/**
 * Devuelve la plantilla, con el `hsmName` pisado por su env var si la tiene seteada.
 *
 * Se lee el env en cada llamada y no al importar el módulo: `WHATSAPP_TEMPLATES` es un
 * const de módulo y en el cliente Next inlinea las env vars sin `NEXT_PUBLIC_` como
 * `undefined`. Resolviendo acá, el server —único que envía— siempre ve el valor real.
 */
export function getTemplateByKey(key: string): WhatsappTemplate | undefined {
  const template = WHATSAPP_TEMPLATES.find((t) => t.key === key);
  if (!template) return undefined;

  const envVar = HSM_OVERRIDE_ENV[template.key];
  const override = envVar ? process.env[envVar]?.trim() : undefined;

  return override ? { ...template, hsmName: override } : template;
}

/** Prefijo que marca un `hsmName` que todavía no existe en Meta. Ver `esPlantillaPendiente`. */
const HSM_PLACEHOLDER_PREFIX = 'TODO_';

/**
 * true si la plantilla todavía no tiene un HSM real dado de alta en Meta.
 *
 * Un cron que dispare contra un placeholder es el peor final posible: YCloud rechaza
 * mensaje por mensaje, el batch queda lleno de `fallado`, y los leads pasaron por el claim
 * atómico quedando marcados como contactados sin haber recibido nada. Chequear esto ANTES
 * de encolar corta el problema de raíz.
 *
 * Función pura.
 */
export function esPlantillaPendiente(template: WhatsappTemplate | undefined): boolean {
  return !template || template.hsmName.startsWith(HSM_PLACEHOLDER_PREFIX);
}
