/* =============================================================================
   Prueba de la venta asistida de Fent Pinya (TeamTowers)

   · La petición de teamtowers.eu/presupuesto entra como oportunidad con su
     origen, su marca y el importe del tramo, y sale el borrador sin enviarse.
   · El aviso de seguimiento salta a los cinco días, solo en propuestas vivas,
     y no repite.

   Uso:  node tools/test-pinya.mjs
   ========================================================================== */
import { createHmac, createHash } from 'node:crypto';

process.env.NETLIFY_WEBHOOK_JWS_SECRET = 'secreto-de-prueba-no-usar';
process.env.ZOHO_DRY_RUN = '1';
process.env.ZOHO_CAMPO_MARCA = 'Marca';
/* Una tarifa inventada para la prueba: la de verdad vive en Netlify */
process.env.TARIFA_FENT_PINYA = JSON.stringify({ anio: 2027, iva: 21, tramos: [
  { desde: 10, hasta: 29, precio: 1000 }, { desde: 30, hasta: 49, precio: 2000 }, { desde: 50, hasta: null, precio: null }] });

const { default: handler } = await import('../netlify/functions/lead.mjs');
const P = await import('../netlify/pinya/pinya.mjs');
const A = await import('../netlify/functions/aviso-propuestas.mjs');

let fallos = 0;
const comprueba = (nombre, cond) => { console.log(`  ${cond ? '✓' : '✗'} ${nombre}`); if (!cond) { fallos++; } };

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function firmar(cuerpo, secreto = process.env.NETLIFY_WEBHOOK_JWS_SECRET) {
  const cabecera = b64({ typ: 'JWT', alg: 'HS256' });
  const carga = b64({ iss: 'netlify', sha256: createHash('sha256').update(cuerpo, 'utf8').digest('hex') });
  return `${cabecera}.${carga}.${createHmac('sha256', secreto).update(`${cabecera}.${carga}`).digest('base64url')}`;
}
const peticion = (cuerpo, firma) => new Request('https://eventspenedes.com/.netlify/functions/lead', {
  method: 'POST', headers: { 'x-webhook-signature': firma, 'content-type': 'application/json' }, body: cuerpo });

const DATOS = { idioma: 'ca', nombre: 'Marta Puig', empresa: 'Acme SL', correo: 'marta@acme.example',
  telefono: '+34 600 000 000', personas: '39', fecha: '2027-03-12', lugar: 'Sitges', idioma_taller: 'ca',
  a_traves_de: 'empresa', mensaje: 'Volem que els dos equips es coneguin.', origen_web: 'https://www.google.com/',
  privacidad: 'aceptada' };

console.log('\nPrueba de Fent Pinya\n');

/* 1 · El origen */
comprueba('buscador por la web de la que llega', P.origenDe({ origen_web: 'https://www.google.es/' }).origen === 'Buscador');
comprueba('Events Penedès por utm_source', P.origenDe({ utm_source: 'eventspenedes', a_traves_de: 'agencia' }).origen === 'Events Penedès');
comprueba('Events Penedès por la web de la que llega', P.origenDe({ origen_web: 'https://eventspenedes.com/dj' }).origen === 'Events Penedès');
comprueba('agencia por lo que dice quien escribe', P.origenDe({ a_traves_de: 'agencia', origen_web: 'https://google.com' }).origen === 'Agencia');
comprueba('directa sin nada', P.origenDe({}).origen === 'Directa');
comprueba('una web cualquiera no es un buscador', P.origenDe({ origen_web: 'https://googleblog.example.org' }).origen === 'Directa');

/* 2 · La tarifa y el borrador */
const t = P.tarifa();
comprueba('tramo 30–49 para 39 personas', P.tramoDe(39, t)?.precio === 2000);
comprueba('sin tramo para 5 personas', P.tramoDe(5, t) === null);
const b = P.borrador(DATOS, t);
comprueba('borrador en el idioma de la web', b.idioma === 'ca' && b.cuerpo.includes('Hola, Marta:'));
comprueba('precio con IVA', b.importe === 2000 && b.cuerpo.includes('2420'.replace(/(\d)(\d{3})$/, '$1.$2')));
comprueba('enlace de Gmail con el destinatario', b.gmail.includes(encodeURIComponent('marta@acme.example')));
comprueba('avisa de las condiciones que faltan', b.avisos.some(a => a.includes('reserva')));
comprueba('avisa del mensaje', b.avisos.some(a => a.includes('mensaje')));
const consulta = P.borrador({ ...DATOS, personas: '120' }, t);
comprueba('tramo «a consultar» sin precio', consulta.importe === null && consulta.avisos.some(a => a.includes('consultar')));
comprueba('sin tarifa, sin precio y con aviso', P.borrador(DATOS, null).avisos.some(a => a.includes('TARIFA_FENT_PINYA')));
comprueba('avisa si la fecha no es del año de la tarifa', P.borrador({ ...DATOS, fecha: '2028-01-10' }, t).avisos.some(a => a.includes('2028')));
comprueba('una agencia, con aviso de tarifa de agencia', P.borrador({ ...DATOS, a_traves_de: 'agencia' }, t).avisos.some(a => a.includes('agencia')));

