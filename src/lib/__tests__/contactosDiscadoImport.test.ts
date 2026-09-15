import { describe, it, expect } from 'vitest';
import {
  parsearBaseDiscado,
  parsearDelimitado,
  detectarSeparador,
} from '../contactosDiscadoImport';

// Formato pegado desde el portapapeles: TAB, sin encabezado.
const TSV = [
  'Kersen Recoleta\tJuncal 2481, C1425AYA Cdad. Autónoma de Buenos Aires\t+54 11 7854-8612\tyes',
  'Keyaki\tHumboldt 1895, C1425 Cdad. Autónoma de Buenos Aires\t54 9 11 3302-2112\tyes',
  'Kimchi Garden\tSan Martín 687, C1004 Cdad. Autónoma de Buenos Aires\t1124579173\tyes',
  'Kronopios\tAv. Elcano 3640, C1427 Cdad. Autónoma de Buenos Aires\t+54 11 6456-7221\tyes',
  'Kronopios\tAv. Elcano 3640, C1427 Cdad. Autónoma de Buenos Aires\t+54 11 6456-7221\tyes',
].join('\n');

// Formato real del CSV exportado de la planilla: primera columna vacía,
// direcciones entre comillas con comas adentro, columna de observaciones.
const CSV = [
  ',,,,,,,',
  ',"MUSGO — Fine Dining\nen Palermo","Nicaragua 4758, C1004 Cdad. Autónoma de Buenos Aires",111564073841,yes,no responde ,,',
  ',_MH.PASTELERIA,"Avenida Teniente General Luis Dellepiane 4790, C1439 CABA",+54 11 3567-6243,yes,me corto ,,',
  ',"“ la vaca roja carnes”","Gascón 801, C1181ACO Cdad. Autónoma de Buenos Aires",+54 11 6687-4595,yes,,,',
].join('\n');

describe('parsearDelimitado', () => {
  it('respeta comas dentro de comillas', () => {
    const filas = parsearDelimitado('a,"b, con coma",c', ',');
    expect(filas[0]).toEqual(['a', 'b, con coma', 'c']);
  });

  it('respeta saltos de línea dentro de comillas', () => {
    const filas = parsearDelimitado('a,"linea 1\nlinea 2",c', ',');
    expect(filas).toHaveLength(1);
    expect(filas[0][1]).toBe('linea 1\nlinea 2');
  });

  it('soporta comillas escapadas', () => {
    const filas = parsearDelimitado('a,"dice ""hola""",c', ',');
    expect(filas[0][1]).toBe('dice "hola"');
  });
});

describe('detectarSeparador', () => {
  it('reconoce CSV', () => {
    expect(detectarSeparador(CSV).nombre).toBe('coma');
  });

  it('reconoce TSV', () => {
    expect(detectarSeparador(TSV).nombre).toBe('tab');
  });

  it('cae a espacios cuando no hay separador real', () => {
    const pegado = 'La 26 Panadería    Av. Avellaneda 5400    +54 11 3136-9704';
    expect(detectarSeparador(pegado).nombre).toBe('espacios');
  });
});

describe('parsearBaseDiscado — CSV real de la planilla', () => {
  it('ubica las columnas aunque la primera esté vacía', () => {
    const { mapeo } = parsearBaseDiscado(CSV);
    expect(mapeo).not.toBeNull();
    expect(mapeo!.nombre).toBe(1);
    expect(mapeo!.direccion).toBe(2);
    expect(mapeo!.telefono).toBe(3);
    expect(mapeo!.observacion).toBe(5);
  });

  it('colapsa el salto de línea que viene dentro del nombre', () => {
    const { contactos } = parsearBaseDiscado(CSV);
    expect(contactos[0].nombre).toBe('MUSGO — Fine Dining en Palermo');
  });

  it('conserva la dirección con sus comas', () => {
    const { contactos } = parsearBaseDiscado(CSV);
    expect(contactos[0].direccion).toBe('Nicaragua 4758, C1004 Cdad. Autónoma de Buenos Aires');
  });

  it('normaliza el formato 11 + 15 + abonado', () => {
    const { contactos } = parsearBaseDiscado(CSV);
    expect(contactos[0].telefono_e164).toBe('+5491164073841');
    expect(contactos[0].tipo).toBe('movil');
  });

  it('preserva las observaciones del trabajo previo', () => {
    const { contactos } = parsearBaseDiscado(CSV);
    expect(contactos[0].observacion).toBe('no responde');
    expect(contactos[1].observacion).toBe('me corto');
    expect(contactos[2].observacion).toBeNull();
  });

  it('ignora la fila totalmente vacía', () => {
    const { contactos } = parsearBaseDiscado(CSV);
    expect(contactos).toHaveLength(3);
  });
});

describe('parsearBaseDiscado — pegado con TAB', () => {
  it('sigue funcionando con el formato viejo', () => {
    const { contactos } = parsearBaseDiscado(TSV);
    expect(contactos[0].nombre).toBe('Kersen Recoleta');
    expect(contactos[0].telefono_e164).toBe('+541178548612');
  });

  it('deduplica por teléfono normalizado', () => {
    const { contactos, duplicados } = parsearBaseDiscado(TSV);
    expect(duplicados).toBe(1);
    expect(contactos.filter((c) => c.nombre === 'Kronopios')).toHaveLength(1);
  });

  it('normaliza el número crudo a +54, nunca a +1', () => {
    const { contactos } = parsearBaseDiscado(TSV);
    const kimchi = contactos.find((c) => c.nombre === 'Kimchi Garden')!;
    expect(kimchi.telefono_e164).toBe('+541124579173');
    expect(kimchi.telefono_e164!.startsWith('+54')).toBe(true);
  });

  it('no toma la columna yes/no como observación', () => {
    const { mapeo } = parsearBaseDiscado(TSV);
    expect(mapeo!.observacion).toBeNull();
  });
});

describe('parsearBaseDiscado — bordes', () => {
  it('devuelve mapeo null si no hay ninguna columna de teléfonos', () => {
    const r = parsearBaseDiscado('uno,dos,tres\ncuatro,cinco,seis');
    expect(r.mapeo).toBeNull();
    expect(r.contactos).toHaveLength(0);
  });

  it('descarta la fila sin teléfono pero conserva las buenas', () => {
    const texto = [
      'Uno,Una dirección,+54 11 6687-4595',
      'Dos,Otra dirección,',
      'Tres,Tercera dirección,+54 11 3567-6243',
    ].join('\n');
    const { contactos, descartadas } = parsearBaseDiscado(texto);
    expect(contactos).toHaveLength(2);
    expect(descartadas).toHaveLength(1);
    expect(descartadas[0].motivo).toBe('Sin teléfono');
  });

  it('marca el motivo cuando el número no es argentino', () => {
    const texto = [
      'Gringo Inc,Nueva York,+1 415 555 2671',
      'Local,CABA,+54 11 3567-6243',
    ].join('\n');
    const { contactos } = parsearBaseDiscado(texto);
    const gringo = contactos.find((c) => c.nombre === 'Gringo Inc')!;
    expect(gringo.telefono_e164).toBeNull();
    expect(gringo.motivo).toMatch(/argentin/i);
  });
});
