/* =============================================================================
   Prueba del borrador automático

   Dos mitades, y la segunda importa más:

   1. que un enlace legítimo monte el borrador, con lo que el cliente escribió
      dentro y sin un solo importe;
   2. que **ningún otro enlace abra nada**: sin sobre, con el sobre tocado, con
      otra clave o caducado. Una página que lleva el nombre, el correo y el
      teléfono de un cliente no se protege con que la URL sea larga.

   Y una tercera que no es de seguridad pero se olvida igual: que el aviso de
   «borrador» y los datos de contacto **no existan** en el documento que se
   envía al cliente. No que estén escondidos: que no se escriban.

   Uso:  node tools/test-borrador.mjs
   ========================================================================== */
import { createHmac, createHash } from 'node:crypto';

const SECRETO = 'clave-de-prueba-larguisima-no-usar-jamas';
process.env.NETLIFY_WEBHOOK_JWS_SECRET = 'secreto-de-prueba-no-usar';
process.env.ZOHO_DRY_RUN = '1';
process.env.URL = 'https://eventspenedes.com';
process.env.PROPUESTA_SECRET = SECRETO;

const { default: borrador } = await import('../netlify/functions/borrador.mjs');
const { default: lead } = await import('../netlify/functions/lead.mjs');
const { cerrar } = await import('../netlify/propuesta/sobre.mjs');
const { render } = await import('../netlify/propuesta/render-propuesta.mjs');
const { briefingAEvento } = await import('../netlify/propuesta/briefing-a-evento.mjs');
const { opciones, espacios } = await import('../netlify/propuesta/catalogo.mjs');

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};

const BRIEFING = {
  idioma: 'ca', empresa: 'Acme SL', persona: 'Marta Puig',
  correo: 'marta@acme.example', telefono: '+34 600 000 000',
  tipo: 'convencion', pax: '60', fecha: '2027-05-14', fecha_firme: 'si',
  duracion: 'jornada', objetivo: 'Que los dos equipos se conozcan antes del lanzamiento.',
  espacio: 'torre-del-gall', exp_castells: 'si', exp_cata_aceite: 'si', exp_chef: 'si',
  catering: 'coctel', movilidad: 'microbus', origen_transporte: 'Barcelona',
  idioma_evento: 'es', presupuesto_orientativo: '15-40k',
  restricciones: 'Dos celíacos', quien_decide: 'Dirección', cuando_decide: 'Antes de Navidad',
  consentimiento: 'si',
};

const get = (busca, metodo = 'GET') =>
  borrador(new Request(`https://eventspenedes.com/p${busca}`, { method: metodo }));

const sobreDe = (datos, segundos = 3600, clave = SECRETO) => cerrar(datos, clave, segundos);
const carga = briefingAEvento(BRIEFING, { opciones, espacios, recibido: '2026-10-04T09:00:00.000Z' });

console.log('\nPrueba del borrador automático\n');

/* --- 1 · El camino bueno ------------------------------------------------- */
const r = await get('?d=' + sobreDe(carga));
const html = await r.text();

comprueba('un enlace válido devuelve la página', r.status === 200);
comprueba('dice que es un borrador y que no se ha enviado', /Borrador autom.tico/.test(html) && /no se ha enviado a nadie/.test(html));
comprueba('lleva dentro lo que el cliente escribió', html.includes('Que los dos equipos se conozcan antes del lanzamiento.'));
comprueba('monta el programa con las piezas que pidió', /Fent Pinya|castells/i.test(html));
comprueba('la fecha sale como pendiente de confirmar, aunque el cliente dijera que está cerrada',
  /pendiente de confirmar con el espacio/.test(html) && !/confirmada con el espacio/.test(html));

/* Lo que pidió y no encaja: la cata de aceite solo se hace en la almazara. */
comprueba('avisa de lo que pidió y no encaja', /no encajan/.test(html) && /Cata de aceite/.test(html));
comprueba('no cuela en el programa lo que no encaja',
  !/<strong>Cata de aceite[^<]*<\/strong>/.test(html.split('El programa')[1] || ''));

/* La banda de precio del briefing no entra en el evento, así que no puede
   llegar aquí. Se comprueba sobre el documento, no sobre la intención. */
