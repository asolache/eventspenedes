/* =============================================================================
   Events Penedès · la IA del portal

   «Mejorar mi descripción»: Claude escribe el párrafo con el que presentamos
   a un partner a sus clientes, a partir de lo que su ficha deja publicar
   (`fichaPublica()`), así que nunca ve precios, contactos ni condiciones y no
   los puede poner. Devuelve una propuesta: el partner la acepta y pasa a ser
   un cambio de ficha como cualquier otro, que revisamos antes de publicar.
   ========================================================================== */
import { FICHAS } from '../ficha/fichas.mjs';
import { fichaPublica } from '../ficha/publica.mjs';
import { mensaje, textoDe, MODELO } from '../ia/claude.mjs';

const ESQUEMA = {
  type: 'object',
  properties: {
    descripcion: { type: 'string' },
    falta: { type: 'array', items: { type: 'string' } },
  },
  required: ['descripcion', 'falta'],
  additionalProperties: false,
};

const GUIA = `Escribes en castellano el párrafo con el que Events Penedès, una agencia local de eventos de empresa en el Penedès, presenta a uno de sus espacios o proveedores a un cliente. Es lo primero que se lee en su página.

- Entre 350 y 600 caracteres, en tercera persona, sin títulos ni listas.
- Solo lo que dicen los datos. Si un dato no está, no lo pongas: nada de cifras, premios, años ni aforos que no aparezcan.
- Concreto: qué es, dónde, qué se hace allí o qué ofrece, y qué lo hace distinto. Nada de «experiencias únicas», «inolvidable» ni superlativos vacíos.
- Nunca precios, teléfonos, correos, webs ni condiciones.
- Si ya hay una descripción, mejórala sin perder lo que dice.
- En «falta», hasta tres datos que, si el partner los añadiera a su ficha, harían mejor el párrafo (por ejemplo «el aforo de la sala principal»). Una frase corta cada uno.`;

/* Lo que Claude lee de la ficha: lo publicable, en texto */
export function entrada(tipo, datos) {
  const pub = fichaPublica(FICHAS[tipo], { ...datos, autoriza: 'si' });
  if (!pub) { return ''; }
  const l = [`Tipo: ${tipo === 'localizacion' ? 'espacio para eventos' : 'proveedor de eventos'}`];
  if (pub.nombre) { l.push(`Nombre: ${pub.nombre}`); }
  if (pub.poblacion) { l.push(`Población: ${pub.poblacion}`); }
  if (pub.descripcion) { l.push(`Descripción actual: ${pub.descripcion}`); }
  for (const s of pub.secciones) {
    l.push('', `## ${s.titulo}`);
    for (const f of s.filas || []) { l.push(`${f.l}: ${f.v}`); }
    for (const partes of s.lista || []) { l.push(`- ${partes.map(x => x.v).join(' · ')}`); }
  }
  return l.join('\n').slice(0, 12000);
}

export async function describir(tipo, datos, { apiKey = process.env.ANTHROPIC_API_KEY, fetch } = {}) {
  if (!apiKey) { throw Object.assign(new Error('La IA no está configurada en el sitio'), { motivo: 'sin-clave' }); }
  const texto = entrada(tipo, datos);
  if (!texto) { throw new Error('La ficha está vacía'); }
  const r = await mensaje({
    model: MODELO,
    max_tokens: 1500,
    system: GUIA,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
    messages: [{ role: 'user', content: texto }],
  }, { apiKey, fetch, espera: 25000 });
  const salida = JSON.parse(textoDe(r.respuesta));
  const descripcion = String(salida.descripcion || '').trim();
  if (!descripcion) { throw new Error('Claude no ha devuelto texto'); }
  return { descripcion: descripcion.slice(0, 900), falta: (salida.falta || []).map(String).slice(0, 3), uso: r.uso };
}

/* «Tu lugar en la red»: Claude acompaña al partner a ir dibujando su parte
   del mapa de valor de la red (método VNA de Verna Allee): qué rol cumple en
   un evento, qué entrega (tangible e intangible), qué recibe y a quién sirve.
   Parte de lo publicable de su ficha, de lo que ya hay y de lo que el partner
   le cuente, y devuelve también las preguntas que harían el mapa más fiel:
   así cada vuelta lo hace evolucionar. Es texto público: nunca precios,
   comisiones, condiciones ni proyectos que no estén en los datos. */
