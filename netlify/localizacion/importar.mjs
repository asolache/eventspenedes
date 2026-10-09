/* =============================================================================
   Events Penedès · del catálogo de un espacio a su ficha

   Un espacio nos da su web o su catálogo en PDF y esto devuelve los campos de
   la ficha de /alta-localizacion que se pueden sacar de ahí, cada uno con la
   frase de la que sale. El espacio los revisa en el formulario antes de
   enviar: nada de lo que sale de aquí llega a Zoho ni a la web sin que una
   persona lo haya visto.

   Dos caminos, y los dos acaban en `validar()`, que es la lista blanca:

     claude   si hay ANTHROPIC_API_KEY. Lee el PDF entero (texto, tablas y
              maquetación) y las páginas de la web, y devuelve campo, valor y
              cita. Es el bueno: un catálogo dice «La Cava · 400 m² · imperial
              50» y eso solo lo entiende quien lee.
     reglas   sin clave, o si Claude falla. Datos estructurados de la web
              (schema.org, metas, enlaces tel:) y frases con forma fija
              («hasta 120 personas en banquete»). Saca menos, pero lo que saca
              es literal.

   Lo que nunca hace: rellenar lo que la fuente no dice. Un aforo inventado
   acaba en una propuesta. Tampoco toca los campos que decide el espacio
   (autorización de publicar, permiso de las fotos) ni los nuestros (relación,
   notas de visita).

   Leer webs ajenas desde un servidor es abrir una puerta: `urlSegura()` solo
   deja salir a direcciones públicas por http(s), comprueba cada redirección y
   corta por tamaño y por tiempo.
   ========================================================================== */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { SECCIONES, SALAS, camposSala, salaCampo } from './esquema.mjs';
import { textoDePdf } from './pdf-texto.mjs';

export const LIMITES = {
  html: 3 * 1024 * 1024,         // una página web
  pdf: 60 * 1024 * 1024,         // un catálogo descargado
  pdfEnLinea: 20 * 1024 * 1024,  // por encima, a Claude por la API de ficheros
  paginas: 3,                    // páginas de la misma web además de la primera
  pdfs: 2,                       // catálogos enlazados desde la web
  texto: 150000,                 // caracteres de texto por fuente
  espera: 12000,                 // ms por descarga
  esperaClaude: 42000,           // ms: la función entera tiene 60 s
};

/* Lo que no se importa nunca: lo decide el espacio o lo escribimos nosotros */
const NO_IMPORTA = new Set(['autoriza', 'fotos_permiso', 'relacion', 'publicar', 'visita_fecha', 'visita_notas', 'pendiente']);

/* --- El esquema como lista de campos importables ------------------------------ */

export function definiciones() {
  const m = new Map();
  for (const s of SECCIONES) {
    if (s.si) { m.set(s.si, { t: 'check', l: s.interruptor, sec: s.titulo }); }
    if (s.salas) {
      for (let i = 1; i <= SALAS; i++) {
        for (const c of camposSala) { m.set(salaCampo(i, c.n), { ...c, l: `Sala ${i} · ${c.l}`, sec: s.titulo }); }
      }
      continue;
    }
    for (const c of s.campos) {
      const interno = Boolean(s.interno || c.interno);
      if (c.t === 'checks') {
        for (const [k, t] of Object.entries(c.op)) { m.set(`${c.n}_${k}`, { t: 'check', l: `${c.l}: ${t}`, interno, sec: s.titulo }); }
      } else {
        m.set(c.n, { ...c, interno, sec: s.titulo });
      }
    }
  }
  for (const n of [...m.keys()]) { if (m.get(n).interno || NO_IMPORTA.has(n)) { m.delete(n); } }
  return m;
}

/* --- Validar: la lista blanca por la que pasa todo ----------------------------- */

const numero = (v, decimales) => {
  let s = String(v ?? '').trim().replace(/\s|€|eur(os)?|m2|m²/gi, '');
  if (!s) { return null; }
  /* 1.500,50 (castellano) · 1,500.50 (inglés) · 1500 */
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) { s = s.replace(/\./g, '').replace(',', '.'); }
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) { s = s.replace(/,/g, ''); }
  else { s = s.replace(',', '.'); }
  if (!/^\d+(\.\d+)?$/.test(s)) { return null; }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) { return null; }
  if (!decimales && !Number.isInteger(n)) { return null; }
  return String(decimales ? Math.round(n * 100) / 100 : n);
};

