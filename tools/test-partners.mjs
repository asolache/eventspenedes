/* =============================================================================
   Prueba de las páginas públicas de los partners y de lo que se publica

   Lo que importa: que de una ficha solo salga lo que el partner ha autorizado
   publicar —nada de precios, contactos, comisiones ni notas nuestras—, que
   sin autorización no salga nada, y que las rutas hagan solo lo suyo.

   Uso:  node tools/test-partners.mjs
   ========================================================================== */
import { FICHAS } from '../netlify/ficha/fichas.mjs';
import { fichaPublica } from '../netlify/ficha/publica.mjs';
import { coste } from '../netlify/ficha/coste.mjs';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
console.log('\nPrueba de las páginas de partners\n');

/* 1 · Lo que se publica de una ficha */
const ESPACIO = {
  autoriza: 'si', nombre: 'Masia de Prova', tipo: 'masia', poblacion: 'Subirats',
  descripcion: 'Una masía entre viñas con vistas a Montserrat.',
  direccion: 'Camí de les Vinyes 1', cp: '08739', telefono: '+34 600 111 222', web: 'https://masia.example',
  contacto_persona: 'Joana Secreta', contacto_correo: 'joana@masia.example', contacto_movil: '+34 600 999 888',
  relacion: 'aliado', aforo_banquete: '120', aforo_coctel: '200', parking: '40',
  alquiler_dia: '3500', comision: '10', sala1_nombre: 'La Cava', sala1_m2: '400', sala1_precio_dia: '1800',
  visita_notas: 'Muy majos, negociar precio', equipo_proyector: 'si',
};
const pub = fichaPublica(FICHAS.localizacion, ESPACIO);
const texto = JSON.stringify(pub);
comprueba('sale el nombre, la población y la descripción', pub.nombre === 'Masia de Prova' && pub.poblacion === 'Subirats' && /viñas/.test(pub.descripcion));
comprueba('salen los aforos', /200/.test(texto) && /Máximo de pie/.test(texto));
comprueba('salen las salas sin su precio', /La Cava/.test(texto) && !/1800/.test(texto));
for (const [que, v] of [['teléfono', '600 111 222'], ['dirección', 'Vinyes'], ['código postal', '08739'], ['web', 'masia.example'],
  ['persona de contacto', 'Joana'], ['móvil', '999 888'], ['precio', '3500'], ['comisión', '"10"'], ['notas de visita', 'negociar'],
  ['relación con nosotros', 'aliado']]) {
  comprueba(`no sale ${que}`, !texto.includes(v));
}
comprueba('sin autorización no sale nada', fichaPublica(FICHAS.localizacion, { ...ESPACIO, autoriza: 'revisar' }) === null);

const PROV = {
  autoriza: 'si', nombre: 'Música de Prova', categoria: 'musica', poblacion: 'Vilafranca del Penedès',
  descripcion: 'Grupos en directo.', ofrece_musica: 'si', musica_duracion: '2 h',
  servicio1_nombre: 'Cuarteto de cuerda', servicio1_precio: '900', servicio1_incluye: 'Sonido y montaje',
  servicio1_comision: '15', minimo_facturacion: '500', reserva: 'Señal del 30 %',
};
const pp = JSON.stringify(fichaPublica(FICHAS.proveedor, PROV));
comprueba('de un proveedor salen sus servicios por su nombre y qué incluyen', /Cuarteto de cuerda/.test(pp) && /Sonido y montaje/.test(pp));
comprueba('pero no su precio, su comisión ni sus condiciones', !/900/.test(pp) && !/"15"/.test(pp) && !/500/.test(pp) && !/Señal/.test(pp));

/* 2 · El coste de una importación */
const c = coste('claude-opus-5-5', { input_tokens: 100000, output_tokens: 4000, cache_read_input_tokens: 0 });
comprueba('100k tokens de entrada y 4k de salida con Opus 5.5 cuestan 0,48 USD', c.usd === 0.48);
comprueba('un modelo sin tarifa no se adivina', coste('modelo-raro', { input_tokens: 10 }).usd === null);

/* 3 · Las rutas, con la base de datos simulada */
const { default: handler } = await import('../netlify/functions/partners.mjs');
const pedir = (ruta, method = 'GET') => handler(new Request(`https://eventspenedes.com${ruta}`, { method }));

comprueba('sin la clave del portal, /partners no existe', (await pedir('/partners')).status === 404);

process.env.SUPABASE_SECRET_KEY = 'sb_secret_de_prueba';
const ID = '11111111-2222-3333-4444-555555555555';
const llamadas = [];
globalThis.fetch = async (url, op = {}) => {
  llamadas.push({ url: String(url), op });
  if (String(url).includes('/rest/v1/partners')) {
    return Response.json([
      { id: ID, codigo: 'masia-prova', nombre: 'Masia de Prova', tipo: 'localizacion', estado: 'activo',
        fichas: { datos: { ...ESPACIO, imagenes: [`${ID}/a.jpg`, 'otro-partner/b.jpg'] }, version: 2, actualizada_en: '2026-10-15T10:00:00Z' } },
      { id: 'x', codigo: 'sin-permiso', nombre: 'Sin permiso', tipo: 'localizacion', estado: 'activo',
        fichas: { datos: { ...ESPACIO, autoriza: 'no' } } },
    ]);
  }
  if (String(url).includes('/rest/v1/rpc/sumar_impresion')) { return new Response(null, { status: 204 }); }
  if (String(url).includes('/storage/v1/object/fotos/')) { return new Response('JPEG', { headers: { 'content-type': 'image/jpeg' } }); }
  return new Response('?', { status: 404 });
};

