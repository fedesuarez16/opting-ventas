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
    displayName: 'Previo Pago — Seguimiento mismo día (aprobada)',
    hsmName: 'template_utility_20260730160029',
    language: 'es_AR',
    phoneFrom: '+5491123312054',
    description:
      'Utility aprobada el 2026-07-30. Verificada en YCloud: vive en la WABA 1975639926629842 (S&H), NO en la de Carnet, así que se manda por +5491123312054. La usa el cron de las 15hs AR.',
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

export function getTemplateByKey(key: string): WhatsappTemplate | undefined {
  return WHATSAPP_TEMPLATES.find((t) => t.key === key);
}
