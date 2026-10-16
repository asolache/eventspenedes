/* =============================================================================
   Events Penedès — el esqueleto de la app (/acceso)

   Barra arriba, navegación a un lado (abajo en el móvil) y una vista cada
   vez. La vista que se ve va en la dirección (#<app>/<vista>), así que el
   botón de atrás del navegador y un enlace a una vista funcionan. Los
   estilos están en css/app.css.
   ========================================================================== */
import { h, poner } from './portal-ui.js';

/* Iconos de trazo, 24×24, en el color del texto */
const TRAZOS = {
  inicio: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h13V9.5',
  reservas: 'M4 6.5h16v13H4zM4 10.5h16M8.5 4v4M15.5 4v4',
  flujo: 'M4 19V9M10 19V5M16 19v-7M21 19H3',
  ficha: 'M4 5h16v14H4zM8 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0M6.5 16c.6-1.6 2-2.5 3.5-2.5s2.9.9 3.5 2.5M15 9.5h3M15 13h3',
  plan: 'M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5',
  acuerdo: 'M7 3.5h7l4 4v13H7zM14 3.5v4h4M9.5 12h6M9.5 15.5h6',
  clientes: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20c.8-3.4 3.4-5 6.5-5s5.7 1.6 6.5 5M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 15c1.6.6 2.7 2.4 3 5',
  conversacion: 'M4 5h16v11H9l-5 4z',
  ia: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8ZM18.5 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9Z',
  partners: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  cambios: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  uso: 'M12 3v18M17 6.5H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6',
  regalo: 'M4 10h16v10H4zM2.5 6.5h19V10h-19zM12 6.5V20M12 6.5C10.5 3 7 3 7 5s3 1.5 5 1.5c2 0 5 .5 5-1.5s-3.5-2-5 1.5',
};

export function icono(nombre) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', TRAZOS[nombre] || TRAZOS.inicio);
  svg.append(p);
  return svg;
}

/* vistas: [{ id, titulo, icono, n?, intro?, nodos: [...] }] */
export function app({ clave, titulo, subtitulo, marca = 'Events Penedès', acciones = [], vistas }) {
  const botones = {};
  const secciones = {};
  const nav = h('nav', { class: 'app__nav', 'aria-label': `Secciones de ${titulo}` },
    h('div', { class: 'app__marca' }, icono('ia'), h('span', {}, marca, h('small', {}, titulo))));
  const main = h('div', { class: 'app__main' });

  for (const v of vistas) {
    const b = h('button', { class: 'app__ir', type: 'button', onclick: () => ir(v.id, true) },
      icono(v.icono), h('span', {}, v.corto || v.titulo), v.n ? h('span', { class: 'app__n', 'aria-label': `${v.n} pendientes` }, String(v.n)) : null);
    botones[v.id] = b;
    nav.append(b);
    const s = h('section', { class: 'app__vista', id: `${clave}-${v.id}`, hidden: true, 'aria-label': v.titulo },
      h('h2', {}, v.titulo), v.intro ? h('p', { class: 'app__intro' }, v.intro) : null);
    poner(s, v.nodos);
    secciones[v.id] = s;
    main.append(s);
  }

  const raiz = h('div', { class: 'app', 'data-app': clave },
    h('header', { class: 'app__barra' },
      h('div', { class: 'app__titulo' }, h('strong', {}, titulo), subtitulo ? h('span', {}, subtitulo) : null),
      h('div', { class: 'app__acciones' }, acciones)),
    nav, main);

  function ir(id, aviso) {
    if (!secciones[id]) { id = vistas[0].id; }
    for (const [k, s] of Object.entries(secciones)) { s.hidden = k !== id; }
    for (const [k, b] of Object.entries(botones)) {
      if (k === id) { b.setAttribute('aria-current', 'page'); } else { b.removeAttribute('aria-current'); }
    }
    if (aviso) {
      history.replaceState(null, '', `#${clave}/${id}`);
      raiz.scrollIntoView({ block: 'start' });
      botones[id].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  const desdeDireccion = () => {
    const [a, v] = location.hash.slice(1).split('/');
    if (a === clave && v) { ir(v, false); }
  };
  window.addEventListener('hashchange', desdeDireccion);
  ir(vistas[0].id, false);
  desdeDireccion();
  raiz.ir = id => ir(id, true);
  return raiz;
}

/* Un enlace a otra vista de la misma app */
export const irA = (raiz, id, texto = 'Ir') => h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => raiz().ir(id) }, texto);

export const tarjeta = (titulo, ...hijos) => h('div', { class: 'app-card' }, titulo ? h('h3', {}, titulo) : null, ...hijos);

export const kpis = lista => h('dl', { class: 'app-kpis' }, lista.filter(Boolean).map(([t, v, nota, tono]) =>
  h('div', { class: 'app-kpi', 'data-tono': tono || null }, h('dt', {}, t), h('dd', {}, String(v), nota ? h('small', {}, ` ${nota}`) : null))));

export const chip = (texto, tono) => h('span', { class: 'app-chip', 'data-tono': tono || null }, texto);

/* Vistas que añaden otros módulos (el blog, la agenda…) sin tocar los paneles:
   cada una es una función async (ctx) => { id, titulo, icono, n?, intro?, nodos } */
export const extras = { partner: [], admin: [] };
export async function vistasExtra(tipo, ctx) {
  const out = [];
  for (const f of extras[tipo]) {
    try { const v = await f(ctx); if (v) { out.push(v); } } catch (e) { console.error('vista extra:', e); }
  }
  return out;
}
