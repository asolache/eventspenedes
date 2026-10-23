/* =============================================================================
   Events Penedès · los recordatorios de la víspera, cada hora

   Dos cosas, cada hora en punto:

   1. Lo que Álvaro ya aprobó y espera su hora («programado» en
      correos_salida) pasa a «aprobado» cuando llega enviar_en, y sale por el
      envío propio de siempre (supabase/functions/correo-salida).

   2. Para cada persona interesada de un evento confirmado
      (evento_interesados) a la que aún no le hemos preparado el recordatorio,
      calcula cuándo debe salir (24 h antes, en horario laboral) y, si es en
      las próximas 30 h, lo deja escrito en correos_salida como «borrador»,
      con la previsión del tiempo y su botón «Recibido» (avisos_evento). No
      sale nada sin el OK de Álvaro: el borrador espera a que lo lea.

   3. El cierre: para cada evento de la última semana, el correo de gracias y
      de petición de fotos a cada persona interesada (netlify/portal/cierre.mjs),
      para el primer día laborable siguiente, también como «borrador». En
      cierres_evento queda la nota de Zoho propuesta y lo que falta (factura
      final del 25 %), para que una sesión de Claude lo haga con el OK de
      Álvaro. Un cierre hecho a mano (automatico = false) no se toca.

   Variables de entorno: SUPABASE_SECRET_KEY (ver netlify/portal/supabase.mjs)
   ========================================================================== */
import { randomUUID } from 'node:crypto';
import { configurado, rest } from '../portal/supabase.mjs';
import { deMadrid, momentoEnvio, prevision, coordenadas, correoRecordatorio } from '../portal/recordatorio.mjs';
import { momentoCierre, correoCierre, notaZoho, DIAS_MAX } from '../portal/cierre.mjs';

const HORA = 3600e3;
const VENTANA = 30 * HORA;   // se prepara con tiempo para que Álvaro lo lea antes de que salga

/* La hora de inicio: la primera del programa que la tenga */
export const horaInicio = d => (Array.isArray(d?.programa) ? d.programa.map(p => p?.hora).find(h => /^\d{2}:\d{2}$/.test(h || '')) : null) || null;

export async function soltarProgramados(ahora = new Date(), { rest: db = rest } = {}) {
  const filas = await db(`correos_salida?estado=eq.programado&enviar_en=lte.${ahora.toISOString()}`, {
    method: 'PATCH', body: { estado: 'aprobado' }, prefer: 'return=representation' });
  return (filas || []).length;
}

export async function prepararRecordatorios(ahora = new Date(), { rest: db = rest, fetch = globalThis.fetch } = {}) {
  const hoy = ahora.toISOString().slice(0, 10);
  const hasta = new Date(ahora.getTime() + 4 * 24 * HORA).toISOString().slice(0, 10);
  const eventos = await db(`eventos_cliente?estado=eq.confirmado&fecha=gte.${hoy}&fecha=lte.${hasta}&select=id,titulo,fecha,datos`);
  const hechos = [];
  for (const ev of eventos || []) {
    const hora = horaInicio(ev.datos);
    const inicio = deMadrid(ev.fecha, hora || '09:00');
    const envio = momentoEnvio(inicio, ahora);
    if (!envio || envio.getTime() - ahora.getTime() > VENTANA) { continue; }
    const interesados = await db(`evento_interesados?evento_id=eq.${ev.id}&canal=eq.correo&correo=not.is.null&select=id,rol,nombre,correo,idioma,notas,avisos_evento(id,tipo)`);
    const pendientes = (interesados || []).filter(i => !(i.avisos_evento || []).some(a => a.tipo === 'recordatorio_24h'));
    if (!pendientes.length) { continue; }
    const lugar = ev.datos?.lugar || null;
    const coords = await coordenadas(lugar, { fetch }).catch(() => null);
    for (const i of pendientes) {
      const tiempo = coords ? await prevision({ ...coords, fecha: ev.fecha, desde: hora || '09:00', horas: 4, idioma: i.idioma }, { fetch }).catch(() => null) : null;
      const clave = randomUUID().replace(/-/g, '');
      const correo = correoRecordatorio({
        evento: { titulo: ev.titulo, fecha: ev.fecha, hora, lugar, pax: ev.datos?.pax }, interesado: i, tiempo, clave, envio,
      });
      const [aviso] = await db('avisos_evento?on_conflict=interesado_id,tipo', {
        method: 'POST', body: { evento_id: ev.id, interesado_id: i.id, tipo: 'recordatorio_24h', clave, enviar_en: envio.toISOString() },
        prefer: 'resolution=ignore-duplicates,return=representation' }) || [];
      if (!aviso) { continue; }
      const [fila] = await db('correos_salida', { method: 'POST', prefer: 'return=representation',
        body: { para: [i.correo], asunto: correo.asunto, html: correo.html, texto: correo.texto, estado: 'borrador', enviar_en: envio.toISOString() } });
      await db(`avisos_evento?id=eq.${aviso.id}`, { method: 'PATCH', body: { correo_id: fila.id } });
      hechos.push({ evento: ev.id, rol: i.rol, correo: fila.id, enviar_en: envio.toISOString(), tiempo: Boolean(tiempo) });
    }
  }
  return hechos;
}

