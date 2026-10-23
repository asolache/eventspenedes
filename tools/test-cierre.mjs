/* =============================================================================
   Prueba del cierre del evento

   Lo que importa: que el correo de gracias salga el primer día laborable
   después del evento y nunca sin pasar por «borrador»; que al cliente le
   proponga la llamada de repaso y a los demás no; que lleve el enlace directo
   a /fotos/<clave> y nada de precios ni de lo interno; que un cierre hecho a
   mano no se repita; y que el permiso para publicar quede con su texto exacto,
   no se pueda publicar sin el acuerdo de las personas que salen y retirarlo no
   borre nada.

   Uso:  node tools/test-cierre.mjs
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { momentoCierre, correoCierre, autorizacion, notaZoho, AGENDA } from '../netlify/portal/cierre.mjs';
import { prepararCierres } from '../netlify/functions/recordatorios.mjs';
import { filaAutorizacion, rutaFoto, paginaFotos, MAX_BYTES } from '../netlify/functions/fotos.mjs';
import { errores } from '../supabase/functions/correo-salida/resend.js';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
const madrid = d => d && d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16);

console.log('\nPrueba del cierre del evento\n');

/* 1 · Cuándo sale */
const antes = new Date('2026-10-01T00:00:00Z');
comprueba('evento el viernes → gracias el lunes a las 10:00', madrid(momentoCierre('2026-10-23', antes)) === '2026-10-26 10:00');
comprueba('evento el miércoles → el jueves', madrid(momentoCierre('2026-11-04', antes)) === '2026-11-05 10:00');
const tarde = new Date('2026-11-06T15:00:00Z');
comprueba('si ya pasó la hora, cuanto antes', momentoCierre('2026-11-04', tarde)?.getTime() === tarde.getTime());
comprueba('pasada una semana, nada', momentoCierre('2026-11-04', new Date('2026-11-20T10:00:00Z')) === null);

/* 2 · El correo */
const EV = { titulo: 'Taller de castells «Fent Pinya»', fecha: '2026-11-11' };
const clave = 'b'.repeat(32);
const cli = correoCierre({ evento: EV, interesado: { nombre: 'Neus', rol: 'cliente', idioma: 'ca' }, clave });
const esp = correoCierre({ evento: EV, interesado: { nombre: 'Anna', rol: 'proveedor', idioma: 'es' }, clave });
comprueba('al cliente, la llamada de repaso con la agenda', cli.texto.includes(AGENDA) && cli.html.includes(`href="${AGENDA}"`));
comprueba('a los proveedores, sin llamada', !esp.texto.includes(AGENDA) && esp.texto.includes('gracias por vuestro trabajo'));
comprueba('el enlace directo a las fotos', [cli, esp].every(c => c.texto.includes(`https://eventspenedes.com/fotos/${clave}`) && c.html.includes(`href="https://eventspenedes.com/fotos/${clave}"`)));
comprueba('responder con fotos autoriza, y lo dice', cli.texto.includes('autoritzes a publicar-les') && esp.texto.includes('nos autorizas a publicarlas'));
comprueba('en catalán para quien habla catalán', cli.asunto.startsWith('Gràcies per') && cli.texto.includes('d’11 de novembre') === false && cli.texto.includes('11 de novembre'));
const INTERNO = /€|\beur\b|comisi|25 ?%|factura|wwoof|pagesos|paisatge|teamtowers|tarifa/i;
comprueba('sin precios ni nada interno', [cli, esp].every(c => !INTERNO.test(c.texto + c.html)));
comprueba('ningún enlace de Google reescrito', ![cli, esp].some(c => /google\.com\/url/.test(c.texto + c.html)));
comprueba('lo acepta el envío propio', errores({ estado: 'enviando', para: ['neus@example.com'], asunto: cli.asunto, html: cli.html, texto: cli.texto }).length === 0);

/* 3 · Preparar: una vez, como borrador, y nunca un cierre hecho a mano */
const escrito = [];
const BD = {
  eventos: [
    { id: 'ev-bcn', titulo: EV.titulo, fecha: '2026-11-11', cierres_evento: [] },
    { id: 'ev-mano', titulo: 'Hecho a mano', fecha: '2026-11-11', cierres_evento: [{ automatico: false }] },
  ],
  interesados: [
    { id: 'i-1', rol: 'cliente', nombre: 'Neus', correo: 'neus@example.com', idioma: 'ca', avisos_evento: [{ id: 'r', tipo: 'recordatorio_24h' }] },
    { id: 'i-2', rol: 'espacio', nombre: 'Marta', correo: 'marta@example.com', idioma: 'es', avisos_evento: [{ id: 'c', tipo: 'cierre' }] },
  ],
};
const db = async (ruta, o = {}) => {
  escrito.push([o.method || 'GET', ruta, o.body]);
  if (ruta.startsWith('eventos_cliente')) { return BD.eventos; }
  if (ruta.startsWith('evento_interesados')) { return ruta.includes('ev-mano') ? [{ ...BD.interesados[0], id: 'i-x' }] : BD.interesados; }
  if (ruta.startsWith('avisos_evento?on_conflict')) { return [{ id: 'av-1' }]; }
  if (ruta === 'correos_salida') { return [{ id: 'co-1' }]; }
  return null;
};
const hechos = await prepararCierres(new Date('2026-11-11T19:00:00Z'), { rest: db });
const correo = escrito.find(([m, r]) => m === 'POST' && r === 'correos_salida')?.[2];
const aviso = escrito.find(([m, r]) => m === 'POST' && r.startsWith('avisos_evento?on_conflict'))?.[2];
comprueba('uno por persona que aún no tiene el suyo (el recordatorio no cuenta)', hechos.length === 1 && hechos[0].rol === 'cliente');
comprueba('queda como borrador, a las 10:00 del día siguiente', correo?.estado === 'borrador' && madrid(new Date(correo.enviar_en)) === '2026-11-12 10:00');
comprueba('su aviso es de tipo cierre', aviso?.tipo === 'cierre' && aviso.clave.length === 32);
comprueba('el cierre hecho a mano no se toca', !escrito.some(([, r]) => r.includes('ev-mano') && r.startsWith('evento_interesados')));
const nota = escrito.find(([m, r]) => m === 'POST' && r.startsWith('cierres_evento'))?.[2];
comprueba('la nota de Zoho queda propuesta, no escrita', nota?.evento_id === 'ev-bcn' && nota.nota_zoho.includes('Neus (cliente)') && !('nota_zoho_en' in nota));
escrito.length = 0;
comprueba('con más de 30 h por delante, aún no', (await prepararCierres(new Date('2026-11-10T08:00:00Z'), { rest: db })).length === 0);
comprueba('la nota recuerda cobrar el 25 %, no facturarlo, solo por dentro', /cobrar el 25 %/.test(notaZoho({ evento: EV, preparados: [] })));

