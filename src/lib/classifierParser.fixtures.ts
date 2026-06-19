// Contrato input -> expected del classifier parser.
// Fuente de verdad de paridad entre classifierParser.ts y el Code node n8n.
import type { ClassifierResult } from './classifierParser';

export interface ParserFixture {
  name: string;
  input: unknown;
  phone: string;
  expected: ClassifierResult;
}

const SAFE_FLAGS = {
  llamada_agendada: false,
  llamar: false,
  deriva_humano: false,
  presupuesto_etiqueta: false,
  inspeccion: false,
  empleado: false,
  dueno: false,
};

export const PARSER_FIXTURES: ParserFixture[] = [
  {
    name: 'JSON valido sin fences, servicio carnet',
    input: '{"tiene_nombre":true,"llamada_agendada":true,"servicio":"carnet"}',
    phone: '549111',
    expected: { ...SAFE_FLAGS, llamada_agendada: true, servicio: 'carnet', phone: '549111' },
  },
  {
    name: 'JSON con fences markdown, servicio s&h',
    input: '```json\n{"empleado":false,"servicio":"s&h"}\n```',
    phone: '549222',
    expected: { ...SAFE_FLAGS, servicio: 's&h', phone: '549222' },
  },
  {
    name: 'JSON malformado -> safe defaults',
    input: 'No puedo determinar el servicio',
    phone: '549333',
    expected: { ...SAFE_FLAGS, servicio: null, phone: '549333' },
  },
  {
    name: 'servicio SH (mayusculas) -> null',
    input: '{"servicio":"SH"}',
    phone: '549444',
    expected: { ...SAFE_FLAGS, servicio: null, phone: '549444' },
  },
  {
    name: 'servicio Carnet (capitalizado) -> normaliza a carnet (lowercase+trim)',
    input: '{"servicio":"Carnet"}',
    phone: '549555',
    expected: { ...SAFE_FLAGS, servicio: 'carnet', phone: '549555' },
  },
  {
    name: 'servicio ambos -> null',
    input: '{"servicio":"ambos"}',
    phone: '549666',
    expected: { ...SAFE_FLAGS, servicio: null, phone: '549666' },
  },
  {
    name: 'servicio ausente -> null',
    input: '{"llamar":true}',
    phone: '549777',
    expected: { ...SAFE_FLAGS, llamar: true, servicio: null, phone: '549777' },
  },
  {
    name: 'raw vacio -> safe defaults',
    input: '',
    phone: '549888',
    expected: { ...SAFE_FLAGS, servicio: null, phone: '549888' },
  },
];
