import { normalizarTelefonoAR, type TipoTelefono } from './telefonoAR';

/**
 * Parseo de la base de discado tal como sale de un scrapeo de Google Maps:
 * columnas separadas por TAB, sin encabezado, con espacios de sobra.
 *
 *   <nombre> \t <dirección> \t <teléfono> \t <columna que se descarta>
 */

export interface ContactoParseado {
  nombre: string;
  direccion: string | null;
  telefono_crudo: string;
  telefono_e164: string | null;
  tipo: TipoTelefono | null;
  asumido: boolean;
  motivo: string | null;
}

export interface ResultadoImport {
  contactos: ContactoParseado[];
  /** Filas que no se pudieron interpretar como contacto. */
  descartadas: Array<{ linea: number; texto: string; motivo: string }>;
  /** Repetidos por teléfono normalizado, ya sacados de `contactos`. */
  duplicados: number;
}

function partirColumnas(linea: string): string[] {
  const porTab = linea.split('\t').map((c) => c.trim());
  if (porTab.length >= 3) return porTab;
  // Fallback: algunos pegados colapsan los tabs en 2+ espacios.
  return linea.trim().split(/\s{2,}/).map((c) => c.trim());
}

export function parsearBaseDiscado(texto: string): ResultadoImport {
  const contactos: ContactoParseado[] = [];
  const descartadas: ResultadoImport['descartadas'] = [];
  const vistos = new Set<string>();
  let duplicados = 0;

  const lineas = (texto ?? '').split(/\r?\n/);

  lineas.forEach((linea, i) => {
    if (!linea.trim()) return;

    const cols = partirColumnas(linea);
    const [nombre = '', direccion = '', telefono = ''] = cols;

    if (!nombre) {
      descartadas.push({ linea: i + 1, texto: linea.trim(), motivo: 'Sin nombre' });
      return;
    }
    if (!telefono) {
      descartadas.push({ linea: i + 1, texto: linea.trim(), motivo: 'Sin teléfono' });
      return;
    }

    const { e164, tipo, asumido, motivo } = normalizarTelefonoAR(telefono);

    // Dedup por número normalizado; si no normalizó, por el crudo.
    const clave = e164 ?? `crudo:${telefono.replace(/\D/g, '')}`;
    if (vistos.has(clave)) {
      duplicados++;
      return;
    }
    vistos.add(clave);

    contactos.push({
      nombre,
      direccion: direccion || null,
      telefono_crudo: telefono,
      telefono_e164: e164,
      tipo,
      asumido,
      motivo,
    });
  });

  return { contactos, descartadas, duplicados };
}
