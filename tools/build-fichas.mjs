/* =============================================================================
   Events Penedès · genera los campos de los formularios de fichas

   Los campos de `alta-localizacion.html` y `alta-proveedor.html` salen de su
   esquema (`netlify/localizacion/esquema.mjs`, `netlify/proveedor/esquema.mjs`),
   que es también lo que lee la función para armar la ficha de Zoho. Si el
   formulario y la ficha se escribieran por separado, el primer campo nuevo
   saldría en uno y no en el otro.

   Solo se reescribe lo que hay entre los dos comentarios marcadores; el resto
   de cada página se edita a mano.

   Uso:  node tools/build-fichas.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FICHAS } from '../netlify/ficha/fichas.mjs';
import { repetido } from '../netlify/ficha/nucleo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGINAS = [
  { pagina: 'alta-localizacion.html', esquema: FICHAS.localizacion, id: 'l' },
  { pagina: 'alta-proveedor.html', esquema: FICHAS.proveedor, id: 'p' },
];
let PREFIJO = 'l';
const INICIO = '<!-- campos: generado por tools/build-fichas.mjs, no editar -->';
const FIN = '<!-- /campos -->';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CORTOS = new Set(['text', 'tel', 'email', 'url', 'number', 'eur', 'date', 'select', 'sino']);
const TIPO_INPUT = { eur: 'number', text: 'text', tel: 'tel', email: 'email', url: 'url', number: 'number', date: 'date' };

function campo(c, nombre, sangria) {
  const id = `${PREFIJO}-${nombre.replace(/_/g, '-')}`;
  const req = c.req ? ' required' : '';
  const s = sangria;
  if (c.t === 'checks') {
    const l = [`${s}<fieldset class="opts">`, `${s}  <legend>${esc(c.l)}</legend>`];
    for (const [k, t] of Object.entries(c.op)) {
      l.push(`${s}  <p class="field--check"><label><input type="checkbox" name="${nombre}_${k}" value="si"> <span>${esc(t)}</span></label></p>`);
    }
    if (c.hint) { l.push(`${s}  <p class="field__hint">${esc(c.hint)}</p>`); }
    l.push(`${s}</fieldset>`);
    return l.join('\n');
  }
  const l = [`${s}<p class="field${c.interno ? ' solo-interno' : ''}">`, `${s}  <label for="${id}">${esc(c.l)}</label>`];
  if (c.t === 'select' || c.t === 'sino') {
    const op = c.t === 'sino' ? { si: 'Sí', no: 'No' } : c.op;
    const vacia = c.req ? 'Elige una opción' : 'Sin dato';
    l.push(`${s}  <select id="${id}" name="${nombre}"${req}>`);
    l.push(`${s}    <option value="">${vacia}</option>`);
    for (const [v, t] of Object.entries(op)) { l.push(`${s}    <option value="${esc(v)}">${esc(t)}</option>`); }
    l.push(`${s}  </select>`);
  } else if (c.t === 'textarea') {
    l.push(`${s}  <textarea id="${id}" name="${nombre}" rows="${c.max ? 5 : 3}" maxlength="${c.max || 2000}"></textarea>`);
  } else {
    const extra = [];
    if (c.t === 'number') { extra.push('min="0"', 'max="100000"', ...(c.dec ? ['step="0.01"', 'inputmode="decimal"'] : ['inputmode="numeric"'])); }
    if (c.t === 'eur') { extra.push('min="0"', 'max="1000000"', 'step="0.01"', 'inputmode="decimal"'); }
    if (c.ac) { extra.push(`autocomplete="${c.ac}"`); }
    if (c.im) { extra.push(`inputmode="${c.im}"`); }
    if (['text', 'tel', 'email', 'url'].includes(c.t)) { extra.push('maxlength="300"'); }
    l.push(`${s}  <input id="${id}" name="${nombre}" type="${TIPO_INPUT[c.t]}"${extra.length ? ' ' + extra.join(' ') : ''}${req}>`);
  }
  if (c.hint) { l.push(`${s}  <span class="field__hint">${esc(c.hint)}</span>`); }
  l.push(`${s}</p>`);
  return l.join('\n');
}

/* Los campos cortos van de dos en dos; en el móvil, la hoja de estilos los
   apila. Los textos largos y las casillas ocupan la fila entera. */
function campos(lista, sangria) {
  const out = [];
  let fila = [];
  const vaciar = () => {
    if (!fila.length) { return; }
    if (fila.length === 1) { out.push(fila[0].replace(new RegExp(`^${sangria}  `, 'gm'), sangria)); }
    else { out.push(`${sangria}<div class="form__row">\n${fila.join('\n')}\n${sangria}</div>`); }
    fila = [];
  };
  for (const [c, nombre] of lista) {
    if (CORTOS.has(c.t)) {
      fila.push(campo(c, nombre, sangria + '  '));
      if (fila.length === 2) { vaciar(); }
    } else {
      vaciar();
      out.push(campo(c, nombre, sangria));
    }
  }
  vaciar();
  return out.join('\n');
}