export async function prepararCierres(ahora = new Date(), { rest: db = rest } = {}) {
  const hoy = ahora.toISOString().slice(0, 10);
  const desde = new Date(ahora.getTime() - (DIAS_MAX + 1) * 24 * HORA).toISOString().slice(0, 10);
  const eventos = await db(`eventos_cliente?estado=in.(confirmado,hecho)&fecha=gte.${desde}&fecha=lte.${hoy}&select=id,titulo,fecha,cierres_evento(automatico)`);
  const hechos = [];
  for (const ev of eventos || []) {
    const cierre = Array.isArray(ev.cierres_evento) ? ev.cierres_evento[0] : ev.cierres_evento;
    if (cierre && cierre.automatico === false) { continue; }
    const envio = momentoCierre(ev.fecha, ahora);
    if (!envio || envio.getTime() - ahora.getTime() > VENTANA) { continue; }
    const interesados = await db(`evento_interesados?evento_id=eq.${ev.id}&canal=eq.correo&correo=not.is.null&select=id,rol,nombre,correo,idioma,avisos_evento(id,tipo)`);
    const pendientes = (interesados || []).filter(i => !(i.avisos_evento || []).some(a => a.tipo === 'cierre'));
    if (!pendientes.length) { continue; }
    const preparados = [];
    for (const i of pendientes) {
      const clave = randomUUID().replace(/-/g, '');
      const correo = correoCierre({ evento: { titulo: ev.titulo, fecha: ev.fecha }, interesado: i, clave });
      const [aviso] = await db('avisos_evento?on_conflict=interesado_id,tipo', {
        method: 'POST', body: { evento_id: ev.id, interesado_id: i.id, tipo: 'cierre', clave, enviar_en: envio.toISOString() },
        prefer: 'resolution=ignore-duplicates,return=representation' }) || [];
      if (!aviso) { continue; }
      const [fila] = await db('correos_salida', { method: 'POST', prefer: 'return=representation',
        body: { para: [i.correo], asunto: correo.asunto, html: correo.html, texto: correo.texto, estado: 'borrador', enviar_en: envio.toISOString() } });
      await db(`avisos_evento?id=eq.${aviso.id}`, { method: 'PATCH', body: { correo_id: fila.id } });
      preparados.push({ nombre: i.nombre, rol: i.rol });
      hechos.push({ evento: ev.id, rol: i.rol, correo: fila.id, enviar_en: envio.toISOString(), tipo: 'cierre' });
    }
    if (preparados.length && !cierre) {
      await db('cierres_evento?on_conflict=evento_id', { method: 'POST', prefer: 'resolution=ignore-duplicates,return=minimal',
        body: { evento_id: ev.id, nota_zoho: notaZoho({ evento: ev, preparados }) } });
    }
  }
  return hechos;
}

export default async () => {
  if (!configurado()) { return new Response('Sin Supabase', { status: 200 }); }
  try {
    const soltados = await soltarProgramados();
    const preparados = await prepararRecordatorios();
    const cierres = await prepararCierres();
    console.log('recordatorios:', JSON.stringify({ soltados, preparados, cierres }));
    return Response.json({ soltados, preparados: preparados.length, cierres: cierres.length });
  } catch (e) {
    console.error('recordatorios:', e.message);
    return new Response('Error', { status: 500 });
  }
};

export const config = { schedule: '0 * * * *' };
