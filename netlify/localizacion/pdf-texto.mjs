/* =============================================================================
   Events Penedès · el texto de un PDF, sin dependencias

   Es el camino de reserva de la importación de catálogos: cuando no hay clave
   de Claude, o el PDF es demasiado grande para mandarlo entero, el texto sale
   de aquí. No pretende maquetar: saca las palabras en el orden en que el PDF
   las pinta, con saltos de línea donde el texto baja, que es lo que necesitan
   las reglas de `importar.mjs` para encontrar un aforo o un teléfono.

   Lo que entiende, que es lo que usan los catálogos de verdad (Canva, InDesign,
   Word): objetos sueltos y dentro de /ObjStm, flujos FlateDecode, fuentes con
   /ToUnicode (bfchar y bfrange, códigos de 1 o 2 bytes) y cadenas literales o
   hexadecimales en Tj, TJ, ' y ".
   Lo que no: PDF cifrados y PDF escaneados (son imágenes: no hay texto que
   sacar). En esos casos devuelve poco o nada, y quien llama lo dice.
   ========================================================================== */
import { inflateSync } from 'node:zlib';

const latin1 = b => Buffer.from(b).toString('latin1');

/* --- Objetos ----------------------------------------------------------------- */

function inflar(buf) {
  try { return inflateSync(buf); } catch { /* flujos con basura al final */ }
  try { return inflateSync(buf, { finishFlush: 2 /* Z_SYNC_FLUSH */ }); } catch { return null; }
}

/* Cada objeto como { dict: texto del diccionario, stream: Buffer | null } */
function objetos(pdf) {
  const out = new Map();
  const s = latin1(pdf);
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m;
  while ((m = re.exec(s))) {
    const id = Number(m[1]);
    const ini = re.lastIndex;
    const fin = s.indexOf('endobj', ini);
    if (fin === -1) { break; }
    const cuerpo = s.slice(ini, fin);
    const k = cuerpo.indexOf('stream');
    let dict = cuerpo, stream = null;
    if (k !== -1 && /<<[\s\S]*>>\s*$/.test(cuerpo.slice(0, k))) {
      dict = cuerpo.slice(0, k);
      let a = ini + k + 6;
      if (s[a] === '\r') { a++; }
      if (s[a] === '\n') { a++; }
      const z = s.lastIndexOf('endstream', fin);
      let datos = pdf.subarray(a, z > a ? z : fin);
      const largo = /\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict);
      if (largo && Number(largo[1]) <= datos.length) { datos = datos.subarray(0, Number(largo[1])); }
      stream = /\/FlateDecode/.test(dict) ? inflar(datos) : (/\/Filter/.test(dict) ? null : datos);
    }
    out.set(id, { dict, stream });
    re.lastIndex = fin + 6;
  }
  /* Los objetos comprimidos dentro de flujos de objetos (PDF 1.5+) */
  for (const o of [...out.values()]) {
    if (!/\/Type\s*\/ObjStm/.test(o.dict) || !o.stream) { continue; }
    const n = Number(/\/N\s+(\d+)/.exec(o.dict)?.[1] || 0);
    const primero = Number(/\/First\s+(\d+)/.exec(o.dict)?.[1] || 0);
    const t = latin1(o.stream);
    const nums = t.slice(0, primero).trim().split(/\s+/).map(Number);
    for (let i = 0; i < n; i++) {
      const id = nums[2 * i], desde = primero + nums[2 * i + 1];
      const hasta = i + 1 < n ? primero + nums[2 * i + 3] : t.length;
      if (!out.has(id)) { out.set(id, { dict: t.slice(desde, hasta), stream: null }); }
    }
  }
  return out;
}

const ref = (dict, clave) => {
  const m = new RegExp(`/${clave}\\s+(\\d+)\\s+\\d+\\s+R`).exec(dict);
  return m ? Number(m[1]) : null;
};

