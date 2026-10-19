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

console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
