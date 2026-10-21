#!/usr/bin/env node
/* =============================================================================
   La versión para el cliente de un evento

     node tools/evento-cliente.mjs <eventos/<id>.json> [--invita correo …]
                                   [--peticiones data/peticiones.json]

   Escribe en la salida el SQL que deja en public.eventos_cliente lo que el
   cliente ve en /evento: título, fecha, lugar, personas, el programa con sus
   horas y lo que aún nos falta de él. Se puede repetir: el evento se
   actualiza, no se duplica. Con --invita, ese correo puede entrar a verlo.

   Si el evento lleva `correo_opciones` (la propuesta en marcha), también las
   propuestas que estamos pidiendo, una por espacio: «en curso» hasta que el
   espacio confirma el día y la opción tiene precio, y entonces «lista». Las
   ve el cliente en /evento y en el enlace de seguimiento, sin entrar
   (/seguimiento/<id>/<clave>), sin precios: la propuesta con precio le llega
   por correo.

   Solo pasa lo que es del cliente. Nunca la venta (precios, costes,
   comisiones), los proveedores, la dedicación ni las notas internas: los
   nombres y las descripciones salen del catálogo público de la web.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { opciones, espacios } from '../netlify/propuesta/catalogo.mjs';

const texto = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const dia = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `'${v}'` : 'null');
const sinHtml = s => String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const ESTADOS = { propuesta: 'propuesta', vendido: 'confirmado', hecho: 'hecho', cerrado: 'hecho', cancelado: 'cancelado' };

/* «09:30» + 120 min → «11:30» */
function finDe(hora, minutos) {
  if (!/^\d{2}:\d{2}$/.test(hora || '') || !Number.isFinite(minutos)) { return null; }
  const [hh, mm] = hora.split(':').map(Number);
  const t = hh * 60 + mm + minutos;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/* Las propuestas para el cliente: de cada opción, el título, la descripción y
   la foto. Nunca precios ni el fijo de gestión. Está lista cuando el espacio
   ha dicho que tiene el día (peticiones.json) y la opción tiene precio. */
export function propuestasCliente(co, peticiones = []) {
  if (!co || !Array.isArray(co.opciones)) { return []; }
  return co.opciones.map(o => {
    const p = peticiones.find(x => x.id === o.peticion) || {};
    const menus = Array.isArray(o.menus) ? o.menus : [];
    const conPrecio = menus.length ? menus.every(m => Number.isFinite(m.precio_pax)) : Number.isFinite(o.precio_pax);
    return {
      titulo: sinHtml(o.titulo).slice(0, 160) || null,
      estado: conPrecio && p.disponible === true ? 'lista' : 'en_curso',
      texto: sinHtml(o.texto) || null,
      foto: /^https:\/\/eventspenedes\.com\//.test(o.foto || '') ? o.foto : null,
      alt: o.foto ? sinHtml(o.alt) || null : null,
    };
  }).filter(x => x.titulo);
}

/* El evento, sin SQL: exactamente lo que verá el cliente */
export function eventoCliente(ev, id, { peticiones = [] } = {}) {
  const co = ev.correo_opciones || null;
  const e = ev.evento || {};
  const sitio = espacios.find(x => x.id === ev.espacio) || null;
  const programa = (ev.programa || []).map(p => {
    const o = opciones.find(x => x.id === p.opcion);
    return {
      hora: /^\d{2}:\d{2}$/.test(p.hora || '') ? p.hora : null,
      fin: o ? finDe(p.hora, o.duracion_min) : null,
      titulo: o ? o.nombre.es : null,
      describe: o ? sinHtml(o.describe.es) : null,
      requiere: o && !sitio ? (o.requiere || []).slice(0, 6) : [],
    };
  }).filter(p => p.titulo);

  const faltan = [];
  const falta = (clave, txt) => faltan.push({ clave, texto: txt });
  if (!ev.cliente?.empresa) { falta('empresa', 'El nombre de vuestra empresa, tal como debe salir en el evento'); }
  if (!Number.isFinite(e.pax) && !Number.isFinite(co?.pax)) { falta('pax', 'Cuántas personas vendréis, aunque sea aproximado'); }
  if (!sitio) {
    falta('lugar', e.espacio_confirmado ? 'El nombre y la dirección exacta del lugar' : 'Dónde será el evento');
  }
  if (programa.some(p => !p.hora)) { falta('hora', 'A qué hora empezamos'); }
  for (const p of programa) {
    if (p.requiere.length) { falta(`requiere-${programa.indexOf(p)}`, `Que el lugar tenga sitio para ${p.titulo}: ${p.requiere.join(', ')}`); }
  }
  if (/exterior|aire libre/i.test(e.restricciones || '')) { falta('lluvia', 'Un sitio a cubierto por si llueve'); }
  if (!e.idioma_evento) { falta('idioma', 'En qué idioma lo hacemos'); }
  if (!e.objetivo) { falta('objetivo', 'Qué queréis que se lleve el grupo del día'); }

  const propuestas = propuestasCliente(co, peticiones);
  const titulo = programa.map(p => p.titulo).join(' + ') || sinHtml(co?.cabecera?.[0]) || 'Vuestro evento';
  /* Sin evento cerrado, la fecha es la del pedido (sus ids empiezan por ella) */
  const fechaPedido = (co?.pedido || '').slice(0, 10);
  const fecha = [e.fecha, fechaPedido].find(f => /^\d{4}-\d{2}-\d{2}$/.test(f || '')) || null;
  return {
    id,
    titulo: titulo.slice(0, 160),
    fecha,
    estado: ESTADOS[ev.estado] || 'propuesta',
    datos: {
      lugar: sitio ? { nombre: sitio.nombre, poblacion: sitio.poblacion || null } : null,
      pax: Number.isFinite(e.pax) ? e.pax : (Number.isFinite(co?.pax) ? co.pax : null),
      programa,
      ...(co ? { propuestas } : {}),
      faltan,
    },
  };
}

export function sqlEventoCliente(c, invitados = []) {
  const lineas = [`insert into public.eventos_cliente (id, titulo, fecha, estado, datos)
values (${texto(c.id)}, ${texto(c.titulo)}, ${dia(c.fecha)}, ${texto(c.estado)}, ${texto(JSON.stringify(c.datos))}::jsonb)
on conflict (id) do update set titulo = excluded.titulo, fecha = excluded.fecha, estado = excluded.estado,
  datos = excluded.datos, actualizado_en = now();`];
  for (const correo of invitados) {
    lineas.push(`insert into public.evento_invitados (evento_id, correo) values (${texto(c.id)}, ${texto(correo.trim().toLowerCase())}) on conflict do nothing;`);
  }
  return lineas.join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [ruta, ...resto] = process.argv.slice(2);
  if (!ruta) { console.error('Uso: node tools/evento-cliente.mjs <evento.json> [--invita correo …] [--peticiones peticiones.json]'); process.exit(2); }
  const invitados = [];
  let peticiones = [];
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--invita' && resto[i + 1]) { invitados.push(resto[++i]); }
    if (resto[i] === '--peticiones' && resto[i + 1]) { peticiones = JSON.parse(readFileSync(resto[++i], 'utf8')).peticiones || []; }
  }
  const ev = JSON.parse(readFileSync(ruta, 'utf8'));
  console.log(sqlEventoCliente(eventoCliente(ev, ev.id || basename(ruta, '.json'), { peticiones }), invitados));
}
