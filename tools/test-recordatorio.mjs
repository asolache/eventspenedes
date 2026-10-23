/* =============================================================================
   Prueba del recordatorio de la víspera

   Lo que importa: que salga unas 24 h antes y en horario laboral, que la
   previsión diga lo que dice Open-Meteo, que el correo lleve su botón
   «Recibido» con enlace directo y nada de precios, que nada se prepare dos
   veces ni salga sin pasar por «borrador», y que abrir el enlace no cuente
   como recibido: solo el clic.

   Uso:  node tools/test-recordatorio.mjs
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { deMadrid, laborable, momentoEnvio, resumirPrevision, correoRecordatorio, cuando } from '../netlify/portal/recordatorio.mjs';
import { horaInicio, prepararRecordatorios, soltarProgramados } from '../netlify/functions/recordatorios.mjs';
import { errores } from '../supabase/functions/correo-salida/resend.js';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
const madrid = d => d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16);

console.log('\nPrueba del recordatorio de la víspera\n');

/* 1 · La hora de Madrid, con cambio de horario */
comprueba('las 11:00 de Madrid en verano son las 09:00 UTC', deMadrid('2026-10-23', '11:00').toISOString() === '2026-10-23T09:00:00.000Z');
comprueba('y en invierno, las 10:00 UTC', deMadrid('2026-11-04', '11:00').toISOString() === '2026-11-04T10:00:00.000Z');
comprueba('el sábado no es laborable', !laborable(deMadrid('2026-10-24', '11:00')));
comprueba('un martes a las 20:00 tampoco', !laborable(deMadrid('2026-10-27', '20:00')));

/* 2 · Cuándo sale */
const antes = new Date('2026-10-01T00:00:00Z');
const env = (f, h) => madrid(momentoEnvio(deMadrid(f, h), antes));
comprueba('viernes 11:00 → jueves 11:00', env('2026-10-23', '11:00') === '2026-10-22 11:00');
comprueba('lunes 10:00 → el viernes por la tarde, no el domingo', env('2026-10-26', '10:00') === '2026-10-23 18:00');
comprueba('martes 8:00 → lunes 9:00, un poco después', env('2026-10-27', '08:00') === '2026-10-26 09:00');
comprueba('jueves 20:00 → miércoles 18:00, un poco antes', env('2026-10-22', '20:00') === '2026-10-21 18:00');
const tarde = new Date('2026-10-22T17:20:00Z');
const urgente = momentoEnvio(deMadrid('2026-10-23', '11:00'), tarde);
comprueba('si ya pasó la hora buena, cuanto antes', urgente && urgente.getTime() === tarde.getTime());
comprueba('con menos de 2 h, nada', momentoEnvio(deMadrid('2026-10-22', '20:00'), tarde) === null);
comprueba('la hora del programa', horaInicio({ programa: [{ hora: null }, { hora: '11:30' }] }) === '11:30' && horaInicio({}) === null);

/* 3 · La previsión */
const horas = ['09', '10', '11', '12', '13', '14', '15'];
const OM = { hourly: {
  time: horas.map(h => `2026-10-23T${h}:00`),
  temperature_2m: [13.6, 15, 16.4, 18, 19.6, 20.2, 20],
  precipitation_probability: [0, 5, 10, 10, 5, 0, 60],
  weather_code: [1, 2, 2, 3, 2, 1, 61],
  wind_speed_10m: [8, 12, 16, 19, 18, 15, 30],
} };
const p = resumirPrevision(OM, '2026-10-23', '11:00', 4, 'ca');
comprueba('solo las horas del evento (la lluvia de las 15 h no cuenta)', p.prob === 10 && !p.texto.includes('pluja del'));
comprueba('en catalán y con lo que dice', p.texto === 'ennuvolat, de 16 a 20 °C, sense pluja, una mica de vent.');
const mojado = resumirPrevision(OM, '2026-10-23', '13:00', 3, 'es');
comprueba('lluvia probable: lo dice y avisa', mojado.texto.includes('lluvia del 60 %') && mojado.aviso);
comprueba('sin datos de ese día, sin previsión', resumirPrevision(OM, '2026-10-24', '11:00', 4) === null);

