export type LeadStatus = 'frío' | 'tibio' | 'caliente' | 'llamada' | 'visita' | 'inicial' | string; // Permite estados personalizados

export type PropertyType = 'departamento' | 'casa' | 'PH' | 'terreno' | 'local';

export type InterestReason = 'inversión' | 'mudanza' | 'primera vivienda' | 'otro';

export interface Lead {
  id: string;
  nombreCompleto: string;
  email: string;
  telefono: string;
  estado: LeadStatus;
  presupuesto: number;
  zonaInteres: string;
  tipoPropiedad: PropertyType;
  superficieMinima: number;
  cantidadAmbientes: number;
  motivoInteres: InterestReason;
  fechaContacto: string;
  observaciones?: string;
  // Campos opcionales provenientes del esquema de Supabase
  whatsapp_id?: string;
  phone?: string; // Campo phone de la tabla leads (PRIORITARIO)
  phone_from?: string; // Campo phone_from de la tabla leads
  nombre?: string;
  zona?: string;
  tipo_propiedad?: string;
  forma_pago?: string;
  intencion?: string;
  caracteristicas_buscadas?: string;
  caracteristicas_venta?: string;
  propiedades_mostradas?: string;
  propiedad_interes?: string;
  ultima_interaccion?: string;
  created_at?: string;
  updated_at?: string;
  seguimientos_count?: number;
  notas?: string;
  estado_chat?: number; // Legacy; preferir chat_activo
  /** Columna public.leads.chat_activo: 0 = chat activo, 1 = chat inactivo */
  chat_activo?: number;
  chatwoot_conversation_id?: number; // ID de la conversación en Chatwoot para calificación automática
  /** Columna opcional en public.leads */
  etiqueta?: string | null;
  /** Calidad del lead 1–3 (columna opcional en public.leads) */
  calidad?: number | null;
}

export interface FilterOptions {
  zona?: string;
  presupuestoMaximo?: number;
  tipoPropiedad?: PropertyType;
  estado?: LeadStatus;
  cantidadAmbientesMinima?: number;
  motivoInteres?: InterestReason;
  propiedadInteres?: string; // Filtrar por campaña de propiedad
}

// Nuevos tipos para propiedades inmobiliarias

export type PropertyStatus = 'disponible' | 'reservada' | 'vendida' | 'alquilada';

export type PropertyOperation = 'venta' | 'alquiler' | 'venta/alquiler';

export interface Property {
  id: string;
  titulo: string;
  descripcion: string;
  tipo: PropertyType;
  operacion: PropertyOperation;
  estado: PropertyStatus;
  precio: number;
  moneda: 'USD' | 'ARS';
  direccion: string;
  zona: string;
  superficie: number; // en metros cuadrados
  ambientes: number;
  dormitorios: number;
  banos: number;
  cochera: boolean;
  cocherasCount?: number;
  antiguedad?: number; // en años
  orientacion?: string;
  amenities: string[];
  imagenes: string[];
  destacada: boolean;
  fechaPublicacion: string;
}

// Tipos para automatizaciones de mensajes
export type NodeType = 'trigger' | 'action' | 'condition' | 'delay' | 'message';

export interface Position {
  x: number;
  y: number;
}

export interface NodeData {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  icon?: string;
  position: Position;
  data: any;
}

export interface NodeConnection {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
  label?: string;
}

export interface AutomationWorkflow {
  id: string;
  name: string;
  description: string;
  active: boolean;
  nodes: NodeData[];
  connections: NodeConnection[];
  createdAt: string;
  updatedAt: string;
}

export interface TriggerNodeData {
  eventType: string;
  conditions: Record<string, any>;
}

export interface MessageNodeData {
  messageTemplate: string;
  variables: Record<string, string>;
  channel: 'email' | 'sms' | 'whatsapp' | 'notificacion';
}

export interface ConditionNodeData {
  condition: string;
  comparator: '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains';
  value: string | number | boolean;
}

export interface DelayNodeData {
  delayTime: number;
  timeUnit: 'seconds' | 'minutes' | 'hours' | 'days';
}

export interface ActionNodeData {
  actionType: string;
  parameters: Record<string, any>;
} 

// Tipos para documentos (propiedades provenientes de la tabla "documents")
export interface PropertyDocument {
  id: string; // uuid
  tipo_de_propiedad: string; // text
  direccion: string; // text
  zona: string; // text
  valor: string; // text (podría incluir símbolo/moneda)
  dormitorios: string; // text
  banos: string; // text
  patio_parque: string; // text
  garage: string; // text
  mts_const: string; // text
  lote: string; // text
  piso: string; // text
  link: string; // text
  columna_1: string; // text
  embedding?: string; // public.vector(1536) serializado
  metadata?: any; // jsonb
  content?: string; // text
  descripcion?: string; // text
}

export interface DocumentFilterOptions {
  zona?: string;
  tipoDePropiedad?: string;
  valorMaximo?: number; // Parseado desde string "valor" si contiene número
  dormitoriosMin?: number;
  banosMin?: number;
}

// Tipo para la tabla propiedades de Supabase
export interface SupabasePropiedad {
  id: string;
  tipo_de_propiedad: string;
  direccion: string;
  zona: string;
  valor: string;
  dormitorios: string;
  banos: string;
  patio_parque: string;
  garage: string;
  mts_const: string;
  lote: string;
  piso: string;
  link: string;
  columna_1: string;
  apto_banco: string;
  alternativa_menor_1: string;
  alternativa_menor_2: string;
  alternativa_menor_3: string;
  alterniva_menor_4: string;
  alternativa_menor_5: string;
  alternativa_mayor: string;
  alternativa_mayor_2: string;
  alternativa_mayor_3: string;
  alternativa_mayor_4: string;
  alternativa_mayor_5: string;
  notas?: string;
}