/* 3 · Por la función de leads, firmado como Netlify */
const AVISO = JSON.stringify({ form_name: 'pinya', created_at: '2026-11-15T09:00:00.000Z', data: DATOS });
const r = await (await handler(peticion(AVISO, firmar(AVISO)))).json();
const tr = r.oportunidad?.trato || {};
comprueba('entra como oportunidad', r.ok && r.modulo === 'Deals');
comprueba('nombre como los de Álvaro', tr.Deal_Name === 'Fent Pinya 39 pax Acme SL 12/03/2027');
comprueba('marca TeamTowers en el trato y la cuenta', tr.Marca === 'TeamTowers' && r.oportunidad.cuenta.Marca === 'TeamTowers');
comprueba('importe del tramo, sin IVA', tr.Amount === 2000);
comprueba('etapa por defecto «Clasificación»', tr.Stage === 'Clasificación');
comprueba('origen en las etiquetas y en la ficha', r.oportunidad.etiquetas.includes('Origen Buscador') && tr.Description.includes('Origen: Buscador'));
comprueba('la ficha no lleva correo ni teléfono', !tr.Description.includes('marta@') && !tr.Description.includes('600 000'));
comprueba('tarea para hoy', r.oportunidad.tarea.Due_Date === '2026-11-15');
comprueba('la nota dice que no se ha enviado', r.nota.includes('No se ha enviado nada'));
const malo = JSON.stringify({ form_name: 'pinya', data: DATOS });
comprueba('sin firma buena no entra', (await handler(peticion(malo, firmar(malo, 'otra')))).status === 401);

/* 4 · El aviso de seguimiento */
const ahora = new Date('2026-11-15T07:00:00Z');
const hace = n => new Date(ahora.getTime() - n * 864e5).toISOString();
const E = 'Cotización de propuesta/precio';
const tratos = [
  { id: '1', Deal_Name: 'A', Stage: E, Modified_Time: hace(6), Closing_Date: '2027-01-21' },
  { id: '2', Deal_Name: 'B', Stage: E, Modified_Time: hace(2), Closing_Date: '2027-01-21' },
  { id: '3', Deal_Name: 'C', Stage: E, Modified_Time: hace(400), Closing_Date: '2019-05-27' },
  { id: '4', Deal_Name: 'D', Stage: E, Modified_Time: hace(10), Closing_Date: '2026-11-01' },
  { id: '5', Deal_Name: 'E', Stage: 'Clasificación', Modified_Time: hace(10), Closing_Date: '2027-01-21' },
  { id: '6', Deal_Name: 'F', Stage: E, Modified_Time: hace(12), Closing_Date: '2027-02-01' },
];
const tareas = [{ Subject: `${A.PREFIJO} F`, What_Id: { id: '6' }, Created_Time: hace(3) }];
const lista = A.porAvisar(tratos, tareas, ahora);
comprueba('avisa la de seis días', lista.some(d => d.id === '1'));
comprueba('no avisa la de dos días', !lista.some(d => d.id === '2'));
comprueba('no avisa las viejas ni las de fecha pasada', !lista.some(d => d.id === '3' || d.id === '4'));
comprueba('solo en la etapa de propuesta enviada', !lista.some(d => d.id === '5'));
comprueba('no repite si ya avisó hace menos de cinco días', !lista.some(d => d.id === '6'));
comprueba('repite pasados otros cinco días', A.porAvisar(tratos, [{ ...tareas[0], Created_Time: hace(6) }], ahora).some(d => d.id === '6'));
const ta = A.tarea(tratos[0], ahora);
comprueba('la tarea va a la oportunidad y es para hoy', ta.What_Id.id === '1' && ta.$se_module === 'Deals' && ta.Due_Date === '2026-11-15');

console.log(fallos ? `\n${fallos} fallos\n` : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