const sino = v => {
  const s = String(v ?? '').trim().toLowerCase();
  if (['si', 'sí', 'yes', 'true', '1', 'sí.'].includes(s)) { return 'si'; }
  if (['no', 'false', '0'].includes(s)) { return 'no'; }
  return null;
};

function normalizar(def, v) {
  if (v === null || v === undefined) { return null; }
  const s = String(v).trim();
  if (!s) { return null; }
  switch (def.t) {
    case 'number': { const n = numero(s, false); return n !== null && Number(n) <= 100000 ? n : null; }
    case 'eur': { const n = numero(s, true); return n !== null && Number(n) <= 1000000 ? n : null; }
    case 'sino': return sino(s);
    case 'check': return sino(s) === 'si' ? 'si' : null;
    case 'select': {
      if (s in def.op) { return s; }
      const k = Object.entries(def.op).find(([, t]) => t.toLowerCase() === s.toLowerCase());
      return k ? k[0] : null;
    }
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.slice(0, 300) : null;
    case 'url': return /^https?:\/\/[^\s]+$/i.test(s) ? s.slice(0, 300) : null;
    case 'tel': return /^[+\d][\d\s().-]{5,24}$/.test(s) ? s : null;
    case 'textarea': return s.slice(0, 2000);
    case 'date': return null;
    default: return s.slice(0, 300);
  }
}

/* `lista` es [{ campo, valor, cita }]. Devuelve lo que entra y por qué no
   entra lo demás. El primero que da valor a un campo se queda con él. */
export function validar(lista) {
  const defs = definiciones();
  const datos = {}, origen = {}, descartes = [];
  for (const x of lista || []) {
    const def = defs.get(x?.campo);
    if (!def) { descartes.push({ campo: x?.campo, motivo: 'no es un campo importable' }); continue; }
    const v = normalizar(def, x.valor);
    if (v === null) { descartes.push({ campo: x.campo, motivo: `valor «${String(x.valor).slice(0, 60)}» no válido` }); continue; }
    if (x.campo in datos) { continue; }
    datos[x.campo] = v;
    origen[x.campo] = String(x.cita || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  }
  /* Un bloque que solo se ve con su interruptor: si hay datos, se marca */
  for (const s of SECCIONES) {
    if (s.si && !datos[s.si] && s.campos.some(c => Object.keys(datos).some(n => n === c.n || n.startsWith(`${c.n}_`)))) {
      datos[s.si] = 'si';
      origen[s.si] = 'Hay datos de este bloque';
    }
  }
  return { datos, origen, descartes };
}

/* --- Salir a internet sin abrir la red interna ------------------------------------ */

function ipPrivada(ip) {
  if (isIP(ip) === 6) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::' || /^f[cd]/.test(s) || /^fe[89ab]/.test(s)) { return true; }
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
    return m ? ipPrivada(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19));
}

export async function urlSegura(texto, lookup = dnsLookup) {
  let u;
  try { u = new URL(String(texto).trim()); } catch { throw new Error('La dirección no es válida'); }
  if (!/^https?:$/.test(u.protocol)) { throw new Error('Solo direcciones http o https'); }
  if (u.username || u.password) { throw new Error('La dirección no puede llevar usuario ni contraseña'); }
  if (u.port && !['80', '443'].includes(u.port)) { throw new Error('Puerto no permitido'); }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host.includes('.') || /\.(local|internal|localhost)$/i.test(host) || host === 'localhost') { throw new Error('Dirección no pública'); }
  const ips = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!ips.length) { throw new Error(`No se encuentra ${host}`); }
  if (ips.some(x => ipPrivada(x.address))) { throw new Error('Dirección no pública'); }
  return u;
}