/* 4 · El correo */
const EV = { titulo: 'Taller de castells «Fent Pinya»', fecha: '2026-10-23', hora: '11:00', lugar: { nombre: 'Bellesguart', poblacion: "L'Arboç" }, pax: 40 };
const clave = 'a'.repeat(32);
const envio = deMadrid('2026-10-22', '11:00');
const c = correoRecordatorio({ evento: EV, interesado: { nombre: 'Neus', rol: 'espacio', idioma: 'ca', notas: ["Necessitem un espai pla d'uns 10 × 10 m."] }, tiempo: mojado, clave, envio });
comprueba('«demà» si sale la víspera', c.asunto.startsWith('Demà') && cuando('2026-10-26', deMadrid('2026-10-23', '18:00'), 'es').startsWith('lunes'));
comprueba('el botón «Recibido» con su enlace directo', c.html.includes(`href="https://eventspenedes.com/rebut/${clave}"`) && c.texto.includes(`https://eventspenedes.com/rebut/${clave}`));
comprueba('lugar, hora, personas y sus notas', ['Bellesguart', '11:00', '40 persones', '10 × 10 m'].every(s => c.texto.includes(s)));
comprueba('al espacio, si llueve, le pregunta por el cubierto', c.texto.includes('espai cobert'));
comprueba('sin precios', !/€|eur\b/i.test(c.texto + c.html));
comprueba('lo acepta el envío propio', errores({ estado: 'enviando', para: ['oli@example.com'], asunto: c.asunto, html: c.html, texto: c.texto }).length === 0);
const sinTiempo = correoRecordatorio({ evento: { ...EV, hora: null }, interesado: { nombre: 'Aida', rol: 'cliente', idioma: 'es' }, tiempo: null, clave, envio });
comprueba('sin hora ni previsión, no se inventan', !sinTiempo.texto.includes('Hora:') && !sinTiempo.texto.includes('Previsión'));

/* 5 · Preparar: una vez, como borrador, con su hora */
const escrito = [];
const BD = {
  eventos: [{ id: 'ev-1', titulo: EV.titulo, fecha: '2026-10-23', datos: { pax: 40, lugar: { ...EV.lugar, lat: 41.26, lon: 1.6 }, programa: [{ hora: '11:00' }] } }],
  interesados: [{ id: 'i-1', rol: 'espacio', nombre: 'Neus', correo: 'oli@example.com', idioma: 'ca', notas: [], avisos_evento: [] },
    { id: 'i-2', rol: 'cliente', nombre: 'Aida', correo: 'aida@example.com', idioma: 'ca', notas: [], avisos_evento: [{ id: 'ya', tipo: 'recordatorio_24h' }] }],
};
const db = async (ruta, o = {}) => {
  escrito.push([o.method || 'GET', ruta, o.body]);
  if (ruta.startsWith('eventos_cliente')) { return BD.eventos; }
  if (ruta.startsWith('evento_interesados')) { return BD.interesados; }
  if (ruta.startsWith('avisos_evento?on_conflict')) { return [{ id: 'av-1' }]; }
  if (ruta === 'correos_salida') { return [{ id: 'co-1' }]; }
  if (ruta.startsWith('correos_salida?estado=eq.programado')) { return [{ id: 'x' }, { id: 'y' }]; }
  return null;
};
const fetch = async () => ({ ok: true, json: async () => OM });
const hechos = await prepararRecordatorios(new Date('2026-10-21T22:00:00Z'), { rest: db, fetch });
const correo = escrito.find(([m, r]) => m === 'POST' && r === 'correos_salida')?.[2];
comprueba('uno por persona que aún no lo tiene', hechos.length === 1 && hechos[0].rol === 'espacio');
comprueba('queda como borrador, con su hora de salida', correo?.estado === 'borrador' && correo.enviar_en === '2026-10-22T09:00:00.000Z');
comprueba('con la previsión dentro', hechos[0].tiempo && correo.texto.includes('°C'));
comprueba('el aviso no se duplica si ya existe', escrito.some(([, r, b]) => r.startsWith('avisos_evento?on_conflict=interesado_id,tipo') && b.clave?.length === 32));
const lejos = await prepararRecordatorios(new Date('2026-10-20T08:00:00Z'), { rest: db, fetch });
comprueba('con más de 30 h por delante, aún no se prepara', lejos.length === 0);
comprueba('lo programado sale a su hora y solo eso', await soltarProgramados(new Date(), { rest: db }) === 2
  && escrito.some(([m, r, b]) => m === 'PATCH' && r.startsWith('correos_salida?estado=eq.programado&enviar_en=lte.') && b.estado === 'aprobado'));

/* 6 · «Recibido»: abrir el enlace no cuenta, el clic sí */
const rebut = readFileSync(new URL('../netlify/functions/rebut.mjs', import.meta.url), 'utf8');
comprueba('solo un POST marca recibido', /if \(req\.method === 'POST'\) \{\s*await rest\(`avisos_evento\?clave=eq\.\$\{clave\}&recibido_en=is\.null`/.test(rebut));
const sql = readFileSync(new URL('../supabase/migrations/20261022180000_recordatorios.sql', import.meta.url), 'utf8');
comprueba('el disparador de envío sigue mirando solo «aprobado»', sql.includes("'programado'") && !/create (or replace )?trigger/i.test(sql));

console.log('');
if (fallos) { console.log(`❌ ${fallos} fallo${fallos > 1 ? 's' : ''}.`); process.exit(1); }
console.log('✅ Sale la víspera en horario laboral, con el tiempo y su «Recibido», y nunca sin OK.\n');
