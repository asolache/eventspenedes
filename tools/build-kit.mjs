/* =============================================================================
   Events Penedès — genera los textos del kit para agencias

   Los textos salen del catálogo (netlify/propuesta/catalogo.mjs), el mismo del
   que sale el borrador de propuesta: nadie los escribe dos veces. Van en marca
   blanca, así que se quita lo que delata quién lo hace: el nombre del
   proveedor después de « · » y cualquier frase con un enlace o con una marca.

   Escribe dos cosas:
   - en kit-agencias.html, lo que hay entre <!-- kit:inicio --> y <!-- kit:fin -->
   - js/lang-kit.js entero, con los textos en catalán e inglés

   Uso:  node tools/build-kit.mjs
   ========================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { opciones } from '../netlify/propuesta/catalogo.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGINA = join(RAIZ, 'kit-agencias.html');
const DICCIONARIO = join(RAIZ, 'js/lang-kit.js');

/* Qué va en el kit, en este orden. La producción integral y «a medida» no: son
   el trabajo de la agencia, no algo que revende. */
const KIT = ['fent-pinya', 'cata-vino-cava', 'cata-aceite', 'gincana-vinyes', 'reto-gastronomico',
             'outdoor', 'chef-autor', 'rrpp-protocolo', 'dj-sesion', 'microbus'];

/* Lo que delata la marca o el proveedor. Una frase que lo lleve se quita
   entera: recortar a medias deja textos cojos. */