/* Los enlaces de compartir de Drive y Dropbox no son el fichero */
export function directa(texto) {
  const s = String(texto).trim();
  const drive = /^https:\/\/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:[^#]*&)?id=)([\w-]{10,})/.exec(s);
  if (drive) { return `https://drive.google.com/uc?export=download&id=${drive[1]}`; }
  if (/^https:\/\/(www\.)?dropbox\.com\//.test(s)) {
    const u = new URL(s);
    u.searchParams.set('dl', '1');
    return u.toString();
  }
  return s;
}

async function leerCuerpo(r, max) {
  const largo = Number(r.headers.get('content-length') || 0);
  if (largo > max) { throw new Error(`pesa ${Math.round(largo / 1048576)} MB (máximo ${Math.round(max / 1048576)})`); }
  if (!r.body) { return Buffer.from(await r.arrayBuffer()); }
  const trozos = [];
  let total = 0;
  for await (const t of r.body) {
    total += t.length;
    if (total > max) { throw new Error(`pesa más de ${Math.round(max / 1048576)} MB`); }
    trozos.push(Buffer.from(t));
  }
  return Buffer.concat(trozos);
}

/* Descarga con las redirecciones comprobadas una a una */
export async function traer(direccion, { fetch = globalThis.fetch, lookup, max = LIMITES.html } = {}) {
  let u = await urlSegura(directa(direccion), lookup);
  for (let saltos = 0; saltos < 5; saltos++) {
    const r = await fetch(u.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(LIMITES.espera),
      headers: { 'user-agent': 'EventsPenedesFicha/1.0 (+https://eventspenedes.com/alta-localizacion)', accept: 'text/html,application/pdf;q=0.9,*/*;q=0.5' },
    });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      u = await urlSegura(new URL(r.headers.get('location'), u).toString(), lookup);
      continue;
    }
    if (!r.ok) { throw new Error(`responde ${r.status}`); }
    const cuerpo = await leerCuerpo(r, max);
    const tipo = (r.headers.get('content-type') || '').toLowerCase();
    const esPdf = tipo.includes('application/pdf') || cuerpo.subarray(0, 5).toString('latin1') === '%PDF-';
    return { url: u.toString(), tipo: esPdf ? 'pdf' : 'html', cuerpo };
  }
  throw new Error('demasiadas redirecciones');
}

/* --- Leer una página web ------------------------------------------------------------ */

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', euro: '€', ordm: 'º', ordf: 'ª', ntilde: 'ñ', Ntilde: 'Ñ', ccedil: 'ç', Ccedil: 'Ç', laquo: '«', raquo: '»', sup2: '²' };
export function entidades(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([aeiou])(acute|grave|uml);/gi, (_, l, t) => l.normalize('NFD') + { acute: '́', grave: '̀', uml: '̈' }[t.toLowerCase()])
    .normalize('NFC')
    .replace(/&(\w+);/g, (m, n) => ENTIDADES[n] ?? m);
}

export function leerHtml(html, base) {
  const h = String(html);
  const jsonld = [];
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim());
      const plano = x => (Array.isArray(x) ? x.flatMap(plano) : x && typeof x === 'object' ? [x, ...plano(x['@graph'] || [])] : []);
      jsonld.push(...plano(j));
    } catch { /* JSON-LD roto: se ignora */ }
  }
  const metas = {};
  for (const m of h.matchAll(/<meta\b[^>]*>/gi)) {
    const nombre = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1]?.toLowerCase();
    const valor = /content\s*=\s*["']([^"']*)["']/i.exec(m[0])?.[1];
    if (nombre && valor && !(nombre in metas)) { metas[nombre] = entidades(valor).trim(); }
  }
  const titulo = entidades(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] || '').replace(/\s+/g, ' ').trim();
  const enlaces = [];
  for (const m of h.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const texto = entidades(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    let href = entidades(m[1]).trim();
    if (/^(tel|mailto):/i.test(href)) { enlaces.push({ href, texto }); continue; }
    try { href = new URL(href, base).toString(); } catch { continue; }
    enlaces.push({ href, texto });
  }
  const texto = entidades(h
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr|\/section|\/article|\/header|\/footer)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t ]+/g, ' ').replace(/ *\n[ \n]*/g, '\n').trim();
  return { titulo, metas, jsonld, enlaces, texto };
}