/* El contenido de un diccionario anidado `/Clave << … >>`, respetando << >> dentro */
function subdict(dict, clave, objs) {
  const i = dict.search(new RegExp(`/${clave}\\s*(<<|\\d+\\s+\\d+\\s+R)`));
  if (i === -1) { return null; }
  const resto = dict.slice(i + clave.length + 1).trimStart();
  if (!resto.startsWith('<<')) {
    const id = Number(/^(\d+)/.exec(resto)[1]);
    return objs.get(id)?.dict ?? null;
  }
  let prof = 0;
  for (let j = 0; j < resto.length - 1; j++) {
    if (resto[j] === '<' && resto[j + 1] === '<') { prof++; j++; }
    else if (resto[j] === '>' && resto[j + 1] === '>') { prof--; j++; if (prof === 0) { return resto.slice(2, j - 1); } }
  }
  return null;
}

/* --- ToUnicode ----------------------------------------------------------------- */

const hexAUtf16 = h => {
  const b = Buffer.from(h.length % 2 ? h + '0' : h, 'hex');
  let s = '';
  for (let i = 0; i + 1 < b.length; i += 2) { s += String.fromCharCode(b.readUInt16BE(i)); }
  return s;
};

function cmap(texto) {
  const m = new Map();
  let bytes = 1;
  const cs = /begincodespacerange\s*<([0-9a-fA-F]+)>/.exec(texto);
  if (cs) { bytes = Math.max(1, cs[1].length / 2); }
  for (const bloque of texto.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of bloque[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      m.set(parseInt(p[1], 16), hexAUtf16(p[2]));
    }
  }
  for (const bloque of texto.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const p of bloque[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*(<[0-9a-fA-F]*>|\[[^\]]*\])/g)) {
      const a = parseInt(p[1], 16), z = parseInt(p[2], 16);
      if (z - a > 65535) { continue; }
      if (p[3].startsWith('[')) {
        const lista = [...p[3].matchAll(/<([0-9a-fA-F]*)>/g)].map(x => hexAUtf16(x[1]));
        for (let c = a; c <= z; c++) { if (lista[c - a] !== undefined) { m.set(c, lista[c - a]); } }
      } else {
        const base = p[3].slice(1, -1);
        const ini = hexAUtf16(base);
        for (let c = a; c <= z; c++) {
          m.set(c, ini.slice(0, -1) + String.fromCharCode(ini.charCodeAt(ini.length - 1) + (c - a)));
        }
      }
    }
  }
  return { m, bytes };
}

/* --- Contenido de página ---------------------------------------------------------- */

function literal(s, i) {
  /* s[i] === '(' — devuelve [bytes, siguiente índice] */
  const out = [];
  let prof = 1, j = i + 1;
  while (j < s.length && prof > 0) {
    const c = s[j];
    if (c === '\\') {
      const n = s[j + 1];
      const esc = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 };
      if (n in esc) { out.push(esc[n]); j += 2; continue; }
      const oct = /^[0-7]{1,3}/.exec(s.slice(j + 1, j + 4));
      if (oct) { out.push(parseInt(oct[0], 8) & 255); j += 1 + oct[0].length; continue; }
      j += 2; continue;
    }
    if (c === '(') { prof++; } else if (c === ')') { prof--; if (prof === 0) { break; } }
    out.push(c.charCodeAt(0) & 255);
    j++;
  }
  return [out, j + 1];
}

function decodificar(bytes, fuente) {
  if (!fuente) { return Buffer.from(bytes).toString('latin1'); }
  const { m, bytes: n } = fuente;
  let s = '';
  for (let i = 0; i + n - 1 < bytes.length; i += n) {
    let c = 0;
    for (let k = 0; k < n; k++) { c = (c << 8) | bytes[i + k]; }
    s += m.has(c) ? m.get(c) : (n === 1 ? String.fromCharCode(c) : '');
  }
  return s;
}

/* Saca el texto de un flujo de contenido. `recursos` es el diccionario de
   recursos que le toca (fuentes y XObjects); `xobj(nombre)` devuelve el texto
   de un formulario incrustado, que es donde Canva mete todo el texto.

   Los espacios: hay productores que pintan cada palabra con su espacio
   (Chrome, Canva) y otros que saltan de palabra con un `Td` sin pintar el
   espacio. Dentro de cada bloque BT…ET, si alguna cadena ya trae espacios, los
   saltos horizontales no añaden ninguno; si no trae, sí. */