const IMPORTE = /€|\beuros?\b|\d+[.,]\d{2}\s*(€|EUR)|\bEUR\b/i;
const cuerpo = html.replace(/<style>[\s\S]*?<\/style>/g, '');
comprueba('no hay ningún importe en la página', !IMPORTE.test(cuerpo));
comprueba('el presupuesto orientativo no aparece', !html.includes('15-40k') && !/15\.000/.test(cuerpo));

comprueba('no se indexa ni se cachea',
  /noindex/.test(r.headers.get('x-robots-tag') || '') && /no-store/.test(r.headers.get('cache-control') || ''));

/* --- 2 · El idioma se cambia sobre la marcha ----------------------------- */
const ca = await get('?idioma=ca&d=' + sobreDe(carga));
const htmlCa = await ca.text();
comprueba('el mismo enlace se lee en catalán', /pendent de confirmar/.test(htmlCa));
comprueba('las palabras del cliente no se traducen', htmlCa.includes('Que los dos equipos se conozcan antes del lanzamiento.'));
const malIdioma = await get('?idioma=de&d=' + sobreDe(carga));
comprueba('un idioma que no existe no rompe nada', malIdioma.status === 200);

/* --- 3 · Lo que no debe abrir -------------------------------------------- */
comprueba('sin sobre, no hay nada', (await get('')).status === 404);
comprueba('un sobre inventado no abre', (await get('?d=v1.aaa.bbb.ccc')).status === 404);

const bueno = sobreDe(carga);
comprueba('un sobre con un byte cambiado no abre',
  (await get('?d=' + bueno.slice(0, -4) + 'AAAA')).status === 404);
comprueba('un sobre cerrado con otra clave no abre',
  (await get('?d=' + sobreDe(carga, 3600, 'otra-clave-igual-de-larga-pero-distinta'))).status === 404);
comprueba('un sobre caducado lo dice, y no abre',
  (await get('?d=' + sobreDe(carga, -10))).status === 410);
comprueba('un POST no se atiende', (await get('?d=' + bueno, 'POST')).status === 405);

/* Una página sin la clave del sitio no puede abrir nada, y lo dice. */
delete process.env.PROPUESTA_SECRET;
comprueba('sin clave en el entorno, 503 y no 500', (await get('?d=' + bueno)).status === 503);
process.env.PROPUESTA_SECRET = SECRETO;

/* --- 4 · Lo que el cliente recibe no lleva la capa de borrador ----------
   No escondida con CSS: no escrita. Un aviso con `display:none` acaba dentro
   del PDF que se adjunta a un correo. */
const cliente = render({
  ev: carga.evento, opciones, espacios, idioma: 'es',
  marca: carga.evento.marca, modo: 'cliente',
  descartes: carga.descartes, avisos: carga.avisos,
}).html;
comprueba('el documento del cliente no dice «borrador»', !/Borrador autom.tico/.test(cliente));
comprueba('el documento del cliente no lleva el teléfono ni el correo del contacto',
  !cliente.includes('marta@acme.example') && !cliente.includes('+34 600 000 000'));
comprueba('el documento del cliente no lleva lo que se descartó', !/no encajan/.test(cliente));
comprueba('el documento del cliente tampoco lleva importes',
  !IMPORTE.test(cliente.replace(/<style>[\s\S]*?<\/style>/g, '')));

/* --- 4b · La vista de cliente del mismo enlace --------------------------
   Es la que se retoca en el navegador y se guarda como PDF: tiene que ser el
   documento del cliente, no el borrador con una capa de CSS encima. */
const vc = await (await get('?vista=cliente&d=' + bueno)).text();
const vcCuerpo = vc.replace(/<style>[\s\S]*?<\/style>/g, '');
comprueba('la vista de cliente no dice «borrador» ni lleva los avisos',
  !/Borrador autom.tico/.test(vc) && !/no encajan/.test(vc));
comprueba('la vista de cliente no lleva el teléfono ni el correo del contacto',
  !vc.includes('marta@acme.example') && !vc.includes('+34 600 000 000'));