/* Las páginas de la misma web y los PDF que vale la pena leer además de la
   portada: los de eventos, empresa, espacios, catálogo o tarifas. */
const INTERES = /event|empres|mice|espai|espac|space|sala|boda|casament|wedding|celebra|grup|group|dossier|catal[oòó]g|tarif|preu|preci|price|visit|enotur|winetour|activ|experi/i;
export function candidatos(enlaces, base) {
  const host = new URL(base).hostname.replace(/^www\./, '');
  const pdfs = [], paginas = [];
  for (const e of enlaces) {
    if (!/^https?:/i.test(e.href)) { continue; }
    const u = new URL(e.href);
    u.hash = '';
    const s = u.toString();
    if (/\.pdf($|\?)/i.test(u.pathname + u.search) || /drive\.google\.com\/file|dropbox\.com\/.*\.pdf/i.test(s)) {
      if (!pdfs.includes(s)) { pdfs.push(s); }
      continue;
    }
    if (u.hostname.replace(/^www\./, '') !== host || s === base) { continue; }
    if (/\.(jpe?g|png|gif|webp|svg|zip|mp4|docx?|xlsx?)$/i.test(u.pathname)) { continue; }
    if (INTERES.test(u.pathname + ' ' + e.texto) && !paginas.includes(s)) { paginas.push(s); }
  }
  const pesa = s => (/dossier|catal|tarif|event|mice|empres/i.test(s) ? 0 : 1);
  return {
    pdfs: pdfs.sort((a, b) => pesa(a) - pesa(b)).slice(0, LIMITES.pdfs),
    paginas: paginas.sort((a, b) => pesa(a) - pesa(b)).slice(0, LIMITES.paginas),
  };
}

/* --- Reglas: lo que se saca sin leer como una persona --------------------------------- */

const TIPO_SCHEMA = {
  winery: 'bodega', vineyard: 'bodega', hotel: 'hotel', resort: 'hotel', motel: 'hotel',
  bedandbreakfast: 'casa-rural', lodgingbusiness: 'casa-rural', vacationrental: 'casa-rural',
  restaurant: 'restaurante', foodestablishment: 'restaurante', campground: 'natural', park: 'natural',
  landmarksorhistoricalbuildings: 'singular', museum: 'singular',
};

const cita = (texto, i, largo) => texto.slice(Math.max(0, i - 60), i + largo + 60).replace(/\s+/g, ' ').trim();