function textoDeContenido(s, fuentes, xobj) {
  let out = '', fuente = null, y = null;
  let bloque = [], hueco = false;
  const pila = [];
  const cerrar = () => {
    if (!bloque.length) { return; }
    const conEspacios = bloque.some(p => / /.test(p.t));
    out += bloque.map((p, k) => (k && p.salto ? '\n' : (k && p.hueco && !conEspacios ? ' ' : '')) + p.t).join('');
    bloque = [];
  };
  const salto = () => { cerrar(); if (out && !out.endsWith('\n')) { out += '\n'; } };
  const pinta = t => { if (t) { bloque.push({ t, hueco, salto: false }); hueco = false; } };
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '%') { while (i < s.length && s[i] !== '\n' && s[i] !== '\r') { i++; } continue; }
    if (c === '(') { const [b, j] = literal(s, i); pila.push({ str: b }); i = j; continue; }
    if (c === '<' && s[i + 1] === '<') {
      /* diccionario en línea (BDC, BI…): se salta entero */
      let prof = 0, j = i;
      for (; j < s.length - 1; j++) {
        if (s[j] === '<' && s[j + 1] === '<') { prof++; j++; }
        else if (s[j] === '>' && s[j + 1] === '>') { prof--; j++; if (prof === 0) { break; } }
      }
      pila.push({ dict: true }); i = j + 1; continue;
    }
    if (c === '<') {
      const z = s.indexOf('>', i);
      const h = s.slice(i + 1, z).replace(/\s+/g, '');
      pila.push({ str: [...Buffer.from(h.length % 2 ? h + '0' : h, 'hex')] });
      i = z + 1; continue;
    }
    if (c === '[') { pila.push('['); i++; continue; }
    if (c === ']') {
      const arr = [];
      while (pila.length && pila[pila.length - 1] !== '[') { arr.unshift(pila.pop()); }
      pila.pop();
      pila.push({ arr });
      i++; continue;
    }
    if (c === '/') {
      const m = /^\/[^\s/<>\[\]()%{}]*/.exec(s.slice(i, i + 128));
      pila.push({ name: m[0].slice(1) }); i += Math.max(1, m[0].length); continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    const m = /^[^\s/<>\[\]()%{}]+/.exec(s.slice(i, i + 64));
    if (!m) { i++; continue; }
    const tok = m[0];
    i += tok.length;
    if (/^[-+.\d]+$/.test(tok)) { pila.push(Number(tok)); continue; }
    if (tok === 'BI') {
      /* imagen en línea: sus datos binarios no son operadores */
      const z = s.indexOf('EI', s.indexOf('ID', i));
      i = z === -1 ? s.length : z + 2;
      pila.length = 0; continue;
    }
    switch (tok) {
      case 'Tf': { const nombre = pila[pila.length - 2]?.name; fuente = fuentes.get(nombre) || null; break; }
      case 'Tj': case "'": case '"': {
        if (tok !== 'Tj') { salto(); }
        const x = pila[pila.length - 1];
        if (x?.str) { pinta(decodificar(x.str, fuente)); }
        break;
      }
      case 'TJ': {
        const x = pila[pila.length - 1];
        for (const e of x?.arr || []) {
          if (e?.str) { pinta(decodificar(e.str, fuente)); }
          else if (typeof e === 'number' && e < -200) { hueco = true; }
        }
        break;
      }
      case 'Td': case 'TD': {
        const dy = pila[pila.length - 1];
        if (typeof dy === 'number' && Math.abs(dy) > 0.5) { salto(); } else { hueco = true; }
        break;
      }
      case 'Tm': {
        const ny = pila[pila.length - 1];
        if (typeof ny === 'number' && y !== null && Math.abs(ny - y) > 0.5) { salto(); } else { hueco = true; }
        if (typeof ny === 'number') { y = ny; }
        break;
      }
      case 'T*': salto(); break;
      case 'ET': cerrar(); hueco = true; break;
      case 'Do': {
        const nombre = pila[pila.length - 1]?.name;
        const t = nombre && xobj ? xobj(nombre) : '';
        if (t) { salto(); out += t; salto(); }
        break;
      }
      default: break;
    }
    pila.length = 0;
  }
  cerrar();
  return out;
}

/* --- Páginas ---------------------------------------------------------------------- */

