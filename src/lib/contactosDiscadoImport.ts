import { normalizarTelefonoAR, type TipoTelefono } from './telefonoAR';

/**
 * Importador de bases de discado.
 *
 * Tiene que tragarse lo que salga de una planilla: CSV con comas, TSV pegado
 * desde el portapapeles, columnas vacías al principio, direcciones con comas
 * adentro (entre comillas) y hasta saltos de línea DENTRO de un campo.
 *
 * Por eso no asume posiciones fijas de columna: detecta el separador y después
 * deduce qué columna es cuál mirando el contenido.
 */

export interface ContactoParseado {
  nombre: string;
  direccion: string | null;
  telefono_crudo: string;
  telefono_e164: string | null;
  tipo: TipoTelefono | null;
  asumido: boolean;
  motivo: string | null;
  observacion: string | null;
}

export interface ResultadoImport {
  contactos: ContactoParseado[];
  descartadas: Array<{ linea: number; texto: string; motivo: string }>;
  duplicados: number;
  /** Qué columna se interpretó como qué, para mostrarlo en la vista previa. */
  mapeo: MapeoColumnas | null;
}

export type NombreSeparador = 'coma' | 'tab' | 'punto y coma' | 'espacios';

export interface MapeoColumnas {
  nombre: number;
  direccion: number | null;
  telefono: number;
  observacion: number | null;
  separador: NombreSeparador;
}

/** Parser tipo RFC 4180: comillas dobles, separadores y saltos de línea dentro del campo. */
export function parsearDelimitado(texto: string, sep: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;
  let i = 0;

  while (i < texto.length) {
    const c = texto[i];

    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i += 2; continue; }
        enComillas = false; i++; continue;
      }
      campo += c; i++; continue;
    }

    if (c === '"') { enComillas = true; i++; continue; }
    if (c === sep) { fila.push(campo); campo = ''; i++; continue; }
    if (c === '\r') { i++; continue; }

    if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
      i++;
      continue;
    }

    campo += c;
    i++;
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas;
}

const SEPARADORES: Array<{ char: string; nombre: NombreSeparador }> = [
  { char: '\t', nombre: 'tab' },
  { char: ',', nombre: 'coma' },
  { char: ';', nombre: 'punto y coma' },
];

/** Gana el separador que produzca más columnas de forma consistente. */
export function detectarSeparador(texto: string): { char: string; nombre: NombreSeparador } {
  let mejor = SEPARADORES[0];
  let mejorPuntaje = 0;

  for (const s of SEPARADORES) {
    const filas = parsearDelimitado(texto, s.char).filter((f) => f.some((c) => c.trim()));
    if (filas.length === 0) continue;
    const anchos = filas.slice(0, 50).map((f) => f.length);
    const promedio = anchos.reduce((a, b) => a + b, 0) / anchos.length;
    if (promedio > mejorPuntaje) {
      mejorPuntaje = promedio;
      mejor = s;
    }
  }

  // Ningún separador dio más de una columna: es un pegado con espacios.
  if (mejorPuntaje < 2) return { char: ' ', nombre: 'espacios' };
  return mejor;
}

/**
 * Una columna con vocabulario chico (yes/no, x/vacío) no es nombre ni observación.
 *
 * El corte es PROPORCIONAL a propósito: con un umbral fijo ("3 valores únicos o
 * menos"), un archivo de 3 filas hace que hasta la columna de nombres parezca
 * categórica y la detección se cae entera.
 */
function esBinaria(valores: string[]): boolean {
  const unicos = new Set(valores.map((v) => v.trim().toLowerCase()).filter(Boolean));
  if (unicos.size === 0) return false;
  return unicos.size <= 3 && unicos.size < valores.length * 0.5;
}

/**
 * ¿Este valor tiene PINTA de teléfono?
 *
 * No alcanza con que normalice: "Nicaragua 4758, C1004 CABA" deja los dígitos
 * 47581004 — ocho dígitos, que el normalizador toma como un número de CABA sin
 * área. Sin este filtro, la columna de direcciones gana la detección.
 */
function pareceTelefono(valor: string): boolean {
  return /^[\d\s\-+().]+$/.test(valor.trim());
}

/**
 * Deduce qué columna es cuál por contenido, no por posición.
 *
 * El ancla es el teléfono: es la única columna reconocible sin ambigüedad
 * (la que más valores normaliza a un número argentino válido). El resto se
 * ubica en relación a ella.
 */