/* Frase → campo. Solo frases que dicen lo que dicen: «wifi» es wifi. */
const PALABRAS = [
  [/\bwi-?fi\b/i, 'equipo_wifi'],
  [/\bproyector|\bprojector\b/i, 'equipo_proyector'],
  [/\bmegafon[ií]a|equip(o|ament)? de so(nido)?\b|sound system/i, 'equipo_sonido'],
  [/micr[oó]fono|micr[oò]fon|microphone/i, 'equipo_micros'],
  [/silla de ruedas|movilidad reducida|cadira de rodes|mobilitat redu[iï]da|\bPMR\b|wheelchair/i, 'pmr', 'si'],
  [/\bpiscina\b|swimming pool/i, 'extras_piscina'],
  [/\bspa\b/i, 'extras_spa'],
  [/visita (guiada )?(a |al |por )?(la |el )?(bodega|celler|cava|cavas|caves)|winery tour|visita al celler/i, 'cata_tipos_visita'],
  [/cata de vinos|tast de vins|wine tasting|degustaci[oó]n de vinos/i, 'cata_tipos_vinos'],
  [/cata de cavas?|tast de caves?|cava tasting/i, 'cata_tipos_cavas'],
  [/maridaje|maridatge|pairing/i, 'cata_tipos_maridaje'],
  [/vendimia|verema|harvest/i, 'cata_tipos_vendimia'],
  [/ensamblaje|assemblatge|blending/i, 'cata_tipos_ensamblaje'],
  [/\bbodas?\b|\bcasaments?\b|\bweddings?\b/i, 'eventos_boda'],
  [/team ?building/i, 'eventos_teambuilding'],
  [/convenci[oó]n|congres[oa]s?|jornadas? de empresa|convention/i, 'eventos_convencion'],
  [/cenas? de gala|sopars? de gala|gala dinners?/i, 'eventos_gala'],
  [/cal[cç]otad/i, 'eventos_calcotada'],
  [/\brodajes?\b|\brodatges?\b|film shooting|photo shoot/i, 'eventos_rodaje'],
  [/\bincentivos?\b|\bincentius?\b|\bincentive/i, 'eventos_incentivo'],
  [/(comidas?|cenas?) de empresa|[aà]pats? d'empresa|company dinner/i, 'eventos_comida'],
];

const AFORO = /(?:hasta|capacidad(?: m[aá]xima)?(?: de| para)?|aforo(?: m[aá]ximo)?(?: de)?|m[aá]ximo(?: de)?|fins a|capacitat(?: m[àa]xima)?(?: de| per a)?|up to|capacity(?: of| for)?)\s*:?\s*(\d{2,4})\s*(?:personas|pax|comensales|invitados|persones|convidats|people|guests)/gi;
const FORMATO = [
  ['aforo_coctel', /c[oó]ctel|c[oò]ctel|de pie|dempeus|cocktail|standing/i],
  ['aforo_banquete', /banquete|sentad|a mesa|assegut|banquet|seated|dinner/i],
  ['aforo_teatro', /teatro|teatre|theat(er|re)/i],
];

export function reglas({ url, paginas = [], textos = [] }) {
  const out = [];
  const pon = (campo, valor, c) => out.push({ campo, valor, cita: c });
  /* 1 · schema.org: lo que la web declara de sí misma */
  for (const p of paginas) {
    for (const j of p.jsonld) {
      const tipos = [].concat(j['@type'] || []).map(t => String(t).toLowerCase());
      if (!tipos.some(t => t in TIPO_SCHEMA || /business|organization|place|establishment/.test(t))) { continue; }
      const t = tipos.find(x => x in TIPO_SCHEMA);
      const c = `schema.org ${[].concat(j['@type']).join('/')}`;
      if (j.name) { pon('nombre', j.name, `${c}: name`); }
      if (t) { pon('tipo', TIPO_SCHEMA[t], `${c}`); }
      if (j.telephone) { pon('telefono', [].concat(j.telephone)[0], `${c}: telephone`); }
      const a = [].concat(j.address || [])[0];
      if (a && typeof a === 'object') {
        if (a.streetAddress) { pon('direccion', a.streetAddress, `${c}: streetAddress`); }
        if (a.addressLocality) { pon('poblacion', a.addressLocality, `${c}: addressLocality`); }
        if (a.postalCode) { pon('cp', a.postalCode, `${c}: postalCode`); }
      }
      if (j.description) { pon('descripcion', j.description, `${c}: description`); }
    }
    if (p.metas['og:site_name']) { pon('nombre', p.metas['og:site_name'], 'og:site_name'); }
    const desc = p.metas['og:description'] || p.metas.description;
    if (desc && desc.length > 60) { pon('descripcion', desc, 'meta description'); }
    for (const e of p.enlaces) {
      if (/^tel:/i.test(e.href)) { pon('telefono', decodeURIComponent(e.href.slice(4)).replace(/[^\d+]/g, ' ').trim(), `enlace ${e.href}`); }
    }
  }
  if (url) { pon('web', new URL(url).origin + '/', 'la web que nos han dado'); }
  /* 2 · frases con forma fija, en el texto de la web y del catálogo */
  for (const { texto, de } of textos) {
    const cp = /\b((?:0[1-9]|[1-4]\d|5[0-2])\d{3})\s+([A-ZÀ-Ý][\p{L}'’.-]+(?:\s+(?:d[e'’]l?|i|la|les|del|de)?\s*[A-ZÀ-Ý][\p{L}'’.-]+){0,3})/u.exec(texto);
    if (cp) {
      pon('cp', cp[1], `${de}: «${cita(texto, cp.index, cp[0].length)}»`);
      pon('poblacion', cp[2].replace(/[,.]$/, ''), `${de}: «${cita(texto, cp.index, cp[0].length)}»`);
    }
    const tel = /(?:\+34[\s.]?)?\b9\d(?:[\s.]?\d){7}\b/.exec(texto);
    if (tel && tel[0].replace(/\D/g, '').length >= 9) { pon('telefono', tel[0].trim(), `${de}: «${cita(texto, tel.index, tel[0].length)}»`); }
    const aforos = {};
    for (const m of texto.matchAll(AFORO)) {
      const contexto = texto.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80);
      const f = FORMATO.find(([, re]) => re.test(contexto));
      if (!f) { continue; }
      const n = Number(m[1]);
      if (!aforos[f[0]] || n > aforos[f[0]].n) { aforos[f[0]] = { n, c: `${de}: «${cita(texto, m.index, m[0].length)}»` }; }
    }
    for (const [campo, { n, c }] of Object.entries(aforos)) { pon(campo, n, c); }
    const hab = /\b(\d{1,3})\s+(?:habitaciones|habitacions|rooms)\b/i.exec(texto);
    if (hab) { pon('habitaciones', hab[1], `${de}: «${cita(texto, hab.index, hab[0].length)}»`); }
    const park = /\b(\d{1,4})\s+plazas de (?:parking|aparcamiento)|(?:parking|aparcament) (?:per a|de|para) (\d{1,4}) (?:cotxes|coches|vehículos|vehicles|plazas|places)/i.exec(texto);
    if (park) { pon('parking', park[1] || park[2], `${de}: «${cita(texto, park.index, park[0].length)}»`); }
    const com = /comisi[oó]n(?: para agencias)?(?: del?| de un)?\s*:?\s*(\d{1,2}(?:[.,]\d)?)\s?%|(\d{1,2}(?:[.,]\d)?)\s?% de comisi[oó]n|comissi[oó](?: del?)?\s*(\d{1,2})\s?%/i.exec(texto);
    if (com) { pon('comision', (com[1] || com[2] || com[3]).replace(',', '.'), `${de}: «${cita(texto, com.index, com[0].length)}»`); }
    for (const [re, campo, valor = 'si'] of PALABRAS) {
      const m = re.exec(texto);
      if (m) { pon(campo, valor, `${de}: «${cita(texto, m.index, m[0].length)}»`); }
    }
  }
  return out;
}

/* --- Claude: leer el catálogo como lo leería una persona ------------------------------ */

function guiaDeCampos() {
  const l = [];
  let sec = '';
  for (const [n, d] of definiciones()) {
    if (d.sec !== sec) { sec = d.sec; l.push(`\n## ${sec}`); }
    let tipo = { number: 'número entero', eur: 'importe en euros sin IVA salvo que la fuente diga lo contrario', sino: '"si" o "no"', check: '"si" si la fuente lo dice', textarea: 'texto', text: 'texto corto', tel: 'teléfono', email: 'correo', url: 'dirección web' }[d.t] || d.t;
    if (d.t === 'select') { tipo = 'uno de: ' + Object.entries(d.op).map(([k, t]) => `"${k}" (${t})`).join(', '); }
    l.push(`- ${n}: ${d.l} — ${tipo}${d.hint ? `. ${d.hint}` : ''}`);
  }
  return l.join('\n');
}

const INSTRUCCIONES = `Eres quien prepara la ficha de un espacio para eventos de empresa (bodega, finca, hotel, restaurante…) en el Penedès para Events Penedès, una agencia local. Te damos el catálogo del espacio y/o su web. Devuelve los campos de la ficha que las fuentes dicen, cada uno con la frase literal de la que sale.

Reglas, por orden de importancia:
1. Solo lo que las fuentes dicen. Si un dato no aparece, no lo pongas: un dato inventado acaba en un presupuesto a un cliente. No deduzcas aforos de los m², ni precios de otros precios, ni el tipo de espacio de una foto.
2. "cita" es el fragmento literal (máximo 200 caracteres) del que sale el valor, con la página del PDF si la sabes ("p. 18: …").
3. Las salas: una por sala, porche, terraza o jardín que el catálogo describa con nombre, en el orden del catálogo (sala1_*, sala2_*… hasta ${SALAS}). Aforo por formato solo si el catálogo lo da por formato. Si dice "imperial 25", eso es la disposición de la mesa: va en sala*_notas, no en banquete, salvo que diga cuántos comensales caben sentados.
4. Precios: tal cual el catálogo, en euros, sin IVA salvo que diga que lo lleva (entonces iva_incluido = "si"). Los paquetes (taller_* sin exclusiva, excl_* con exclusiva del espacio entero) y extras (extra1..6) solo si el catálogo los ofrece así. El precio de alquiler de una sala va en sala*_precio_media o sala*_precio_dia.
5. Comisiones para agencias: si el catálogo las da, ponlas donde tocan. "comision" es la general; taller_comision, excl_comision y extra*_comision, las de cada paquete y extra. Si dice que algo no es comisionable ("sin comisión en espacios"), eso es 0 para ese paquete o extra, con su cita. Si no dice nada, no pongas nada.
6. "descripcion" es el párrafo que hace único el espacio, en castellano, con las palabras del catálogo: historia, paisaje, quién lo lleva. Máximo 600 caracteres.
7. Los textos (notas, qué incluye) en castellano y breves, aunque la fuente esté en catalán o inglés. Los nombres propios, tal cual.
8. Las casillas ("si") solo cuando la fuente lo dice expresamente.
9. En "avisos", en una frase cada uno, lo que una persona debería revisar: contradicciones entre fuentes, precios que dependen de temporada, datos que parecen antiguos.

Campos de la ficha (nombre: qué es — formato):
`;

/* Sube un PDF grande a la API de ficheros: así no viaja entero en la petición */
async function subirFichero(buf, nombre, { apiKey, fetch }) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: 'application/pdf' }), nombre || 'catalogo.pdf');
  const r = await fetch('https://api.anthropic.com/v1/files', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: fd,
    signal: AbortSignal.timeout(LIMITES.espera * 2),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.id) { throw new Error(`no se pudo subir el PDF (${r.status} ${j.error?.message || ''})`); }
  return j.id;
}

