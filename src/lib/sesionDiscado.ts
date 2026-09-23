import { getTwilio, getTwilioEnv } from './twilioClient';
import { esTelefonoArgentino } from './telefonoAR';

/**
 * Motor de la tanda de discado.
 *
 * El agente está sentado dentro de una conferencia de Twilio. Esta lógica
 * disca contactos de a UNO hacia esa misma conferencia. Nunca en paralelo:
 * si se discan varios y atienden dos, uno se queda hablando solo — la llamada
 * abandonada que quema el contacto para siempre.
 */

export type EstadoSesion =
  | 'iniciando'
  | 'esperando_agente'
  | 'activa'
  | 'finalizada'
  | 'error';

export interface SesionDiscado {
  id: string;
  agente_telefono: string;
  conference_name: string;
  agente_call_sid: string | null;
  lote: string | null;
  /** Selección manual. null = todos los pendientes del lote. */
  contacto_ids: string[] | null;
  estado: EstadoSesion;
  contacto_actual_id: string | null;
  llamadas_hechas: number;
  ultimo_error: string | null;
}

const SESION_SELECT = `
  id, agente_telefono, conference_name, agente_call_sid, lote, contacto_ids,
  estado, contacto_actual_id, llamadas_hechas, ultimo_error
`;

export async function getSesion(supabase: any, sesionId: string): Promise<SesionDiscado | null> {
  const { data } = await supabase
    .from('sesiones_discado')
    .select(SESION_SELECT)
    .eq('id', sesionId)
    .single();
  return (data as SesionDiscado) ?? null;
}

export async function finalizarSesion(
  supabase: any,
  sesionId: string,
  motivo?: string,
): Promise<void> {
  await supabase
    .from('sesiones_discado')
    .update({
      estado: 'finalizada',
      finalizada_at: new Date().toISOString(),
      contacto_actual_id: null,
      ultimo_error: motivo ?? null,
    })
    .eq('id', sesionId);
}

export interface ResultadoDiscado {
  status: number;
  contactoId?: string;
  nombre?: string;
  sid?: string;
  /** true = no quedaban contactos: la tanda terminó. */
  fin?: boolean;
  error?: string;
}

/**
 * Toma el siguiente contacto pendiente y lo disca hacia la conferencia.
 *
 * Lo invoca el arranque de la sesión y, después, el webhook de fin de cada
 * llamada: así la cola se encadena sola, sin cron ni worker.
 */
