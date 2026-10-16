/* =============================================================================
   Events Penedès — lo común del blog y la agenda

   Lo usan el portal (el cuestionario que contesta el partner y el borrador del
   artículo) y el servidor (las páginas /blog y /agenda). Sin DOM ni red: solo
   datos y texto, para que las dos partes digan exactamente lo mismo.
   ========================================================================== */

/* El cuestionario de la entrevista. Las respuestas se guardan por clave; el
   artículo sale en forma de entrevista: la pregunta y lo que contestó. */
export const CUESTIONARIO = [
  { n: 'quienes', p: '¿Quiénes sois y desde cuándo estáis en el Penedès?', obligatoria: true },
  { n: 'autentico', p: '¿Qué hace que una experiencia con vosotros sea auténtica y no se pueda vivir en otro sitio?', obligatoria: true },
  { n: 'momento', p: '¿Cuál es el momento que más recuerdan vuestros invitados?', obligatoria: true },
  { n: 'empresa', p: '¿Qué le propondríais a un grupo de empresa que viene por primera vez?' },
  { n: 'temporada', p: '¿Cuál es vuestra época del año preferida y por qué?' },
  { n: 'producto', p: 'Un producto, un plato o un vino del Penedès que siempre recomendáis.' },
  { n: 'rincon', p: 'Un rincón del Penedès que os gusta enseñar.' },
  { n: 'detalle', p: '¿Qué detalle cuidáis que el invitado quizá no ve pero nota?' },
];
export const MAX_RESPUESTA = 1500;

export const CATEGORIAS = {
  vino: 'Vino y cava', gastronomia: 'Gastronomía', taller: 'Talleres', castells: 'Castells',
  cultura: 'Cultura y patrimonio', naturaleza: 'Naturaleza y paisaje', musica: 'Música', otro: 'Otras experiencias',
};

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* Una dirección legible a partir de un título */
export const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');

/* El primer borrador del artículo: cada pregunta contestada como apartado. El
   administrador lo retoca antes de enseñarlo al partner. */
export function borradorEntrevista(respuestas) {
  return CUESTIONARIO
    .filter(q => typeof respuestas?.[q.n] === 'string' && respuestas[q.n].trim())
    .map(q => `## ${q.p}\n\n${respuestas[q.n].trim()}`)
    .join('\n\n');
}

export const faltan = respuestas => CUESTIONARIO.filter(q => q.obligatoria && !String(respuestas?.[q.n] || '').trim());

/* El cuerpo es texto llano: párrafos separados por una línea en blanco y «## »
   para un apartado. Nada de HTML de quien escribe: se escapa todo. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function cuerpoHtml(texto) {
  return String(texto || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean).map(b => {
    if (b.startsWith('## ')) { return `<h2>${esc(b.slice(3).trim())}</h2>`; }
    if (b.startsWith('> ')) { return `<blockquote><p>${esc(b.replace(/^> ?/gm, '')).replace(/\n/g, '<br>')}</p></blockquote>`; }
    return `<p>${esc(b).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}
export const textoPlano = texto => String(texto || '').replace(/^## /gm, '').replace(/^> ?/gm, '').replace(/\s+/g, ' ').trim();

/* --- La agenda ---------------------------------------------------------------- */

const dia = d => new Date(`${d}T12:00:00Z`);
const iso = d => d.toISOString().slice(0, 10);

/* Cuándo toca una acción a partir de `hoy`: la fecha que tiene o, si se repite
   cada año, la próxima vez. null si ya ha pasado y no se repite. */
export function proximaVez(a, hoy = iso(new Date())) {
  const ini = dia(a.fecha_inicio);
  const fin = dia(a.fecha_fin || a.fecha_inicio);
  if (!a.cada_ano) { return iso(fin) >= hoy ? { inicio: iso(ini), fin: iso(fin) } : null; }
  const duracion = fin - ini;
  const h = dia(hoy);
  for (const ano of [h.getUTCFullYear() - 1, h.getUTCFullYear(), h.getUTCFullYear() + 1]) {
    const i = new Date(Date.UTC(ano, ini.getUTCMonth(), ini.getUTCDate(), 12));
    const f = new Date(i.getTime() + duracion);
    if (iso(f) >= hoy) { return { inicio: iso(i), fin: iso(f) }; }
  }
  return null;
}

/* Lo que sale en la web de una acción: nunca el precio ni las notas */
export function accionPublica(a, hoy) {
  const vez = proximaVez(a, hoy);
  if (!vez || a.estado !== 'aprobada') { return null; }
  return {
    id: a.id, titulo: a.titulo, descripcion: a.descripcion || '', categoria: a.categoria,
    inicio: vez.inicio, fin: vez.fin, cada_ano: Boolean(a.cada_ano),
    hora_inicio: a.hora_inicio ? String(a.hora_inicio).slice(0, 5) : null,
    hora_fin: a.hora_fin ? String(a.hora_fin).slice(0, 5) : null,
    plazas_min: a.plazas_min || null, plazas_max: a.plazas_max || null,
    partner_id: a.partner_id || null,
  };
}

/* «12 de septiembre» o «12 – 20 de septiembre» o «28 de septiembre – 3 de octubre» */
export function cuando(inicio, fin) {
  const a = dia(inicio); const b = dia(fin || inicio);
  const d = x => `${x.getUTCDate()} de ${MESES[x.getUTCMonth()]}`;
  if (iso(a) === iso(b)) { return d(a); }
  if (a.getUTCMonth() === b.getUTCMonth()) { return `${a.getUTCDate()} – ${d(b)}`; }
  return `${d(a)} – ${d(b)}`;
}