const S = '        ';
function generar({ pagina, esquema, id }) {
const { SECCIONES, ABRE = {} } = esquema;
PREFIJO = id;
const bloques = [];
for (const sec of SECCIONES) {
  const b = [sec.sub
    ? `${S}<h3 class="form__h form__h--sub" id="sec-${sec.id}">${esc(sec.titulo)}</h3>`
    : `${S}<h2 class="form__h" id="sec-${sec.id}">${esc(sec.titulo)}</h2>`];
  if (sec.interno) { b[0] = `${S}<div class="solo-interno form">\n` + b[0]; }
  if (sec.nota) { b.push(`${S}<p class="field__hint">${esc(sec.nota)}</p>`); }
  if (sec.si) {
    b.push(`${S}<p class="field--check"><label><input type="checkbox" name="${sec.si}" value="si" data-tipos="${(ABRE[sec.si] || []).join(' ')}"> <span>${esc(sec.interruptor)}</span></label></p>`);
    b.push(`${S}<div class="form__cond" data-si="${sec.si}">`);
    b.push(campos(sec.campos.map(c => [c, c.n]), S + '  '));
    b.push(`${S}</div>`);
  } else if (sec.repite) {
    /* El mismo bloque n veces; la página los enseña de uno en uno */
    const r = sec.repite;
    for (let i = 1; i <= r.n; i++) {
      b.push(`${S}<fieldset class="sala" data-repite="${r.prefijo}">`);
      b.push(`${S}  <legend>${esc(r.leyenda)} ${i}</legend>`);
      b.push(campos(r.campos.map(c => [c, repetido(r, i, c.n)]), S + '  '));
      b.push(`${S}</fieldset>`);
    }
    b.push(`${S}<p class="sala__mas" data-repite-mas="${r.prefijo}" hidden><button class="btn btn--ghost" type="button">${esc(r.mas)}</button></p>`);
  } else if (sec.grupos) {
    /* Agrupar solo cambia cómo se ve: los nombres de campo siguen planos */
    const sueltos = sec.campos.filter(c => !sec.grupos.some(([, re]) => re.test(c.n)));
    for (const [leyenda, re] of sec.grupos) {
      b.push(`${S}<fieldset class="grupo">`);
      b.push(`${S}  <legend>${esc(leyenda)}</legend>`);
      /* Dentro del grupo sobra repetir el nombre del paquete en cada etiqueta */
      const corta = c => ({ ...c, l: c.l.replace(/^[^·]+· (.)/, (m, x) => x.toUpperCase()) });
      b.push(campos(sec.campos.filter(c => re.test(c.n)).map(c => [corta(c), c.n]), S + '  '));
      b.push(`${S}</fieldset>`);
    }
    if (sueltos.length) { b.push(campos(sueltos.map(c => [c, c.n]), S)); }
  } else {
    b.push(campos(sec.campos.map(c => [c, c.n]), S));
  }
  if (sec.interno) { b.push(`${S}</div>`); }
  bloques.push(b.join('\n'));
}

const ruta = join(RAIZ, pagina);
const html = readFileSync(ruta, 'utf8');
const a = html.indexOf(INICIO), z = html.indexOf(FIN);
if (a === -1 || z === -1 || z < a) {
  console.error(`No encuentro los marcadores de los campos en ${pagina}`);
  process.exit(1);
}
const nuevo = html.slice(0, a + INICIO.length) + '\n' + bloques.join('\n\n') + '\n' + S + html.slice(z);
if (nuevo !== html) { writeFileSync(ruta, nuevo, 'utf8'); }
console.log(`  ${pagina}: ${SECCIONES.length} secciones`);
}

for (const p of PAGINAS) { generar(p); }

/* Las etiquetas de cada campo, para el portal: quien revisa un cambio de ficha
   lee «Servicio 3 · Precio (€)» y no `servicio3_precio`. Sale del mismo
   esquema que los formularios. */
function etiquetas() {
  const tipos = {};
  const opciones = [];
  const op = o => { const s = JSON.stringify(o); let i = opciones.indexOf(s); if (i === -1) { i = opciones.push(s) - 1; } return i; };
  for (const [tipo, esquema] of Object.entries(FICHAS)) {
    const t = {};
    for (const [n, c] of esquema.campos()) {
      const x = [c.l, c.s.titulo, c.campo.t || 'text'];
      if (c.campo.op && (c.campo.t === 'select')) { x.push(op(c.campo.op)); }
      t[n] = x;
    }
    tipos[tipo] = t;
  }
  const js = `/* Generado por tools/build-fichas.mjs a partir de los esquemas de las fichas. No editar.
   Cada campo: [etiqueta, sección, tipo, índice de sus opciones]. */
export const OPCIONES = [\n${opciones.map(s => `  ${s}`).join(',\n')},\n];
export const CAMPOS = ${JSON.stringify(tipos)};
`;
  const ruta = join(RAIZ, 'js/campos.js');
  let antes = '';
  try { antes = readFileSync(ruta, 'utf8'); } catch (e) { /* primera vez */ }
  if (antes !== js) { writeFileSync(ruta, js, 'utf8'); }
  console.log(`  js/campos.js: ${Object.values(tipos).reduce((s, t) => s + Object.keys(t).length, 0)} campos`);
}
etiquetas();
