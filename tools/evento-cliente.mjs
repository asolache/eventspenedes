#!/usr/bin/env node
/* =============================================================================
   La versión para el cliente de un evento

     node tools/evento-cliente.mjs <eventos/<id>.json> [--invita correo …]

   Escribe en la salida el SQL que deja en public.eventos_cliente lo que el
   cliente ve en /evento: título, fecha, lugar, personas, el programa con sus
   horas y lo que aún nos falta de él. Se puede repetir: el evento se
   actualiza, no se duplica. Con --invita, ese correo puede entrar a verlo.

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

/* El evento, sin SQL: exactamente lo que verá el cliente */
export function eventoCliente(ev, id) {
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
  if (!Number.isFinite(e.pax)) { falta('pax', 'Cuántas personas vendréis, aunque sea aproximado'); }
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

  const titulo = programa.map(p => p.titulo).join(' + ') || 'Vuestro evento';
  return {
    id,
    titulo: titulo.slice(0, 160),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(e.fecha || '') ? e.fecha : null,
    estado: ESTADOS[ev.estado] || 'propuesta',
    datos: {
      lugar: sitio ? { nombre: sitio.nombre, poblacion: sitio.poblacion || null } : null,
      pax: Number.isFinite(e.pax) ? e.pax : null,
      programa,
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
  if (!ruta) { console.error('Uso: node tools/evento-cliente.mjs <evento.json> [--invita correo …]'); process.exit(2); }
  const invitados = [];
  for (let i = 0; i < resto.length; i++) { if (resto[i] === '--invita' && resto[i + 1]) { invitados.push(resto[++i]); } }
  const ev = JSON.parse(readFileSync(ruta, 'utf8'));
  console.log(sqlEventoCliente(eventoCliente(ev, ev.id || basename(ruta, '.json')), invitados));
}