const r = await pedir('/partners/masia-prova');
const html = await r.text();
comprueba('la página de un partner autorizado existe', r.status === 200);
comprueba('lleva título, descripción y canónica', /<title>Masia de Prova · Espacio para eventos en Subirats/.test(html)
  && /<meta name="description" content="Una masía entre viñas/.test(html) && /rel="canonical" href="https:\/\/eventspenedes.com\/partners\/masia-prova"/.test(html));
const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
const negocio = ld.find(x => Array.isArray(x['@type']) && x['@type'].includes('EventVenue'));
comprueba('con datos estructurados de lugar para eventos y su aforo', negocio && negocio.maximumAttendeeCapacity === 200 && negocio.address.addressLocality === 'Subirats');
comprueba('y migas de pan', ld.some(x => x['@type'] === 'BreadcrumbList'));
comprueba('la página no lleva teléfono, contacto ni precios', !/600 111 222|Joana|3500|1800/.test(html));
comprueba('solo enseña las fotos de su propia carpeta', /\/partners\/masia-prova\/foto\/1/.test(html) && !/foto\/2/.test(html));
comprueba('la foto de otra carpeta no se sirve', (await pedir('/partners/masia-prova/foto/2')).status === 404);
comprueba('la suya sí', (await pedir('/partners/masia-prova/foto/1')).status === 200);
comprueba('un partner sin autorización no tiene página', (await pedir('/partners/sin-permiso')).status === 404);
comprueba('un código raro tampoco', (await pedir('/partners/%3Cscript%3E')).status === 404);
const dir = await (await pedir('/partners')).text();
comprueba('el directorio enseña a los autorizados y a nadie más', /Masia de Prova/.test(dir) && !/Sin permiso/.test(dir));
const mapa = await (await pedir('/partners/sitemap.xml')).text();
comprueba('el mapa del sitio lleva su página', /<loc>https:\/\/eventspenedes.com\/partners\/masia-prova<\/loc><lastmod>2026-10-15<\/lastmod>/.test(mapa));

llamadas.length = 0;
const ir = await pedir('/partners/masia-prova/contacto');
comprueba('«Organizar un evento aquí» cuenta el clic y lleva al contacto con su código', ir.status === 302
  && ir.headers.get('location') === '/contacto.html?ref=masia-prova#escribenos'
  && llamadas.some(l => l.url.includes('sumar_impresion') && JSON.parse(l.op.body).p_clic === true));
llamadas.length = 0;
const visto = await pedir('/partners/masia-prova/visto', 'POST');
comprueba('una visita se cuenta por POST', visto.status === 204 && llamadas.some(l => l.url.includes('sumar_impresion') && JSON.parse(l.op.body).p_clic === false));
comprueba('la clave secreta va en la cabecera apikey', llamadas.every(l => l.op.headers?.apikey === 'sb_secret_de_prueba'));
comprueba('por POST no se hace nada más', (await pedir('/partners/masia-prova', 'POST')).status === 405);

/* 4 · La vista previa del portal: su partner la ve aunque no esté autorizada,
   con la misma regla de lo que se publica, y nadie más */
const SOCIO = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const pendiente = { ...ESPACIO, autoriza: 'revisar', descripcion: 'Texto nuevo aún sin validar.', imagenes: [`${ID}/nueva.jpg`] };
const fetchPortal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  llamadas.push({ url: u, op });
  if (u.includes('/auth/v1/user')) {
    const t = op.headers?.Authorization;
    return t === 'Bearer a.socio.x' ? Response.json({ id: SOCIO }) : t === 'Bearer a.otro.x' ? Response.json({ id: ID }) : new Response('{}', { status: 401 });
  }
  if (u.includes('/rest/v1/admins')) { return Response.json([]); }
  if (u.includes('/rest/v1/miembros')) { return Response.json(u.includes(SOCIO) ? [{ user_id: SOCIO }] : []); }
  if (u.includes('/rest/v1/cambios_ficha')) { return Response.json([{ datos: pendiente }]); }
  if (u.includes('/rest/v1/fichas')) { return Response.json([{ datos: ESPACIO }]); }
  if (u.includes('/storage/v1/object/sign/fotos/')) { return Response.json({ signedURL: '/object/sign/fotos/x?token=t' }); }
  return fetchPortal(url, op);
};
const previa = (token) => handler(new Request('https://eventspenedes.com/partners/masia-prova/previa', { headers: token ? { authorization: `Bearer ${token}` } : {} }));
comprueba('sin sesión no hay vista previa', (await previa()).status === 401);
comprueba('con la sesión de otro, tampoco', (await previa('a.otro.x')).status === 404);
llamadas.length = 0;
const rp = await previa('a.socio.x');
const hp = await rp.text();
comprueba('su partner ve la ficha pendiente aunque no esté autorizada', rp.status === 200 && /Texto nuevo aún sin validar/.test(hp) && /No se publicará hasta que/.test(hp));
comprueba('la vista previa tampoco lleva teléfono, contacto ni precios', !/600 111 222|Joana|3500|1800/.test(hp));
comprueba('no se indexa, no se guarda en la CDN ni cuenta visitas', /content="noindex"/.test(hp) && rp.headers.get('cache-control') === 'no-store'
  && !/\/visto/.test(hp) && !/\/contacto"/.test(hp) && !llamadas.some(l => l.url.includes('sumar_impresion')));
comprueba('enseña las fotos aún sin aprobar con un enlace que caduca', /storage\/v1\/object\/sign\/fotos\/x\?token=t/.test(hp));
globalThis.fetch = fetchPortal;

console.log('');
if (fallos) { console.log(`❌ ${fallos} fallo${fallos > 1 ? 's' : ''}.`); process.exit(1); }
console.log('✅ Solo se publica lo autorizado y cada ruta hace lo suyo.\n');
