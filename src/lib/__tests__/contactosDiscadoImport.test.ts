import { describe, it, expect } from 'vitest';
import { parsearBaseDiscado } from '../contactosDiscadoImport';

const MUESTRA = [
  '    Kersen Recoleta\tJuncal 2481, C1425AYA Cdad. Autónoma de Buenos Aires\t+54 11 7854-8612\tyes',
  '    Keyaki\tHumboldt 1895, C1425 Cdad. Autónoma de Buenos Aires, Argentina\t54 9 11 3302-2112\tyes',
  '    Kimchi Garden\tSan Martín 687, C1004 Cdad. Autónoma de Buenos Aires\t1124579173\tyes',
  '    Kronopios\tAv. Elcano 3640, C1427 Cdad. Autónoma de Buenos Aires\t+54 11 6456-7221\tyes',
  '    Kronopios\tAv. Elcano 3640, C1427 Cdad. Autónoma de Buenos Aires\t+54 11 6456-7221\tyes',
].join('\n');

describe('parsearBaseDiscado', () => {
  it('parsea nombre, dirección y teléfono ignorando la cuarta columna', () => {
    const { contactos } = parsearBaseDiscado(MUESTRA);
    expect(contactos[0].nombre).toBe('Kersen Recoleta');
    expect(contactos[0].direccion).toContain('Juncal 2481');
    expect(contactos[0].telefono_crudo).toBe('+54 11 7854-8612');
    expect(contactos[0].telefono_e164).toBe('+541178548612');
  });

  it('deduplica por teléfono normalizado', () => {
    const { contactos, duplicados } = parsearBaseDiscado(MUESTRA);
    expect(duplicados).toBe(1);
    expect(contactos.filter((c) => c.nombre === 'Kronopios')).toHaveLength(1);
  });

  it('normaliza el número crudo de 10 dígitos a +54, nunca a +1', () => {
    const { contactos } = parsearBaseDiscado(MUESTRA);
    const kimchi = contactos.find((c) => c.nombre === 'Kimchi Garden')!;
    expect(kimchi.telefono_e164).toBe('+541124579173');
    expect(kimchi.telefono_e164!.startsWith('+54')).toBe(true);
    expect(kimchi.asumido).toBe(true);
  });

  it('ignora líneas vacías', () => {
    const { contactos } = parsearBaseDiscado('\n\n' + MUESTRA + '\n\n');
    expect(contactos).toHaveLength(4);
  });

  it('descarta filas sin teléfono', () => {
    const { descartadas } = parsearBaseDiscado('Solo Nombre\tUna dirección\t\tyes');
    expect(descartadas).toHaveLength(1);
    expect(descartadas[0].motivo).toBe('Sin teléfono');
  });

  it('soporta pegado con espacios en vez de tabs', () => {
    const conEspacios = 'La 26 Panadería    Av. Avellaneda 5400    +54 11 3136-9704    yes';
    const { contactos } = parsearBaseDiscado(conEspacios);
    expect(contactos).toHaveLength(1);
    expect(contactos[0].nombre).toBe('La 26 Panadería');
    expect(contactos[0].telefono_e164).toBe('+541131369704');
  });

  it('conserva el motivo de rechazo de un número no argentino', () => {
    const { contactos } = parsearBaseDiscado('Gringo Inc\tNueva York\t+1 415 555 2671\tyes');
    expect(contactos[0].telefono_e164).toBeNull();
    expect(contactos[0].motivo).toMatch(/argentin/i);
  });
});
