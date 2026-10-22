/* =============================================================================
   Prueba de la página del cliente (/evento)

   Lo que importa: que de un evento solo pase al cliente lo suyo —programa,
   lugar, personas y lo que nos falta—, nunca la venta (precios, costes,
   comisiones), los proveedores, la dedicación ni las notas internas; y que
   lo que falta salga de lo que está a null, sin inventar nada.

   Uso:  node tools/test-evento.mjs
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { eventoCliente, sqlEventoCliente } from './evento-cliente.mjs';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
console.log('\nPrueba de la página del cliente\n');

/* Un evento como los de eventos/<id>.json, con todo lo que no debe salir */
const EVENTO = {
  _comentario: 'Llega por la agencia Secreta SL, 2800 -10% +IVA',
  id: '2026-11-04-prueba',
  estado: 'vendido',
  cliente: { empresa: null, persona: 'Laura Secreta' },
  a_traves_de: 'Agencia Secreta',
  evento: { fecha: '2026-11-04', espacio_confirmado: true, pax: null, idioma_evento: null, objetivo: null,
    restricciones: 'Al aire libre, en el exterior de un hotel' },
  espacio: null,
  espacio_nota: 'Falta el nombre del hotel, preguntar a Laura',
  programa: [{ hora: '09:30', opcion: 'fent-pinya', nota: 'nota interna de la hora' }, { hora: '13:00', opcion: 'no-existe' }],
  venta: { lineas: [{ concepto: 'Taller', proveedor: 'teamtowers', precio_unidad: 2520, coste: 900, comision: 10, precio_nota: 'margen' }] },
  dedicacion: { registro: [{ tarea: 'planificar', nota: 'Llamar a Laura al 600 111 222' }] },
};

const c = eventoCliente(EVENTO, EVENTO.id);
const todo = JSON.stringify(c);

/* 1 · Lo que no sale nunca */
for (const secreto of ['2520', '2800', '900', 'Secreta', 'precio', 'coste', 'comision', 'margen', 'proveedor', '600 111 222', 'nota interna', 'Falta el nombre del hotel']) {
  comprueba(`no sale «${secreto}»`, !todo.includes(secreto));
}
comprueba('solo las claves del cliente', JSON.stringify(Object.keys(c)) === '["id","titulo","fecha","estado","datos"]'
  && JSON.stringify(Object.keys(c.datos)) === '["lugar","pax","programa","faltan"]');

/* 2 · El programa, del catálogo público */
comprueba('una actividad del catálogo, la desconocida fuera', c.datos.programa.length === 1);
comprueba('nombre del catálogo', c.datos.programa[0].titulo === 'Taller de castells «Fent Pinya»');
comprueba('hora de fin por la duración (120 min)', c.datos.programa[0].hora === '09:30' && c.datos.programa[0].fin === '11:30');
comprueba('la descripción sin HTML', !/[<>]/.test(c.datos.programa[0].describe));
comprueba('vendido se enseña como confirmado', c.estado === 'confirmado');

/* 3 · Lo que falta sale de lo que está a null */
const claves = c.datos.faltan.map(f => f.clave);
comprueba('faltan empresa, personas, lugar, idioma y objetivo', ['empresa', 'pax', 'lugar', 'idioma', 'objetivo'].every(k => claves.includes(k)));
comprueba('lugar confirmado sin nombre: se pide la dirección', c.datos.faltan.find(f => f.clave === 'lugar').texto.includes('dirección'));
comprueba('lo que pide la actividad, si el lugar no es de la red', c.datos.faltan.some(f => f.texto.includes('10 x 10 m')));
comprueba('al aire libre: plan si llueve', claves.includes('lluvia'));
comprueba('con hora no se pide la hora', !claves.includes('hora'));

/* 4 · Un espacio de la red: su nombre, y no se piden sus medidas */
const enRed = eventoCliente({ ...EVENTO, espacio: 'bellesguart', cliente: { empresa: 'Acme' }, evento: { ...EVENTO.evento, pax: 40, restricciones: null },
  programa: [{ hora: null, opcion: 'fent-pinya' }] }, 'x-red');
comprueba('el lugar con su nombre y población', enRed.datos.lugar?.nombre === 'Bellesguart' && Boolean(enRed.datos.lugar.poblacion));
comprueba('sin hora: se pide la hora', enRed.datos.faltan.some(f => f.clave === 'hora'));
comprueba('ni lugar, ni empresa, ni personas, ni medidas', !enRed.datos.faltan.some(f => ['lugar', 'empresa', 'pax'].includes(f.clave) || f.clave.startsWith('requiere')));

/* 5 · El SQL */
const sql = sqlEventoCliente(enRed, ['Cliente@Empresa.com']);
comprueba('escapa las comillas', sql.includes("L''Arboç"));
comprueba('se puede repetir sin duplicar', sql.includes('on conflict (id) do update'));
comprueba('el invitado, en minúsculas', sql.includes("'cliente@empresa.com'"));

