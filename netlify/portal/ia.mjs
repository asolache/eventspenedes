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