function fuentesDe(res, objs, cache) {
  const fd = subdict(res, 'Font', objs) || '';
  const out = new Map();
  for (const m of fd.matchAll(/\/([^\s/<>\[\]()]+)\s+(\d+)\s+\d+\s+R/g)) {
    const idFuente = Number(m[2]);
    if (!cache.has(idFuente)) {
      const f = objs.get(idFuente);
      const tu = f ? ref(f.dict, 'ToUnicode') : null;
      const st = tu ? objs.get(tu)?.stream : null;
      cache.set(idFuente, st ? cmap(latin1(st)) : null);
    }
    out.set(m[1], cache.get(idFuente));
  }
  return out;
}

/* El texto de un contenido con sus recursos, entrando en los formularios
   (XObject /Form) que pinte. `vistos` corta los ciclos. */
function textoCon(contenido, res, objs, cache, vistos, prof = 0) {
  const xd = subdict(res, 'XObject', objs) || '';
  const xobj = nombre => {
    if (prof > 8) { return ''; }
    const m = new RegExp(`/${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)\\s+\\d+\\s+R`).exec(xd);
    const id = m ? Number(m[1]) : null;
    const o = id !== null ? objs.get(id) : null;
    if (!o || !o.stream || !/\/Subtype\s*\/Form/.test(o.dict) || vistos.has(id)) { return ''; }
    vistos.add(id);
    const r = subdict(o.dict, 'Resources', objs) ?? res;
    const t = textoCon(latin1(o.stream), r, objs, cache, vistos, prof + 1);
    vistos.delete(id);
    return t;
  };
  return textoDeContenido(contenido, fuentesDe(res, objs, cache), xobj);
}

function contenidos(dictPagina, objs) {
  const m = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(dictPagina);
  if (!m) { return ''; }
  const ids = [...m[1].matchAll(/(\d+)\s+\d+\s+R/g)].map(x => Number(x[1]));
  return ids.map(id => objs.get(id)?.stream).filter(Boolean).map(latin1).join('\n');
}

/* El dict de la página, con lo heredado del árbol (Resources) si no lo tiene */
function heredar(dict, objs) {
  if (/\/Resources/.test(dict)) { return dict; }
  let padre = ref(dict, 'Parent'), vueltas = 0;
  while (padre && vueltas++ < 20) {
    const p = objs.get(padre)?.dict || '';
    if (/\/Resources/.test(p)) { return dict + p.slice(p.indexOf('/Resources')); }
    padre = ref(p, 'Parent');
  }
  return dict;
}

/* Lo que devuelve: { paginas, texto, legible } — `legible` es la proporción de
   letras y números sobre lo que no es espacio. Por debajo de ~0,6 lo que ha
   salido es basura (fuentes sin ToUnicode) y no hay que fiarse de ello. */
export function textoDePdf(buf) {
  const pdf = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  if (latin1(pdf.subarray(0, 5)) !== '%PDF-') { throw new Error('No es un PDF'); }
  if (/\/Encrypt\s/.test(latin1(pdf.subarray(Math.max(0, pdf.length - 4096))))) {
    return { paginas: 0, texto: '', legible: 0, cifrado: true };
  }
  const objs = objetos(pdf);
  const cache = new Map();
  const paginas = [...objs.values()].filter(o => /\/Type\s*\/Page(?![a-zA-Z])/.test(o.dict));
  const trozos = paginas.map(p => {
    const d = heredar(p.dict, objs);
    return textoCon(contenidos(d, objs), subdict(d, 'Resources', objs) || '', objs, cache, new Set())
      .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n')
      /* Títulos con letras espaciadas («A C T I V I D A D E S»): tres o más
         letras sueltas seguidas son una palabra */
      .replace(/(?<![\p{L}\p{N}])(?:[\p{L}\p{N}] ){2,}[\p{L}\p{N}](?![\p{L}\p{N}])/gu, m => m.replace(/ /g, ''))
      .trim();
  });
  const texto = trozos.filter(Boolean).join('\n\n');
  const sinEspacio = texto.replace(/\s/g, '');
  const buenos = (sinEspacio.match(/[\p{L}\p{N}]/gu) || []).length;
  return { paginas: paginas.length, texto, legible: sinEspacio.length ? buenos / sinEspacio.length : 0 };
}
