export interface WhatsappTemplate {
  key: string;
  displayName: string;
  hsmName: string;
  language: string;
  description: string;
  body?: string;
}

export const WHATSAPP_TEMPLATES: WhatsappTemplate[] = [
  {
    key: 'marketing_carnet',
    displayName: 'Marketing — Carnet (aprobada)',
    hsmName: 'template_marketing_20260509044108',
    language: 'es_AR',
    description: 'Plantilla de marketing aprobada para WABA Carnet (+5491141872290) el 2026-05-09. Idioma es_AR.',
  },
  {
    key: 'marketing_sh',
    displayName: 'Marketing — S&H (aprobada)',
    hsmName: 'template_marketing_20260401041159',
    language: 'es_AR',
    description: 'Plantilla de marketing aprobada para WABA S&H (+5491123312054) el 2026-04-01. Idioma es_AR.',
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
