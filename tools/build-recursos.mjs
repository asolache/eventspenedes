/* =============================================================================
   Events Penedès — genera la lista de recursos.html

   La lista sale de data/recursos.json, que es una copia de la capa pública del
   índice de documentación del repositorio privado (sync-web.mjs). Aquí no se
   escribe ni se filtra nada: lo que llega ya ha pasado la guarda de allí.

   Se rellena lo que hay entre <!-- recursos:inicio --> y <!-- recursos:fin -->.

   Uso:  node tools/build-recursos.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGINA = join(RAIZ, 'recursos.html');
const datos = JSON.parse(readFileSync(join(RAIZ, 'data/recursos.json'), 'utf8'));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SITIO = 'https://eventspenedes.com/';
const href = u => u.startsWith(SITIO) ? (u.slice(SITIO.length) || 'index.html') : u;

const bloques = datos.temas.map(t => {
  const items = datos.entradas.filter(e => e.tema === t.id).map(e =>
    `        <li><a href="${esc(href(e.url))}"><strong>${esc(e.titulo)}</strong></a> — ${esc(e.resumen)}.</li>`);
  return `      <h2>${esc(t.nombre)}</h2>\n      <ul>\n${items.join('\n')}\n      </ul>`;
});

const html = readFileSync(PAGINA, 'utf8');
const re = /(<!-- recursos:inicio -->\n)[\s\S]*?(<!-- recursos:fin -->)/;
if (!re.test(html)) { console.log('✗ recursos.html no tiene las marcas recursos:inicio / recursos:fin'); process.exit(1); }
writeFileSync(PAGINA, html.replace(re, (_, a, b) => `${a}${bloques.join('\n\n')}\n${b}`));
console.log(`✓ recursos.html: ${datos.entradas.length} recursos en ${datos.temas.length} temas`);