/* `pdfs` son [{ nombre, cuerpo: Buffer }]; `textos`, [{ de, texto }] */
export async function conClaude({ pdfs = [], textos = [], apiKey, model, fetch = globalThis.fetch }) {
  const nombres = [...definiciones().keys()];
  const subidos = [];
  try {
    const contenido = [];
    for (const p of pdfs) {
      if (p.cuerpo.length > LIMITES.pdfEnLinea) {
        const id = await subirFichero(p.cuerpo, p.nombre, { apiKey, fetch });
        subidos.push(id);
        contenido.push({ type: 'document', source: { type: 'file', file_id: id }, title: p.nombre });
      } else {
        contenido.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: p.cuerpo.toString('base64') }, title: p.nombre });
      }
    }
    for (const t of textos) {
      contenido.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: t.texto }, title: t.de });
    }
    contenido.push({ type: 'text', text: 'Rellena la ficha con lo que dicen estas fuentes.' });
    const cuerpo = {
      model: model || 'claude-opus-5-5',
      max_tokens: 16000,
      system: INSTRUCCIONES + guiaDeCampos(),
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              campos: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { campo: { type: 'string', enum: nombres }, valor: { type: 'string' }, cita: { type: 'string' } },
                  required: ['campo', 'valor', 'cita'],
                  additionalProperties: false,
                },
              },
              avisos: { type: 'array', items: { type: 'string' } },
            },
            required: ['campos', 'avisos'],
            additionalProperties: false,
          },
        },
      },
      fallbacks: 'default',
      messages: [{ role: 'user', content: contenido }],
    };
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(LIMITES.esperaClaude),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { throw new Error(`Claude ${r.status}: ${j.error?.message || 'sin detalle'}`); }
    if (j.stop_reason === 'refusal') { throw new Error('Claude no ha querido leer estas fuentes'); }
    if (j.stop_reason === 'max_tokens') { throw new Error('el catálogo da para más de lo que cabe en una respuesta'); }
    const texto = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const salida = JSON.parse(texto);
    return { lista: Array.isArray(salida.campos) ? salida.campos : [], avisos: Array.isArray(salida.avisos) ? salida.avisos.map(String) : [] };
  } finally {
    for (const id of subidos) {
      fetch(`https://api.anthropic.com/v1/files/${id}`, {
        method: 'DELETE', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      }).catch(() => {});
    }
  }
}