/* 4 · El permiso para publicar */
const AV = { id: 'av-1', evento_id: 'ev-bcn', evento_interesados: { nombre: 'Neus', idioma: 'ca' }, eventos_cliente: { titulo: EV.titulo, fecha: EV.fecha } };
const sinPersonas = filaAutorizacion(AV, { firmante: 'Neus', web: 'si' });
comprueba('no se publica sin el acuerdo de las personas que salen', sinPersonas.error === 'personas');
const soloInterno = filaAutorizacion(AV, { firmante: 'Neus' });
comprueba('sin marcar nada vale: solo uso interno', soloInterno.fila && soloInterno.fila.alcance.length === 0);
const ok = filaAutorizacion(AV, { firmante: 'Neus Puig', empresa: 'Camilian', web: 'si', nombre: 'si', personas: 'si', redes: 'no' }, { ip: '203.0.113.9', navegador: 'Safari' });
comprueba('guarda lo marcado y nada más', JSON.stringify(ok.fila.alcance) === '["web","nombre"]' && ok.fila.personas_de_acuerdo);
comprueba('con el texto exacto que vio, su versión y su huella', ok.fila.texto === autorizacion({ idioma: 'ca', titulo: EV.titulo, enNombreDe: 'Camilian', alcance: ['web', 'nombre'], personas: true }).texto
  && ok.fila.texto.includes('[x] Publicar-les a eventspenedes.com') && ok.fila.texto.includes('[ ] Publicar-les a les seves xarxes') && /^[a-f0-9]{64}$/.test(ok.fila.texto_sha256) && ok.fila.version);
comprueba('la IP, solo resumida', ok.fila.ip_sha256 && !JSON.stringify(ok.fila).includes('203.0.113.9'));
comprueba('sin nombre no hay firma', filaAutorizacion(AV, { firmante: ' ' }).error === 'firmante');

/* 5 · Las fotos y la página */
comprueba('una foto va a la carpeta de su evento y su aviso', /^ev-bcn\/av-1\/[0-9a-f-]{36}\.jpg$/.test(rutaFoto({ ...AV, id: 'av-1' }, { tipo: 'image/jpeg', bytes: 1000 })));
comprueba('ni un PDF ni una foto de más de 20 MB', rutaFoto(AV, { tipo: 'application/pdf', bytes: 10 }) === null && rutaFoto(AV, { tipo: 'image/jpeg', bytes: MAX_BYTES + 1 }) === null);
const html = paginaFotos({ ...AV, autorizaciones_fotos: [], fotos_evento: [] }, clave);
comprueba('la página pide el permiso con el texto que se guardará', html.includes('Publicar-les a eventspenedes.com') && html.includes('name="personas"') && html.includes('noindex'));
const firmada = paginaFotos({ ...AV, autorizaciones_fotos: [{ texto: ok.fila.texto, aceptada_en: '2026-11-12T09:00:00Z', revocada_en: null }], fotos_evento: [{ subida_en: 'x' }] }, clave);
comprueba('con permiso, lo enseña y deja retirarlo', firmada.includes('Retirar el permís') && firmada.includes('1 foto(s)') && !firmada.includes('name="firmante"'));
const fn = readFileSync(new URL('../netlify/functions/fotos.mjs', import.meta.url), 'utf8');
comprueba('retirar apunta la hora, no borra', fn.includes("revocada_en: new Date().toISOString()") && !/method: 'DELETE'/.test(fn));
const sql = readFileSync(new URL('../supabase/migrations/20261023160000_cierre_evento.sql', import.meta.url), 'utf8');
comprueba('las autorizaciones no se pueden borrar desde el servidor', /grant select, insert, update on public\.autorizaciones_fotos to service_role/.test(sql) && !/grant all on public\.autorizaciones_fotos/.test(sql));
comprueba('el cubo de fotos es privado', /\('fotos-evento', 'fotos-evento', false/.test(sql));

console.log('');
if (fallos) { console.log(`❌ ${fallos} fallo${fallos > 1 ? 's' : ''}.`); process.exit(1); }
console.log('✅ Gracias el día siguiente, fotos con permiso trazable, y nunca sin OK.\n');