export async function discarSiguiente(
  supabase: any,
  sesionId: string,
): Promise<ResultadoDiscado> {
  const sesion = await getSesion(supabase, sesionId);
  if (!sesion) return { status: 404, error: 'Sesión no encontrada' };

  if (sesion.estado === 'finalizada') {
    return { status: 200, fin: true };
  }

  const { fromNumber, appUrl, faltan } = getTwilioEnv();
  if (faltan) {
    await finalizarSesion(supabase, sesionId, 'Variables de entorno de Twilio faltantes');
    return { status: 500, error: 'Variables de entorno de Twilio faltantes' };
  }

  // Siguiente pendiente del lote, con teléfono usable.
  let q = supabase
    .from('contactos_discado')
    .select('id, nombre, telefono_e164')
    .eq('estado', 'pendiente')
    .not('telefono_e164', 'is', null)
    .order('created_at', { ascending: true })
    .limit(1);

  // Si la tanda se armó con una selección manual, sólo entran esos contactos.
  if (sesion.contacto_ids && sesion.contacto_ids.length > 0) {
    q = q.in('id', sesion.contacto_ids);
  } else if (sesion.lote) {
    q = q.eq('lote', sesion.lote);
  }

  const { data: candidatos, error: selectError } = await q;
  if (selectError) return { status: 500, error: selectError.message };

  const candidato = (candidatos ?? [])[0];
  if (!candidato) {
    await finalizarSesion(supabase, sesionId);
    return { status: 200, fin: true };
  }

  if (!esTelefonoArgentino(candidato.telefono_e164)) {
    await supabase
      .from('contactos_discado')
      .update({ estado: 'error', ultimo_error: 'Teléfono no argentino' })
      .eq('id', candidato.id);
    // Se saltea y sigue con el próximo.
    return discarSiguiente(supabase, sesionId);
  }

  // Claim atómico: si otro webhook ya lo tomó, este se va sin discar dos veces.
  const { data: claimed } = await supabase
    .from('contactos_discado')
    .update({ estado: 'llamando', ultimo_error: null })
    .eq('id', candidato.id)
    .eq('estado', 'pendiente')
    .select('id')
    .single();

  if (!claimed) return { status: 409, error: 'El contacto ya fue tomado por otra llamada' };

  const ahora = new Date();
  const fin = new Date(ahora.getTime() + 15 * 60 * 1000);

  const { data: llamada, error: insertError } = await supabase
    .from('llamadas_agendadas')
    .insert({
      lead_id: null,
      contacto_discado_id: candidato.id,
      sesion_discado_id: sesionId,
      nombre_contacto: candidato.nombre,
      titulo: `Tanda: ${candidato.nombre}`,
      inicio: ahora.toISOString(),
      fin: fin.toISOString(),
      estado: 'agendada',
      agente_telefono: sesion.agente_telefono,
      telefono_destino: candidato.telefono_e164,
    })
    .select('id')
    .single();

  if (insertError || !llamada) {
    await supabase
      .from('contactos_discado')
      .update({ estado: 'error', ultimo_error: insertError?.message ?? 'No se pudo registrar' })
      .eq('id', candidato.id);
    return { status: 500, error: insertError?.message ?? 'No se pudo registrar la llamada' };
  }

  try {
    // El lead se disca DIRECTO: el agente ya está esperando en la conferencia.
    const call = await getTwilio().calls.create({
      to: candidato.telefono_e164,
      from: fromNumber as string,
      url: `${appUrl}/api/llamadas/discado/sesion/lead-twiml?sesionId=${sesionId}`,
      method: 'GET',
      statusCallback: `${appUrl}/api/llamadas/discado/sesion/fin-llamada?sesionId=${sesionId}&llamadaId=${llamada.id}`,
      statusCallbackMethod: 'POST',
      // Los únicos eventos válidos son initiated|ringing|answered|completed.
      // Mandar 'busy'/'no-answer'/'failed'/'canceled' hacía que Twilio tirara
      // el warning 21626 y los descartara: 'completed' ya cubre todos los
      // finales, con el desenlace real en CallStatus.
      statusCallbackEvent: ['completed'],
      timeout: 15,
      // AMD ASÍNCRONO: conecta la llamada al instante y analiza en paralelo.
      // Con el AMD sincrónico, Twilio escuchaba ~7 SEGUNDOS antes de pedir el
      // TwiML: el prospecto atendía, decía "¿hola?" y no había nadie del otro
      // lado. Esos 7 segundos de silencio cuelgan más llamadas que las que
      // salva la detección de contestador.
      machineDetection: 'Enable',
      asyncAmd: 'true',
      asyncAmdStatusCallback: `${appUrl}/api/llamadas/discado/sesion/amd?sesionId=${sesionId}&llamadaId=${llamada.id}&contactoId=${candidato.id}`,
      asyncAmdStatusCallbackMethod: 'POST',
    });

    await supabase
      .from('llamadas_agendadas')
      .update({ twilio_call_sid: call.sid })
      .eq('id', llamada.id);

    await supabase
      .from('sesiones_discado')
      .update({
        estado: 'activa',
        contacto_actual_id: candidato.id,
        llamadas_hechas: sesion.llamadas_hechas + 1,
      })
      .eq('id', sesionId);

    return { status: 200, contactoId: candidato.id, nombre: candidato.nombre, sid: call.sid };
  } catch (err: any) {
    console.error('[sesionDiscado] Twilio error', candidato.id, err);
    await supabase
      .from('contactos_discado')
      .update({ estado: 'error', ultimo_error: err?.message ?? 'Error de Twilio' })
      .eq('id', candidato.id);
    await supabase
      .from('llamadas_agendadas')
      .update({ twilio_call_sid: null })
      .eq('id', llamada.id);

    return { status: 502, error: err?.message ?? 'Error de Twilio' };
  }
}
