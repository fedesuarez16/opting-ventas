import { describe, it, expect, afterEach, vi } from 'vitest';
import { parseEstadoLog, resumirPrevioPago } from '../previoPagoLog';
import {
  DIAS_COMPRA_RESENA,
  VENTANA_SERVICIO_HORAS,
  compradoresDeUltimosDias,
  inicioVentanaServicio,
  separarCompradores,
  separarPorVentana,
} from '../previoPagoResena';
import { esPlantillaPendiente, getTemplateByKey } from '../whatsapp-templates';
import { TEMPLATE_KEY_RESENA_PREVIO_PAGO } from '../previoPagoResena';

const LOG = [
  // Compró: dos intentos fallidos y recién el tercero quedó approved.
  '2026-08-30 10:00:00 - Ana Gomez - 2215551111 - previopago',
  '2026-08-30 10:05:00 - Ana Gomez - 2215551111 - rejected',
  '2026-09-02 11:00:00 - Ana Gomez - 2215551111 - approved',
  // Compró en el primer intento, hace mucho.
  '2026-08-01 09:00:00 - Beto Diaz - 11 4444-2222 - approved',
  // Nunca llegó a approved.
  '2026-09-02 12:00:00 - Caro Ruiz - 3415553333 - previopago',
].join('\n');

const resumen = resumirPrevioPago(parseEstadoLog(LOG));
const ana = resumen.compradores.find((c) => c.telefonoNormalizado === '2215551111')!;
const beto = resumen.compradores.find((c) => c.nombre === 'Beto Diaz')!;

describe('resumirPrevioPago — fechaCompra', () => {
  // La reseña se manda por haber COMPRADO, así que la fecha que importa es la del
  // `approved`, no la del primer intento. Ana entró al flujo el 30/8 y compró el 2/9:
  // filtrar por `primerIntento` la dejaría fuera de la ventana de reseñas para siempre.
  it('marca la fecha del primer evento approved, no la del primer intento', () => {
    expect(ana.primerIntento).toBe('2026-08-30 10:00:00');
    expect(ana.fechaCompra).toBe('2026-09-02 11:00:00');
  });

  it('no le pone fechaCompra a quien nunca llegó a approved', () => {
    const caro = resumen.contactos.find((c) => c.nombre === 'Caro Ruiz')!;
    expect(caro.compro).toBe(false);
    expect(caro.fechaCompra).toBeUndefined();
  });
});

describe('compradoresDeUltimosDias', () => {
  // Corrida de las 15hs AR del 2/9. La ventana AR es {2026-09-02, 2026-09-01}.
  const corrida = new Date('2026-09-02T18:00:00.000Z');

  it('toma al que compró dentro de la ventana', () => {
    expect(compradoresDeUltimosDias([ana, beto], corrida).map((c) => c.nombre)).toEqual([
      'Ana Gomez',
    ]);
  });

  it('deja fuera al que compró hace un mes: pedirle una reseña ahora es spam', () => {
    expect(compradoresDeUltimosDias([beto], corrida)).toEqual([]);
  });

  it('alcanza al que compró de noche, que no llegó a ninguna corrida de su propio día', () => {
    const deNoche = { ...ana, fechaCompra: '2026-09-01 22:30:00' };
    expect(compradoresDeUltimosDias([deNoche], corrida)).toHaveLength(1);
  });

  it('ignora a los que no compraron aunque vengan mezclados en la lista', () => {
    const caro = resumen.contactos.find((c) => c.nombre === 'Caro Ruiz')!;
    expect(compradoresDeUltimosDias([caro, ana], corrida).map((c) => c.nombre)).toEqual([
      'Ana Gomez',
    ]);
  });

  it('la ventana de compra cubre el hueco nocturno igual que la de recupero', () => {
    expect(DIAS_COMPRA_RESENA).toBeGreaterThanOrEqual(2);
  });
});

describe('separarCompradores', () => {
  // Éste es el agujero que el cron de recupero tenía: la fase de envío elegía leads por
  // etiqueta en la tabla, sin volver a mirar el log. Quien fue ingestado ayer como
  // abandonado y compró hoy a la mañana recibía igual el "no completaste el pago".
  it('saca de la tanda de recupero al lead que ya compró', () => {
    const candidatos = [
      { id: 1, phone: '+5492215551111' }, // Ana, compró
      { id: 2, phone: '+5493415553333' }, // Caro, sigue sin comprar
    ];
    const { aRecuperar, yaCompraron } = separarCompradores(candidatos, resumen.compradores);
    expect(aRecuperar.map((l) => l.id)).toEqual([2]);
    expect(yaCompraron.map((l) => l.id)).toEqual([1]);
  });

  // Los teléfonos se cargan a mano en el formulario de pago: llegan con y sin 0, con y sin
  // código de país. El match tiene que ser por los últimos 10 dígitos, como el resto del CRM.
  it('matchea aunque el lead y el log tengan el número en formatos distintos', () => {
    const candidatos = [{ id: 3, phone: '02215551111' }];
    const { aRecuperar, yaCompraron } = separarCompradores(candidatos, resumen.compradores);
    expect(aRecuperar).toEqual([]);
    expect(yaCompraron.map((l) => l.id)).toEqual([3]);
  });

  it('deja pasar al lead sin teléfono en vez de perderlo', () => {
    const candidatos = [{ id: 4, phone: null }];
    expect(separarCompradores(candidatos, resumen.compradores).aRecuperar.map((l) => l.id)).toEqual(
      [4]
    );
  });

  it('sin compradores en el log no toca nada', () => {
    const candidatos = [{ id: 5, phone: '+5492215551111' }];
    expect(separarCompradores(candidatos, []).aRecuperar).toHaveLength(1);
  });
});

