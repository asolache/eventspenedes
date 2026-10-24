/* =============================================================================
   Las marcas del portal (/acceso)

   El portal es el paso 2 de todas las marcas: cada partner lleva las suyas en
   `partners.marcas` (los valores de la regla de la marca de Zoho). Lo que ve
   un cliente de TeamTowers dice TeamTowers; lo de la red de espacios y
   proveedores sigue diciendo lo de siempre.

   Antes de entrar, la marca la da el sitio: el dominio desde el que se abre
   el portal o, para probarlo en una preview, `?marca=teamtowers`.
   ========================================================================== */

export const MARCAS = {
  'Events Penedès': { nombre: 'Events Penedès', web: 'eventspenedes.com', hosts: ['eventspenedes.com'] },
  /* `espacio`: lo que la marca añade al espacio de sus clientes. Vive en su
     web y se carga de allí, no se copia (teamtowershuma, SOS/lib/espai-client.js) */
  TeamTowers: { nombre: 'TeamTowers', web: 'teamtowershuma.com', hosts: ['teamtowershuma.com', 'teamtowers.eu'],
    espacio: 'https://teamtowershuma.com/SOS/lib/espai-client.js' },
};
export const MARCA_RED = 'Events Penedès';

const deNombre = n => MARCAS[n] || null;

/* La marca con la que se habla a un partner: la primera de las suyas */
export const marcaDe = p => deNombre((p?.marcas || [])[0]) || MARCAS[MARCA_RED];

/* ¿Es de la red de espacios y proveedores? Solo a ellos les toca lo de la red */
export const esDeLaRed = p => p?.tipo !== 'cliente' && (!p?.marcas || p.marcas.includes(MARCA_RED));

/* ¿Es de esa marca? `TODAS` deja pasar a todos (la vista del administrador) */
export const TODAS = 'todas';
export const esDeMarca = (p, marca) => marca === TODAS || (p?.marcas?.length ? p.marcas : [MARCA_RED]).includes(marca);

/* La marca del sitio, antes de entrar */
export function marcaDelSitio(loc = globalThis.location) {
  const pedida = new URLSearchParams(loc?.search || '').get('marca');
  if (pedida) {
    const m = Object.values(MARCAS).find(x => x.nombre.toLowerCase().replace(/\s+/g, '') === pedida.toLowerCase().replace(/\s+/g, ''));
    if (m) { return m; }
  }
  const host = String(loc?.hostname || '').replace(/^www\./, '');
  return Object.values(MARCAS).find(m => m.hosts.some(x => host === x || host.endsWith(`.${x}`))) || MARCAS[MARCA_RED];
}

/* La página con una marca: lo de la red solo sale en la suya (`data-solo-red`),
   y el nombre, el título y el pie dicen la marca. Se puede volver a llamar con
   otra (al cambiar de partner o de marca dentro): lo de la red se recuerda la
   primera vez y vuelve tal cual. */
const ORIGINAL = new WeakMap();
const OCULTO = new WeakMap();
const recordar = (el, attrs) => {
  if (!ORIGINAL.has(el)) { ORIGINAL.set(el, { texto: el.textContent, ...Object.fromEntries(attrs.map(a => [a, el.getAttribute(a)])) }); }
  return ORIGINAL.get(el);
};
const devolver = (el, o, a) => { if (o[a] === null) { el.removeAttribute(a); } else { el.setAttribute(a, o[a]); } };

export function vestirPagina(m, doc = globalThis.document) {
  if (!doc) { return; }
  const red = m.nombre === MARCA_RED;
  if (!ORIGINAL.has(doc)) { ORIGINAL.set(doc, { titulo: doc.title }); }
  doc.title = red ? ORIGINAL.get(doc).titulo : `Acceso de clientes · ${m.nombre}`;
  if (red) { delete doc.documentElement.dataset.marca; } else { doc.documentElement.dataset.marca = m.nombre; }
  for (const el of doc.querySelectorAll('[data-solo-red]')) {
    if (!OCULTO.has(el)) { OCULTO.set(el, el.hidden); }
    el.hidden = red ? OCULTO.get(el) : true;
  }
  for (const el of doc.querySelectorAll('[data-marca-nombre]')) {
    const o = recordar(el, ['data-i18n']);
    if (red) { el.textContent = o.texto; devolver(el, o, 'data-i18n'); } else { el.removeAttribute('data-i18n'); el.textContent = m.nombre; }
  }
  for (const el of doc.querySelectorAll('a.brand')) {
    const o = recordar(el, ['href']);
    if (red) { devolver(el, o, 'href'); } else { el.href = `https://${m.web}`; }
  }
  for (const el of doc.querySelectorAll('[data-marca-texto]')) {
    const o = recordar(el, ['data-i18n']);
    const t = red ? null : el.dataset[`texto${m.nombre.replace(/\s+/g, '')}`];
    if (t) { el.removeAttribute('data-i18n'); el.textContent = t; } else { el.textContent = o.texto; devolver(el, o, 'data-i18n'); }
  }
}