export const ROLES_RED = ['Quien acoge', 'Quien sirve en el evento', 'Quien dinamiza la actividad', 'Quien produce y coordina', 'Quien lo revende'];

const ESQUEMA_RED = {
  type: 'object',
  properties: {
    rol: { type: 'string', enum: ROLES_RED },
    aporta: { type: 'array', items: { type: 'string' } },
    recibe: { type: 'array', items: { type: 'string' } },
    para: { type: 'array', items: { type: 'string' } },
    preguntas: { type: 'array', items: { type: 'string' } },
  },
  required: ['rol', 'aporta', 'recibe', 'para', 'preguntas'],
  additionalProperties: false,
};

const GUIA_RED = `Ayudas a un espacio o proveedor de la red de Events Penedès (agencia local de eventos de empresa en el Penedès) a describir su lugar en el flujo de valor de un evento, con el método de redes de valor de Verna Allee. Escribes en castellano lo que se publicará en su página.

Los roles de la red son: ${ROLES_RED.join(', ')}. En un evento, quien lo encarga es una empresa y quien asiste es su equipo.

- «rol»: el que mejor describe lo que hace en un evento.
- «aporta»: de 2 a 5 cosas que entrega al evento. Mezcla lo tangible (un espacio, un taller, una comida) y lo intangible (confianza, una vivencia, conocimiento del territorio). Frases cortas, sin verbo al principio si no hace falta.
- «recibe»: de 2 a 4 cosas que recibe a cambio de la red y de los clientes, también tangibles e intangibles (encargos, visibilidad, testimonio, un caso que contar). Nunca dinero, precios ni comisiones.
- «para»: de 1 a 3 tipos de cliente o de evento a los que sirve mejor.
- «preguntas»: de 1 a 3 preguntas cortas al partner que, contestadas, harían su mapa más fiel. Si ya hay un mapa, pregunta por lo que falta o no encaja.
- Solo lo que dicen los datos y lo que te cuente el partner. Si ya hay un mapa, mejóralo sin perder lo que dice.
- Nunca precios, importes, teléfonos, correos, webs ni condiciones, ni proyectos, socios o planes que no estén en los datos.`;

const lista = v => (Array.isArray(v) ? v.map(x => String(x).replace(/\s+/g, ' ').trim().slice(0, 160)).filter(Boolean).slice(0, 6) : []);

export async function mapaRed(tipo, datos, red, nota, { apiKey = process.env.ANTHROPIC_API_KEY, fetch } = {}) {
  if (!apiKey) { throw Object.assign(new Error('La IA no está configurada en el sitio'), { motivo: 'sin-clave' }); }
  const ficha = entrada(tipo, datos);
  if (!ficha) { throw new Error('La ficha está vacía'); }
  const actual = red && (red.rol || red.aporta?.length)
    ? `\n\n## Su lugar en la red ahora\nRol: ${red.rol || '—'}\nAporta: ${lista(red.aporta).join('; ') || '—'}\nRecibe: ${lista(red.recibe).join('; ') || '—'}\nPara: ${lista(red.para).join('; ') || '—'}` : '';
  const cuenta = typeof nota === 'string' && nota.trim() ? `\n\n## Lo que cuenta el partner\n${nota.trim().slice(0, 2000)}` : '';
  const r = await mensaje({
    model: MODELO,
    max_tokens: 1500,
    system: GUIA_RED,
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA_RED } },
    messages: [{ role: 'user', content: `${ficha}${actual}${cuenta}` }],
  }, { apiKey, fetch, espera: 25000 });
  const s = JSON.parse(textoDe(r.respuesta));
  return {
    red: { rol: ROLES_RED.includes(s.rol) ? s.rol : '', aporta: lista(s.aporta), recibe: lista(s.recibe), para: lista(s.para) },
    preguntas: lista(s.preguntas).slice(0, 3), uso: r.uso,
  };
}