export function detectarColumnas(filas: string[][]): MapeoColumnas | null {
  const conDatos = filas.filter((f) => f.some((c) => c.trim()));
  if (conDatos.length === 0) return null;

  const ancho = Math.max(...conDatos.map((f) => f.length));
  const muestra = conDatos.slice(0, 200);
  const col = (i: number) => muestra.map((f) => (f[i] ?? '').trim());

  // --- teléfono: mayor proporción de números argentinos válidos
  let telefono = -1;
  let mejorRatio = 0;
  for (let i = 0; i < ancho; i++) {
    const valores = col(i).filter(Boolean);
    if (valores.length === 0) continue;
    const validos = valores.filter((v) => pareceTelefono(v) && normalizarTelefonoAR(v).e164).length;
    const ratio = validos / valores.length;
    if (ratio > mejorRatio && ratio >= 0.5) {
      mejorRatio = ratio;
      telefono = i;
    }
  }
  if (telefono === -1) return null;

  // --- nombre: primera columna con texto propio que no sea el teléfono
  let nombre = -1;
  for (let i = 0; i < ancho; i++) {
    if (i === telefono) continue;
    const valores = col(i).filter(Boolean);
    if (valores.length < muestra.length * 0.5) continue;
    if (esBinaria(valores)) continue;
    nombre = i;
    break;
  }
  if (nombre === -1) return null;

  // --- dirección: siguiente columna con texto, antes o después del teléfono
  let direccion: number | null = null;
  for (let i = nombre + 1; i < ancho; i++) {
    if (i === telefono) continue;
    const valores = col(i).filter(Boolean);
    if (valores.length < muestra.length * 0.3) continue;
    if (esBinaria(valores)) continue;
    direccion = i;
    break;
  }

  // --- observación: después del teléfono, vocabulario variado (no yes/no)
  let observacion: number | null = null;
  for (let i = telefono + 1; i < ancho; i++) {
    if (i === direccion) continue;
    const valores = col(i).filter(Boolean);
    if (valores.length === 0) continue;
    if (esBinaria(valores)) continue;
    observacion = i;
    break;
  }

  return { nombre, direccion, telefono, observacion, separador: 'coma' };
}

export function parsearBaseDiscado(texto: string): ResultadoImport {
  const contactos: ContactoParseado[] = [];
  const descartadas: ResultadoImport['descartadas'] = [];
  const vistos = new Set<string>();
  let duplicados = 0;

  const sep = detectarSeparador(texto ?? '');

  const filas = sep.nombre === 'espacios'
    // Pegado sin separador real: las columnas quedan partidas por 2+ espacios.
    ? (texto ?? '').split(/\r?\n/).map((l) => l.trim().split(/\s{2,}/))
    : parsearDelimitado(texto ?? '', sep.char);

  const mapeo = detectarColumnas(filas);
  if (!mapeo) {
    return { contactos: [], descartadas: [], duplicados: 0, mapeo: null };
  }
  mapeo.separador = sep.nombre;

  filas.forEach((cols, i) => {
    if (!cols.some((c) => c.trim())) return;

    // Los saltos de línea dentro de un campo entrecomillado quedan en el valor:
    // se colapsan para que el nombre no venga partido en dos.
    const nombre = (cols[mapeo.nombre] ?? '').trim().replace(/\s+/g, ' ');
    const telefono = (cols[mapeo.telefono] ?? '').trim();
    const direccion = mapeo.direccion !== null ? (cols[mapeo.direccion] ?? '').trim() : '';
    const observacion = mapeo.observacion !== null ? (cols[mapeo.observacion] ?? '').trim() : '';

    if (!nombre) {
      descartadas.push({ linea: i + 1, texto: cols.join(' | ').slice(0, 120), motivo: 'Sin nombre' });
      return;
    }
    if (!telefono) {
      descartadas.push({ linea: i + 1, texto: nombre, motivo: 'Sin teléfono' });
      return;
    }

    const { e164, tipo, asumido, motivo } = normalizarTelefonoAR(telefono);

    const clave = e164 ?? `crudo:${telefono.replace(/\D/g, '')}`;
    if (vistos.has(clave)) {
      duplicados++;
      return;
    }
    vistos.add(clave);

    contactos.push({
      nombre,
      direccion: direccion.replace(/\s+/g, ' ') || null,
      telefono_crudo: telefono,
      telefono_e164: e164,
      tipo,
      asumido,
      motivo,
      observacion: observacion.replace(/\s+/g, ' ') || null,
    });
  });

  return { contactos, descartadas, duplicados, mapeo };
}
