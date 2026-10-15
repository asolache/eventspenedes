/* =============================================================================
   Genera netlify/portal/marco.mjs: la cabecera y el pie de la web para las
   páginas que monta una función (/partners). Salen de red.html para que el
   menú no se separe del resto del sitio. Los enlaces pasan a absolutos porque
   esas páginas viven en /partners/…, y se quita el conmutador de idioma: las
   fichas de los partners solo están en castellano.

   Uso:  node tools/build-marco.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(RAIZ, 'red.html'), 'utf8');
const trozo = (a, b) => src.slice(src.indexOf(a), src.indexOf(b) + b.length);
const absolutos = t => t.replace(/href="(?!https?:|\/|#|mailto:|tel:)([^"]+)"/g, 'href="/$1"');

const cabecera = absolutos(trozo('<header class="site-header">', '</header>'))
  .replace(/<li>\s*<div class="lang"[\s\S]*?<\/div>\s*<\/li>/, '');
const pie = absolutos(trozo('<footer class="site-footer">', '</footer>'));

writeFileSync(join(RAIZ, 'netlify/portal/marco.mjs'),
  `/* GENERADO por tools/build-marco.mjs a partir de red.html. No se edita a mano. */\n`
  + `export const CABECERA = ${JSON.stringify(cabecera)};\n`
  + `export const PIE = ${JSON.stringify(pie)};\n`, 'utf8');
console.log('netlify/portal/marco.mjs');