describe('esPlantillaPendiente', () => {
  // Guarda contra el peor final posible: el cron dispara y YCloud rechaza cada mensaje
  // porque el HSM es un placeholder. Peor todavía, los leads quedan marcados como
  // contactados sin haber recibido nada.
  it('detecta el placeholder de HSM todavía sin dar de alta en Meta', () => {
    expect(esPlantillaPendiente(getTemplateByKey('carnet_recordatorio_v1'))).toBe(true);
  });

  it('deja pasar una plantilla real', () => {
    expect(esPlantillaPendiente(getTemplateByKey('previo_pago_seguimiento'))).toBe(false);
  });

  it('trata la plantilla inexistente como pendiente', () => {
    expect(esPlantillaPendiente(undefined)).toBe(true);
  });
});

describe('plantilla de reseña', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('está registrada y apunta a la línea de Carnet, igual que el recupero', () => {
    const template = getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO);
    expect(template).toBeDefined();
    expect(template!.phoneFrom).toBe('+5491141872290');
  });

  // Sin el override, dar de alta el HSM real exige editar código y redeployar. Con él,
  // alcanza con setear la env var en Vercel: el cron de la corrida siguiente ya la usa.
  it('toma el HSM real de la env var cuando está seteada', () => {
    vi.stubEnv('PREVIO_PAGO_RESENA_HSM', 'template_utility_20260903120000');
    const template = getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO);
    expect(template!.hsmName).toBe('template_utility_20260903120000');
    expect(esPlantillaPendiente(template)).toBe(false);
  });

  it('sin la env var sigue siendo un placeholder y el guard la frena', () => {
    expect(esPlantillaPendiente(getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO))).toBe(true);
  });

  it('la env var vacía no cuenta como plantilla dada de alta', () => {
    vi.stubEnv('PREVIO_PAGO_RESENA_HSM', '');
    expect(esPlantillaPendiente(getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO))).toBe(true);
  });

  // El override cambia el HSM, no la línea: la plantilla vive en la WABA de Carnet y
  // mandarla desde la otra línea sigue dando 403.
  it('el override no toca el resto de la definición', () => {
    vi.stubEnv('PREVIO_PAGO_RESENA_HSM', 'template_utility_20260903120000');
    const template = getTemplateByKey(TEMPLATE_KEY_RESENA_PREVIO_PAGO);
    expect(template!.phoneFrom).toBe('+5491141872290');
    expect(template!.language).toBe('es_AR');
  });

  it('no le aplica override a las plantillas que no lo declaran', () => {
    vi.stubEnv('PREVIO_PAGO_RESENA_HSM', 'template_utility_20260903120000');
    expect(getTemplateByKey('previo_pago_seguimiento')!.hsmName).toBe(
      'template_utility_20260731160820'
    );
  });
});

describe('inicioVentanaServicio', () => {
  it('retrocede exactamente 24hs desde la corrida', () => {
    expect(inicioVentanaServicio(new Date('2026-09-03T18:00:00.000Z'))).toBe(
      '2026-09-02T18:00:00.000Z'
    );
  });

  // La ventana de servicio la define WhatsApp, no nosotros: son 24hs desde el último
  // mensaje ENTRANTE. No es un parámetro que podamos aflojar si nos queda corto.
  it('la ventana de servicio es de 24hs, no negociable', () => {
    expect(VENTANA_SERVICIO_HORAS).toBe(24);
  });
});

describe('separarPorVentana', () => {
  const sesiones = [{ session_id: '+5492215551111' }];

  it('deja pasar sólo a quien escribió en las últimas 24hs', () => {
    const candidatos = [
      { id: 1, phone: '+5492215551111' },
      { id: 2, phone: '+5493415553333' },
    ];
    const { abiertos, cerrados } = separarPorVentana(candidatos, sesiones);
    expect(abiertos.map((c) => c.id)).toEqual([1]);
    expect(cerrados.map((c) => c.id)).toEqual([2]);
  });

  // El session_id de chat_histories no tiene un formato garantizado: lo escribe n8n y a
  // veces llega como JID de WhatsApp. Mismo criterio de últimos 10 dígitos que el resto.
  it('matchea el session_id aunque venga como JID de WhatsApp', () => {
    const candidatos = [{ id: 3, phone: '+5492215551111' }];
    const { abiertos } = separarPorVentana(candidatos, [
      { session_id: '5492215551111@s.whatsapp.net' },
    ]);
    expect(abiertos.map((c) => c.id)).toEqual([3]);
  });

  it('el lead sin teléfono queda cerrado: no se le puede mandar texto libre', () => {
    const { abiertos, cerrados } = separarPorVentana([{ id: 4, phone: null }], sesiones);
    expect(abiertos).toEqual([]);
    expect(cerrados.map((c) => c.id)).toEqual([4]);
  });

  it('sin conversaciones abiertas no manda nada', () => {
    const { abiertos } = separarPorVentana([{ id: 5, phone: '+5492215551111' }], []);
    expect(abiertos).toEqual([]);
  });
});