const MARCA = /<a\s|https?:|www\.|\.(eu|com|cat|es)\b|TeamTowers|Events Penedès|D['’]Olici/i;

const blanca = texto => texto
  .split(/(?<=[.!?])\s+/)
  .filter(frase => !MARCA.test(frase))
  .join(' ')
  .trim();
const nombre = n => n.split(' · ')[0].trim();
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const elegidas = KIT.map(id => {
  const o = opciones.find(x => x.id === id);
  if (!o) { console.log(`✗ «${id}» no está en el catálogo`); process.exit(1); }
  return o;
});

/* Los textos fijos de la página en catalán e inglés. El castellano está en el
   HTML, como en el resto de páginas. */
const FIJOS = {
  ca: {
    'kit.crumb': 'Agències', 'kit.crumb2': 'Kit per a la teva proposta',
    'kit.eyebrow': 'Per a agències i DMC',
    'kit.title': 'Kit per a la teva proposta',
    'kit.lead': 'Textos i fotos per muntar la teva proposta amb la teva marca. Sense el nostre nom ni el dels proveïdors: copia’ls tal qual o canvia’ls al teu gust.',
    'kit.note': 'Aquí no hi ha preus. Les tarifes d’agència s’envien després de l’alta.',
    'kit.cta': 'Demanar les tarifes',
    'kit.t.eyebrow': 'Textos', 'kit.t.title': 'El que pots oferir',
    'kit.copiar': 'Copiar el text',
    'kit.f.eyebrow': 'Fotos', 'kit.f.title': 'Per a la proposta',
    'kit.f.lead': 'Obre-les i desa-les. Fes-les servir només en propostes als teus clients, no al teu web ni a xarxes.',
    'kit.f.1': 'Grup aixecant un castell', 'kit.f.2': 'Castell dins d’una sala',
    'kit.f.3': 'Celebració del grup', 'kit.f.4': 'Participant al capdamunt',
    'kit.f.5': 'Masia: porxo cobert i era', 'kit.f.6': 'Masia: jardí amb les vinyes al fons',
  },
  en: {
    'kit.crumb': 'Agencies', 'kit.crumb2': 'Kit for your proposal',
    'kit.eyebrow': 'For agencies and DMCs',
    'kit.title': 'Kit for your proposal',
    'kit.lead': 'Texts and photos to build your proposal under your own brand. Without our name or our suppliers’: copy them as they are or adapt them.',
    'kit.note': 'There are no prices here. Agency rates are sent after sign-up.',
    'kit.cta': 'Request the rates',
    'kit.t.eyebrow': 'Texts', 'kit.t.title': 'What you can offer',
    'kit.copiar': 'Copy the text',
    'kit.f.eyebrow': 'Photos', 'kit.f.title': 'For your proposal',
    'kit.f.lead': 'Open and save them. Use them only in proposals to your clients, not on your website or social media.',
    'kit.f.1': 'Group raising a human tower', 'kit.f.2': 'Human tower inside a hall',
    'kit.f.3': 'The group celebrating', 'kit.f.4': 'Participant at the top',
    'kit.f.5': 'Farmhouse: covered porch and threshing floor', 'kit.f.6': 'Farmhouse: garden with the vineyards behind',
  },
};

const META = {
  es: { title: 'Kit para agencias · Events Penedès',
        desc: 'Textos y fotos en marca blanca para agencias y DMC que trabajan con Events Penedès.',
        social: 'Textos y fotos en marca blanca para tu propuesta.', locale: 'es_ES' },
  ca: { title: 'Kit per a agències · Events Penedès',
        desc: 'Textos i fotos en marca blanca per a agències i DMC que treballen amb Events Penedès.',
        social: 'Textos i fotos en marca blanca per a la teva proposta.', locale: 'ca_ES' },
  en: { title: 'Agency kit · Events Penedès',
        desc: 'White-label texts and photos for agencies and DMCs working with Events Penedès.',
        social: 'White-label texts and photos for your proposal.', locale: 'en_GB' },
};

/* 1 · Las tarjetas, en castellano, dentro de la página */
const tarjetas = elegidas.map(o => [
  '        <article class="card">',
  `          <h3 data-i18n="kit.o.${o.id}.n">${esc(nombre(o.nombre.es))}</h3>`,
  `          <p class="kit__texto" data-i18n="kit.o.${o.id}.d">${esc(blanca(o.describe.es))}</p>`,
  '          <p class="card__more"><button class="btn btn--ghost js-copiar" type="button" data-i18n="kit.copiar">Copiar el texto</button></p>',
  '        </article>',
].join('\n'));

const html = readFileSync(PAGINA, 'utf8');
const re = /(<!-- kit:inicio -->\n)[\s\S]*?(<!-- kit:fin -->)/;
if (!re.test(html)) { console.log('✗ kit-agencias.html no tiene las marcas kit:inicio / kit:fin'); process.exit(1); }
writeFileSync(PAGINA, html.replace(re, (_, a, b) => `${a}${tarjetas.join('\n')}\n${b}`));

/* 2 · El diccionario: lo común de la cabecera y el pie sale del de agencias */
const window = {};
new Function('window', readFileSync(join(RAIZ, 'js/lang-agencias.js'), 'utf8'))(window);
const q = s => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const bloque = idioma => {
  const comunes = Object.entries(window.EP_I18N[idioma]).filter(([k]) => !k.startsWith('ag.'));
  const catalogo = elegidas.flatMap(o => [
    [`kit.o.${o.id}.n`, nombre(o.nombre[idioma] || o.nombre.es)],
    [`kit.o.${o.id}.d`, blanca(o.describe[idioma] || o.describe.es)],
  ]);
  return [...comunes, ...Object.entries(FIJOS[idioma]), ...catalogo]
    .map(([k, v]) => `    ${q(k)}: ${q(v)}`).join(',\n');
};
writeFileSync(DICCIONARIO, `/* =============================================================================
   GENERADO por tools/build-kit.mjs · no editar aquí.
   Textos del kit para agencias en catalán e inglés: los del catálogo, en marca
   blanca, y los fijos de la página.
   ========================================================================== */
window.EP_I18N = {

  ca: {
${bloque('ca')}
  },

  en: {
${bloque('en')}
  }
};

window.EP_META = ${JSON.stringify(META, null, 2)};
`);

/* 3 · La guarda: un nombre con marca no se recorta solo, así que falla aquí
   y no en la propuesta de una agencia */
const fuga = elegidas.flatMap(o => ['es', 'ca', 'en'].map(i => nombre(o.nombre[i] || ''))).find(t => MARCA.test(t));
if (fuga) { console.log(`✗ El kit lleva una marca en un nombre: «${fuga}»`); process.exit(1); }
console.log(`✓ kit-agencias.html: ${elegidas.length} textos en marca blanca, en tres idiomas`);