/* --- Todo junto ---------------------------------------------------------------------- */

/* Entradas: `url` (web, PDF, Drive o Dropbox) y/o `pdf` (Buffer subido).
   Salida: { datos, origen, fuentes, metodo, avisos }. */
export async function importar({ url, pdf, nombrePdf, apiKey, model, fetch = globalThis.fetch, lookup } = {}) {
  if (!url && !pdf) { throw new Error('Falta la web o el PDF'); }
  const avisos = [], fuentes = [];
  const paginas = [], textos = [], pdfs = [];

  const anadirPdf = (cuerpo, nombre) => {
    pdfs.push({ cuerpo, nombre });
    fuentes.push(nombre);
    try {
      const t = textoDePdf(cuerpo);
      if (t.cifrado) { avisos.push(`${nombre}: el PDF está protegido`); }
      else if (t.legible >= 0.6 && t.texto.length > 200) { textos.push({ de: nombre, texto: t.texto.slice(0, LIMITES.texto), pdf: true }); }
      else { avisos.push(`${nombre}: el PDF no tiene texto que se pueda leer sin Claude (¿escaneado?)`); }
    } catch (e) { avisos.push(`${nombre}: ${e.message}`); }
  };

  if (pdf) { anadirPdf(pdf, nombrePdf || 'catálogo subido'); }
  let base = null;
  if (url) {
    const primera = await traer(url, { fetch, lookup, max: LIMITES.pdf });
    base = primera.url;
    if (primera.tipo === 'pdf') {
      anadirPdf(primera.cuerpo, decodeURIComponent(new URL(primera.url).pathname.split('/').pop() || 'catálogo.pdf'));
    } else {
      const p = leerHtml(primera.cuerpo.toString('utf8'), primera.url);
      paginas.push(p);
      textos.push({ de: primera.url, texto: p.texto.slice(0, LIMITES.texto) });
      fuentes.push(primera.url);
      const { pdfs: enlazados, paginas: mas } = candidatos(p.enlaces, primera.url);
      const extra = await Promise.allSettled([
        ...mas.map(u => traer(u, { fetch, lookup, max: LIMITES.html })),
        ...enlazados.map(u => traer(u, { fetch, lookup, max: LIMITES.pdf })),
      ]);
      extra.forEach((r, i) => {
        const u = [...mas, ...enlazados][i];
        if (r.status !== 'fulfilled') { avisos.push(`${u}: ${r.reason?.message || 'no se pudo leer'}`); return; }
        if (r.value.tipo === 'pdf') { anadirPdf(r.value.cuerpo, decodeURIComponent(new URL(r.value.url).pathname.split('/').pop())); return; }
        const q = leerHtml(r.value.cuerpo.toString('utf8'), r.value.url);
        paginas.push(q);
        textos.push({ de: r.value.url, texto: q.texto.slice(0, LIMITES.texto) });
        fuentes.push(r.value.url);
      });
    }
  }

  let metodo = 'reglas', lista = null;
  if (apiKey) {
    try {
      /* A Claude, los PDF enteros (ve tablas y maquetación) y el texto de las páginas */
      const r = await conClaude({ pdfs, textos: textos.filter(t => !t.pdf), apiKey, model, fetch });
      lista = r.lista;
      avisos.push(...r.avisos);
      metodo = 'claude';
    } catch (e) {
      avisos.push(`Lectura completa no disponible (${e.message}): solo lo que se saca con reglas fijas.`);
    }
  }
  if (!lista) { lista = reglas({ url: base && paginas.length ? base : null, paginas, textos }); }
  else if (base && paginas.length) { lista.push({ campo: 'web', valor: new URL(base).origin + '/', cita: 'la web que nos han dado' }); }
  const { datos, origen, descartes } = validar(lista);
  if (descartes.length) { console.log(`importar: ${descartes.length} valores descartados`); }
  return { datos, origen, fuentes, metodo, avisos };
}