comprueba('la vista de cliente no lleva importes', !IMPORTE.test(vcCuerpo));
comprueba('la vista de cliente se puede retocar', /class="hoja" contenteditable="true"/.test(vc));
comprueba('deja el hueco del párrafo a medida, vacío', /<p class="a-medida"[^>]*><\/p>/.test(vc));
comprueba('y no queda el carácter de relleno en ninguna parte', !vc.includes('\u2063'));
comprueba('lleva el botón de guardar PDF y la barra no se imprime',
  /window\.print\(\)/.test(vc) && /@media print \{ \.barra \{ display:none/.test(vc));
comprueba('la vista de cliente tampoco se cachea',
  /no-store/.test((await get('?vista=cliente&d=' + bueno)).headers.get('cache-control') || ''));
comprueba('marca blanca sin agencia no se monta',
  (await get('?vista=cliente&marca=blanca&d=' + bueno)).status === 400);
const blanca = await (await get('?vista=cliente&marca=blanca&de=WE%20Events&d=' + bueno)).text();
comprueba('en marca blanca firma la agencia y no queda Events Penedès en el documento',
  blanca.includes('WE Events') && !/Events Pened[eè]s/.test(blanca.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<form class="barra"[\s\S]*?<\/form>/, '')));
comprueba('una marca inventada no rompe nada', (await get('?vista=cliente&marca=xx&d=' + bueno)).status === 200);
comprueba('el borrador enlaza a la vista de cliente', /vista=cliente/.test(html));

/* --- 5 · El enlace llega a la ficha del CRM ------------------------------ */
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const firmar = (c) => {
  const cab = b64({ typ: 'JWT', alg: 'HS256' });
  const cg = b64({ iss: 'netlify', sha256: createHash('sha256').update(c, 'utf8').digest('hex') });
  return `${cab}.${cg}.${createHmac('sha256', process.env.NETLIFY_WEBHOOK_JWS_SECRET).update(`${cab}.${cg}`).digest('base64url')}`;
};
const avisar = async (form, data) => {
  const c = JSON.stringify({ form_name: form, created_at: '2026-10-04T09:00:00.000Z', data });
  const res = await lead(new Request('https://eventspenedes.com/.netlify/functions/lead', {
    method: 'POST', headers: { 'x-webhook-signature': firmar(c), 'content-type': 'application/json' }, body: c,
  }));
  /* El borrador va en una nota aparte del lead, no en su descripción. */
  const j = await res.json();
  return { ...j.lead, nota: j.nota || '' };
};

const fichaPropuesta = await avisar('propuesta', BRIEFING);
const enlace = (fichaPropuesta.nota.match(/https:\/\/eventspenedes\.com\/p\?d=\S+/) || [])[0];
comprueba('la nota del lead lleva el enlace del borrador', Boolean(enlace));
comprueba('la nota dice que no se ha enviado', /No se ha enviado a nadie/.test(fichaPropuesta.nota));
comprueba('la ficha avisa de lo que no encaja', /Cata de aceite/.test(fichaPropuesta.Description));
comprueba('el presupuesto orientativo sigue en la ficha, que es donde sirve',
  /15\.000/.test(fichaPropuesta.Description));

if (enlace) {
  const vuelta = await borrador(new Request(enlace));
  const htmlVuelta = await vuelta.text();
  comprueba('el enlace de la ficha abre el borrador', vuelta.status === 200
    && htmlVuelta.includes('Que los dos equipos se conozcan antes del lanzamiento.'));
  /* Un enlace que no quepa en un correo o en un campo del CRM no sirve de nada. */
  comprueba(`el enlace cabe en cualquier sitio (${enlace.length} caracteres)`, enlace.length < 4000);
}

const fichaContacto = await avisar('contacto', { nombre: 'Quien Sea', correo: 'q@ejemplo.test', tipo: 'otro' });
comprueba('el formulario de contacto no monta borradores', !/\/p\?d=/.test(fichaContacto.Description + fichaContacto.nota));

/* Y si no hay clave, el lead sigue entrando: lo importante no se pierde por lo
   cómodo. */
delete process.env.PROPUESTA_SECRET;
const sinClave = await avisar('propuesta', BRIEFING);
comprueba('sin clave, el lead se crea igual y solo falta el borrador',
  sinClave.Email === 'marta@acme.example' && !/\/p\?d=/.test(sinClave.Description + sinClave.nota));
process.env.PROPUESTA_SECRET = SECRETO;

console.log('');
if (fallos) { console.log(`❌ ${fallos} comprobación${fallos > 1 ? 'es' : ''} del borrador ha${fallos > 1 ? 'n' : ''} fallado.\n`); process.exit(1); }
console.log('✅ El borrador se monta solo, no se abre con otro enlace y no lleva nada que no deba.\n');