/* 6 · La página no tiene de dónde sacar lo interno */
const js = readFileSync(new URL('../js/evento.js', import.meta.url), 'utf8');
comprueba('la página solo lee eventos_cliente y peticiones_cliente',
  [...js.matchAll(/from\('([a-z_]+)'\)/g)].every(m => ['eventos_cliente', 'peticiones_cliente'].includes(m[1])));
const migracion = readFileSync(new URL('../supabase/migrations/20261019180000_eventos_cliente.sql', import.meta.url), 'utf8');
comprueba('el cliente no puede escribir su evento', !/policy "[^"]*" on public\.eventos_cliente for (insert|update|all) to authenticated\s+using \(\(select public\.es_admin\(\)\) or/.test(migracion));
comprueba('lo que pide nace nueva y sin respuesta', /estado = 'nueva' and respuesta is null/.test(migracion));

/* 7 · Las propuestas en marcha y el enlace de seguimiento */
const PEDIDO = {
  correo_opciones: {
    pedido: '2026-12-18-comida-35', cabecera: ['Vuestra comida de empresa'], pax: 35,
    opciones: [
      { peticion: 'p/a', titulo: 'Masía A · menú', texto: 'Sala privada', foto: 'https://eventspenedes.com/assets/a.jpg', alt: 'A',
        menus: [{ nombre: 'Menú 1', precio_pax: 50 }], fijo: { texto: 'Coordinación y gestión del evento', importe: 300 } },
      { peticion: 'p/b', titulo: 'Bodega B', texto: 'Cata', foto: 'https://otra-web.com/b.jpg', precio_pax: null },
      { peticion: 'p/c', titulo: 'Bodega C', texto: 'Visita', precio_pax: 40 },
    ],
  },
};
const PETS = [{ id: 'p/a', disponible: true, nota: 'comisión 10 %' }, { id: 'p/b', disponible: null }, { id: 'p/c', disponible: false }];
const conPropuestas = eventoCliente(PEDIDO, '2026-12-18-prueba', { peticiones: PETS });
const props = conPropuestas.datos.propuestas;
const textoProps = JSON.stringify(props);
comprueba('una propuesta por opción', props.length === 3);
comprueba('lista con día confirmado y precio; en curso si no', props[0].estado === 'lista' && props[1].estado === 'en_curso');
comprueba('no disponible si el espacio no tiene el día, aunque tenga precio', props[2].estado === 'no_disponible');
comprueba('ni precios, ni el fijo, ni las notas de la petición', !/50|300|precio|Coordinación|comisión|menus/i.test(textoProps));
comprueba('fotos solo de nuestro dominio', props[0].foto && props[1].foto === null);
comprueba('fecha y personas del pedido', conPropuestas.fecha === '2026-12-18' && conPropuestas.datos.pax === 35);
comprueba('sin correo_opciones no hay propuestas', !('propuestas' in c.datos));
const { paginaSeguimiento } = await import('../netlify/functions/seguimiento.mjs');
const html = paginaSeguimiento({ ...conPropuestas, actualizado_en: '2026-10-21T16:00:00Z' });
comprueba('la página de seguimiento no se indexa', html.includes('noindex'));
comprueba('dice cuántas están listas', html.includes('1 de 2 propuestas listas. Un espacio no tiene libre ese día.'));
comprueba('la página dice qué espacio no está disponible', /No disponible<\/p>\s*<h2>Bodega C/.test(html));
comprueba('la página no lleva precios', !/€|300/.test(html.replace(/<footer[\s\S]*<\/footer>/, '')));
const fn = readFileSync(new URL('../netlify/functions/seguimiento.mjs', import.meta.url), 'utf8');
const { datosSeguimiento } = await import('../netlify/functions/seguimiento.mjs');
const json = datosSeguimiento({ ...conPropuestas, actualizado_en: '2026-10-21T16:00:00Z' });
comprueba('en datos: lo de la página y nada más', Object.keys(json).join() === 'titulo,fecha,pax,propuestas,actualizado_en'
  && json.propuestas[1].texto === null && json.propuestas[2].estado === 'no_disponible'
  && datosSeguimiento({ datos: { propuestas: [{ titulo: 'x', estado: 'raro' }] } }).propuestas[0].estado === 'en_curso' && !/precio|€|faltan|programa/.test(JSON.stringify(json)));
comprueba('solo las webs de la casa leen los datos', /ORIGENES = \['https:\/\/teamtowershuma\.com'/.test(fn) && !fn.includes("'access-control-allow-origin': '*'"));
comprueba('el seguimiento pide id y clave', /id=eq\.\$\{id\}&clave=eq\.\$\{clave\}/.test(fn));

console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
