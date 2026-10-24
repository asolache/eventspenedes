/* =============================================================================
   Events Penedès · el menú y el pie de todas las páginas, de un solo sitio

   Antes cada página llevaba su copia del menú y se desviaban (en /dj faltaba
   «Cómo trabajamos», en /contacto «Contacto», la portada iba a un ancla y las
   demás a /contacto). Ahora el menú sigue el flujo de valor y sale de aquí:

     Eventos · Espacios · Experiencias · DJ y música · Cómo trabajamos · La red
     · Agencias · Pedir propuesta · Acceso partners

   y la columna «Secciones» del pie, lo mismo más lo que cuelga de cada
   entrada (blog, agenda, «Entra en la red»).

   Escribe las páginas en castellano; ca/ y en/ salen después con
   build-i18n.mjs y la cabecera de /partners y /blog con build-marco.mjs.
   Los textos en catalán e inglés de cada clave se añaden a js/lang-*.js si
   faltan. Con --check no escribe nada y falla si algo no está al día.
   ========================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

/* Las entradas del menú, en el orden del flujo. `ancla` = sección de la portada. */
export const MENU = [
  { clave: 'nav.events',      ancla: 'servicios',      es: 'Eventos',          ca: 'Esdeveniments',    en: 'Events' },
  { clave: 'nav.spaces',      ancla: 'localizaciones', es: 'Espacios',         ca: 'Espais',           en: 'Venues' },
  { clave: 'nav.experiences', ancla: 'actividades',    es: 'Experiencias',     ca: 'Experiències',     en: 'Experiences' },
  { clave: 'nav.dj',          href: 'dj.html',         es: 'DJ y música',      ca: 'DJ i música',      en: 'DJ & music' },
  { clave: 'nav.process',     ancla: 'proceso',        es: 'Cómo trabajamos',  ca: 'Com treballem',    en: 'How we work' },
  { clave: 'nav.network',     href: '/partners',       es: 'La red',           ca: 'La xarxa',         en: 'The network' },
  { clave: 'nav.agents',      href: 'agencias.html',   es: 'Agencias',         ca: 'Agències',         en: 'Agencies' },
  { clave: 'nav.brief',       href: 'propuesta.html',  es: 'Pedir propuesta',  ca: 'Demanar proposta', en: 'Request a proposal' },
  { clave: 'nav.access',      href: '/acceso',         es: 'Acceso',           ca: 'Accés',            en: 'Log in' },
];

/* El pie: cada entrada del menú y, debajo de la suya, lo que cuelga de ella */
const PIE = [
  'nav.events', 'nav.spaces', 'nav.experiences',
  'nav.dj',
  'nav.process', 'nav.network',
  { clave: 'nav.blog',   href: '/blog',    es: 'Blog',            ca: 'Blog',             en: 'Blog' },
  { clave: 'nav.agenda', href: '/agenda',  es: 'Agenda',          ca: 'Agenda',           en: 'What\'s on' },
  { clave: 'nav.join',   href: 'red.html', es: 'Entra en la red', ca: 'Entra a la xarxa', en: 'Join the network' },
  { clave: 'nav.agencies', href: 'agencias.html', es: 'Agencias y DMC', ca: 'Agències i DMC', en: 'Agencies & DMCs' },
  'nav.brief',
  { clave: 'nav.partners', href: '/acceso', es: 'Acceso partners', ca: 'Accés partners', en: 'Partner login' },
];
const PIE_ITEMS = PIE.map(x => (typeof x === 'string' ? MENU.find(m => m.clave === x) : x));

const href = (item, portada) => (item.ancla ? `${portada ? '' : 'index.html'}#${item.ancla}` : item.href);
const li = (item, portada, sangria) => `${sangria}<li><a href="${href(item, portada)}" data-i18n="${item.clave}">${item.es}</a></li>`;

/* Las páginas en castellano que llevan el menú del sitio */
const paginas = readdirSync(RAIZ).filter(f => f.endsWith('.html'))
  .filter(f => readFileSync(join(RAIZ, f), 'utf8').includes('<nav class="nav"'));

const LINEA_NAV = /^([ \t]*)<li><a href="[^"]*"(?: data-i18n="nav\.[a-z_]+")?[^>]*>[^<]*<\/a><\/li>\n/gm;

function menu(html, portada) {
  return html.replace(/(<nav class="nav"[\s\S]*?<\/nav>)/, nav => {
    let sangria = null;
    const sin = nav.replace(LINEA_NAV, (m, s) => {
      if (sangria === null) { sangria = s; return '\u0000'; }
      return '';
    });
    if (sangria === null) throw new Error('menú sin entradas');
    return sin.replace('\u0000', MENU.map(i => li(i, portada, sangria)).join('\n') + '\n');
  });
}

function pie(html, portada) {
  return html.replace(/(<h4 data-i18n="foot\.h1">[^<]*<\/h4>\s*<ul>\n)([\s\S]*?)(\n[ \t]*<\/ul>)/, (m, a, cuerpo, b) => {
    const sangria = (cuerpo.match(/^[ \t]*/) || [''])[0];
    return a + PIE_ITEMS.map(i => li(i, portada, sangria)).join('\n') + b;
  });
}

let fuera = 0;
for (const f of paginas) {
  const ruta = join(RAIZ, f);
  const antes = readFileSync(ruta, 'utf8');
  const despues = pie(menu(antes, f === 'index.html'), f === 'index.html');
  if (despues !== antes) {
    fuera++;
    if (CHECK) console.log(`  ${f}: el menú o el pie no son los de tools/build-nav.mjs`);
    else writeFileSync(ruta, despues, 'utf8');
  }
}

/* Los textos en catalán e inglés de cada clave, en cada diccionario */
const TODAS = [...MENU, ...PIE_ITEMS.filter(i => !MENU.includes(i))];
for (const f of readdirSync(join(RAIZ, 'js')).filter(f => /^lang-.*\.js$/.test(f))) {
  const ruta = join(RAIZ, 'js', f);
  let txt = readFileSync(ruta, 'utf8');
  const antes = txt;
  for (const idioma of ['ca', 'en']) {
    /* El bloque de un idioma va de su `ca: {` / `en: {` al siguiente o al final */
    const marcas = [...txt.matchAll(/\n([ \t]*)(ca|en): \{\n/g)];
    const i = marcas.findIndex(m => m[2] === idioma);
    if (i < 0) continue;
    const ini = marcas[i].index + marcas[i][0].length;
    const fin = i + 1 < marcas.length ? marcas[i + 1].index : txt.length;
    const faltan = TODAS.filter(x => !txt.slice(ini, fin).includes(`'${x.clave}'`));
    if (!faltan.length) continue;
    const sangria = marcas[i][1] + '  ';
    txt = txt.slice(0, ini) + faltan.map(x => `${sangria}'${x.clave}': ${JSON.stringify(x[idioma])},\n`).join('') + txt.slice(ini);
  }
  if (txt !== antes) {
    fuera++;
    if (CHECK) console.log(`  js/${f}: faltan textos del menú`);
    else writeFileSync(ruta, txt, 'utf8');
  }
}

if (CHECK && fuera) {
  console.log('\nEl menú no está al día. Regenera con: node tools/build-nav.mjs && node tools/build-kit.mjs && node tools/build-i18n.mjs && node tools/build-marco.mjs');
  process.exitCode = 1;
} else {
  console.log(`  menú y pie: ${paginas.length} páginas${CHECK ? ', al día' : ''}`);
}
