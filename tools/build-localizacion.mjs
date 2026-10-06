/* =============================================================================
   Events Penedès · genera los campos del formulario de localizaciones

   Los campos de `alta-localizacion.html` salen de `netlify/localizacion/
   esquema.mjs`, que es también lo que lee la función para armar la ficha de
   Zoho. Si el formulario y la ficha se escribieran por separado, el primer
   campo nuevo saldría en uno y no en el otro.

   Solo se reescribe lo que hay entre los dos comentarios marcadores; el resto
   de la página se edita a mano.

   Uso:  node tools/build-localizacion.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECCIONES, SALAS, ABRE, camposSala, salaCampo } from '../netlify/localizacion/esquema.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGINA = join(RAIZ, 'alta-localizacion.html');
const INICIO = '<!-- campos: generado por tools/build-localizacion.mjs, no editar -->';
const FIN = '<!-- /campos -->';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const CORTOS = new Set(['text', 'tel', 'email', 'url', 'number', 'eur', 'date', 'select', 'sino']);
const TIPO_INPUT = { eur: 'number', text: 'text', tel: 'tel', email: 'email', url: 'url', number: 'number', date: 'date' };

function campo(c, nombre, sangria) {
  const id = `l-${nombre.replace(/_/g, '-')}`;
  const req = c.req ? ' required' : '';
  const s = sangria;
  if (c.t === 'checks') {
    const l = [`${s}<fieldset class="opts">`, `${s}  <legend>${esc(c.l)}</legend>`];
    for (const [k, t] of Object.entries(c.op)) {
      l.push(`${s}  <p class="field--check"><label><input type="checkbox" name="${nombre}_${k}" value="si"> <span>${esc(t)}</span></label></p>`);
    }
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
    l.push(`${s}  <textarea id="${id}" name="${nombre}" rows="3" maxlength="2000"></textarea>`);
  } else {
    const extra = [];
    if (c.t === 'number') { extra.push('min="0"', 'max="100000"', 'inputmode="numeric"'); }
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
const bloques = [];
for (const sec of SECCIONES) {
  const b = [`${S}<h2 class="form__h" id="sec-${sec.id}">${esc(sec.titulo)}</h2>`];
  if (sec.interno) { b[0] = `${S}<div class="solo-interno form">\n` + b[0]; }
  if (sec.nota) { b.push(`${S}<p class="field__hint">${esc(sec.nota)}</p>`); }
  if (sec.si) {
    b.push(`${S}<p class="field--check"><label><input type="checkbox" name="${sec.si}" value="si" data-tipos="${(ABRE[sec.si] || []).join(' ')}"> <span>${esc(sec.interruptor)}</span></label></p>`);
    b.push(`${S}<div class="form__cond" data-si="${sec.si}">`);
    b.push(campos(sec.campos.map(c => [c, c.n]), S + '  '));
    b.push(`${S}</div>`);
  } else if (sec.salas) {
    for (let i = 1; i <= SALAS; i++) {
      b.push(`${S}<fieldset class="sala" data-sala="${i}">`);
      b.push(`${S}  <legend>Sala o espacio ${i}</legend>`);
      b.push(campos(camposSala.map(c => [c, salaCampo(i, c.n)]), S + '  '));
      b.push(`${S}</fieldset>`);
    }
    b.push(`${S}<p class="sala__mas" hidden><button class="btn btn--ghost" type="button" data-sala-mas>Añadir otra sala</button></p>`);
  } else {
    b.push(campos(sec.campos.map(c => [c, c.n]), S));
  }
  if (sec.interno) { b.push(`${S}</div>`); }
  bloques.push(b.join('\n'));
}

const html = readFileSync(PAGINA, 'utf8');
const a = html.indexOf(INICIO), z = html.indexOf(FIN);
if (a === -1 || z === -1 || z < a) {
  console.error('No encuentro los marcadores de los campos en alta-localizacion.html');
  process.exit(1);
}
const nuevo = html.slice(0, a + INICIO.length) + '\n' + bloques.join('\n\n') + '\n' + S + html.slice(z);
if (nuevo !== html) { writeFileSync(PAGINA, nuevo, 'utf8'); }
console.log(`  alta-localizacion.html: ${SECCIONES.length} secciones`);
