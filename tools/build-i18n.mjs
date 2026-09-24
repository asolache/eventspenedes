/* =============================================================================
   Events Penedès — genera las versiones en catalán e inglés
   Cada idioma tiene su propia URL (/ca/ y /en/), que es lo que necesitan los
   buscadores para indexar los tres. El castellano es la fuente: vive en
   index.html y dj.html; las traducciones, en js/lang-*.js.

   Uso:  node tools/build-i18n.mjs
   ========================================================================== */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const IDIOMAS = ['ca', 'en'];

const PAGINAS = [
  { fuente: 'index.html', dic: 'js/lang-home.js', ruta: '' },
  { fuente: 'dj.html',    dic: 'js/lang-dj.js',   ruta: 'dj.html' },
];

/* Los ficheros de idioma son scripts de navegador: se evalúan con un window
   de mentira para quedarse con los dos objetos que definen. */
function cargarDiccionario(rel) {
  const src = readFileSync(join(RAIZ, rel), 'utf8');
  const window = {};
  new Function('window', src)(window);
  return { textos: window.EP_I18N, meta: window.EP_META };
}

/* Sustituye el contenido de un nodo marcado con data-i18n */
function traducirNodos(html, textos) {
  return html.replace(
    /(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/g,
    (todo, apertura, etiqueta, clave, contenido, cierre) => {
      const nuevo = textos[clave];
      return typeof nuevo === 'string' ? apertura + nuevo + cierre : todo;
    }
  );
}

/* Sustituye el texto alternativo de una imagen marcada con data-i18n-alt */
function traducirAlt(html, textos) {
  return html.replace(/data-i18n-alt="([^"]+)"([^>]*?)alt="([^"]*)"/g,
    (todo, clave, medio, alt) => {
      const nuevo = textos[clave];
      return typeof nuevo === 'string'
        ? `data-i18n-alt="${clave}"${medio}alt="${escaparAtributo(nuevo)}"`
        : todo;
    });
}

function escaparAtributo(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function reemplazarMeta(html, attr, nombre, valor) {
  const re = new RegExp(`(<meta ${attr}="${nombre}" content=")([^"]*)(">)`);
  return html.replace(re, (todo, a, _viejo, c) => a + escaparAtributo(valor) + c);
}

function construir(pagina, idioma) {
  const { textos, meta } = cargarDiccionario(pagina.dic);
  const dic = textos[idioma];
  const m = meta[idioma];
  if (!dic || !m) { throw new Error(`Falta el idioma ${idioma} en ${pagina.dic}`); }

  let html = readFileSync(join(RAIZ, pagina.fuente), 'utf8');

  html = traducirNodos(html, dic);
  html = traducirAlt(html, dic);

  html = html.replace('<html lang="es">', `<html lang="${idioma}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${m.title}</title>`);
  html = reemplazarMeta(html, 'name', 'description', m.desc);
  html = reemplazarMeta(html, 'property', 'og:title', m.title);
  html = reemplazarMeta(html, 'property', 'og:description', m.social);
  html = reemplazarMeta(html, 'property', 'og:image:alt', m.title);
  html = reemplazarMeta(html, 'property', 'og:locale', m.locale);
  html = reemplazarMeta(html, 'name', 'twitter:title', m.title);
  html = reemplazarMeta(html, 'name', 'twitter:description', m.social);
  html = reemplazarMeta(html, 'name', 'twitter:image:alt', m.title);

  /* Cada versión es canónica de sí misma */
  html = html.replace(
    `<link rel="canonical" href="https://eventspenedes.com/${pagina.ruta}">`,
    `<link rel="canonical" href="https://eventspenedes.com/${idioma}/${pagina.ruta}">`);
  html = html.replace(
    `<meta property="og:url" content="https://eventspenedes.com/${pagina.ruta}">`,
    `<meta property="og:url" content="https://eventspenedes.com/${idioma}/${pagina.ruta}">`);

  /* Rutas absolutas: la página vive una carpeta más abajo */
  html = html.replace(/(href|src)="(css|js|assets)\//g, '$1="/$2/');
  html = html.replace(/href="site\.webmanifest"/g, 'href="/site.webmanifest"');
  html = html.replace(/href="\/sitemap\.xml"/g, 'href="/sitemap.xml"');
  html = html.replace(/href="dj\.html/g, `href="/${idioma}/dj.html`);
  html = html.replace(/href="index\.html/g, `href="/${idioma}/index.html`);
  html = html.replace(/(<a class="brand" href=")index\.html(")/g, `$1/${idioma}/$2`);

  /* El conmutador marca el idioma en el que estamos */
  html = html.replace(/ aria-current="true"/, '');
  html = html.replace(new RegExp(`(<a class="lang__btn" href="/${idioma}/[^"]*" hreflang="${idioma}" lang="${idioma}")`),
                      '$1 aria-current="true"');

  /* Los datos estructurados apuntan a esta versión */
  html = html.replace(/"inLanguage": \[[^\]]*\]/g, `"inLanguage": "${idioma}"`);

  const destino = join(RAIZ, idioma, pagina.ruta || 'index.html');
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, html, 'utf8');

  const sinTraducir = [...html.matchAll(/data-i18n="([^"]+)"/g)]
    .map(x => x[1]).filter(k => typeof dic[k] !== 'string');
  return { destino: destino.replace(RAIZ + '/', ''), sinTraducir };
}

let fallos = 0;
for (const idioma of IDIOMAS) {
  for (const pagina of PAGINAS) {
    const r = construir(pagina, idioma);
    if (r.sinTraducir.length) {
      fallos += r.sinTraducir.length;
      console.log(`  ${r.destino}: ${r.sinTraducir.length} sin traducir → ${r.sinTraducir.join(', ')}`);
    } else {
      console.log(`  ${r.destino}: completo`);
    }
  }
}
if (fallos) {
  console.log(`\n${fallos} claves sin traducir. Añádelas a js/lang-*.js.`);
  process.exitCode = 1;
}
