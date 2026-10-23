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
  TeamTowers: { nombre: 'TeamTowers', web: 'teamtowershuma.com', hosts: ['teamtowershuma.com', 'teamtowers.eu'] },
};
export const MARCA_RED = 'Events Penedès';

const deNombre = n => MARCAS[n] || null;

/* La marca con la que se habla a un partner: la primera de las suyas */
export const marcaDe = p => deNombre((p?.marcas || [])[0]) || MARCAS[MARCA_RED];

/* ¿Es de la red de espacios y proveedores? Solo a ellos les toca lo de la red */
export const esDeLaRed = p => p?.tipo !== 'cliente' && (!p?.marcas || p.marcas.includes(MARCA_RED));

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

/* La página de entrada con la marca del sitio: lo de la red solo sale en la
   suya (`data-solo-red`), y el nombre, el título y el pie dicen la marca. */
export function vestirPagina(m, doc = globalThis.document) {
  if (!doc || m.nombre === MARCA_RED) { return; }
  doc.title = `Acceso de clientes · ${m.nombre}`;
  doc.documentElement.dataset.marca = m.nombre;
  for (const el of doc.querySelectorAll('[data-solo-red]')) { el.hidden = true; }
  for (const el of doc.querySelectorAll('[data-marca-nombre]')) { el.removeAttribute('data-i18n'); el.textContent = m.nombre; }
  for (const el of doc.querySelectorAll('a.brand')) { el.href = `https://${m.web}`; }
  for (const el of doc.querySelectorAll('[data-marca-texto]')) {
    const t = el.dataset[`texto${m.nombre.replace(/\s+/g, '')}`];
    if (t) { el.removeAttribute('data-i18n'); el.textContent = t; }
  }
}
