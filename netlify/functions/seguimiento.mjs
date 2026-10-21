/* =============================================================================
   Events Penedès · el seguimiento de una propuesta, sin entrar

   /seguimiento/<id>/<clave> enseña al cliente cómo van las propuestas que
   pedimos para su evento: una por espacio, «en curso» o «lista», con su
   descripción. Se actualiza solo: cada vez que tools/evento-cliente.mjs vuelve
   a escribir el evento, el enlace enseña lo nuevo.

   La clave va en el enlace y está en eventos_cliente.clave; sin las dos cosas
   no hay nada. No lleva precios, ni proveedores, ni lo que nos falta, ni lo
   que el cliente nos ha pedido: eso queda en /evento, con su correo.

   Variables de entorno: SUPABASE_SECRET_KEY (ver netlify/portal/supabase.mjs)
   ========================================================================== */
import { configurado, rest } from '../portal/supabase.mjs';
import { pagina, esc, SITIO } from '../portal/pagina.mjs';

const ID = /^[a-z0-9-]{3,80}$/;
const CLAVE = /^[a-f0-9]{32}$/;
const CABECERAS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
};
const ESTADOS = {
  lista: ['Propuesta lista', 'Te la enviamos por correo con el precio.'],
  en_curso: ['En curso', 'Estamos esperando su propuesta formal.'],
};

const diaLargo = f => (f ? new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) : 'Fecha por cerrar');
const horaDe = t => new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export function paginaSeguimiento(ev) {
  const d = ev.datos || {};
  const propuestas = Array.isArray(d.propuestas) ? d.propuestas : [];
  const listas = propuestas.filter(p => p.estado === 'lista').length;
  const filas = propuestas.map(p => {
    const [estado, nota] = ESTADOS[p.estado] || ESTADOS.en_curso;
    return `<li class="card seguimiento__opcion">
  ${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.alt || '')}" loading="lazy" width="640" height="360">` : ''}
  <div>
    <p class="eyebrow">${esc(estado)}</p>
    <h2>${esc(p.titulo)}</h2>
    ${p.estado === 'lista' && p.texto ? `<p>${esc(p.texto)}</p>` : ''}
    <p class="form__note">${esc(nota)}</p>
  </div>
</li>`;
  }).join('\n');
  const cuerpo = `<section class="hero hero--dj">
  <div class="wrap">
    <p class="eyebrow">Seguimiento de vuestra propuesta</p>
    <h1>${esc(ev.titulo)}</h1>
    <p class="lead">${esc(diaLargo(ev.fecha))}${Number.isFinite(d.pax) ? ` · ${d.pax} personas` : ''}</p>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <p>${propuestas.length ? `${listas} de ${propuestas.length} propuestas listas.` : 'Estamos preparando las propuestas: salen aquí en cuanto las tengamos.'} Esta página se actualiza sola cuando llega cada una.</p>
    <ol class="seguimiento" style="list-style:none;padding:0;display:grid;gap:1rem">
${filas}
    </ol>
    <p class="form__note">Actualizado el ${esc(horaDe(ev.actualizado_en))}. Cualquier duda, contesta al correo y lo vemos.</p>
  </div>
</section>`;
  return pagina({
    titulo: `${ev.titulo} · seguimiento · Events Penedès`,
    descripcion: 'Cómo van las propuestas para vuestro evento con Events Penedès.',
    canonica: `${SITIO}/evento`,
    estructurados: [],
    cuerpo,
    indexar: false,
  });
}

const nada = () => new Response('No encontrado', { status: 404, headers: { ...CABECERAS, 'content-type': 'text/plain; charset=utf-8' } });

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { return new Response('Solo GET', { status: 405 }); }
  if (!configurado()) { return nada(); }
  const [, id, clave] = new URL(req.url).pathname.replace(/\/+$/, '').split('/').slice(1);
  if (!ID.test(id || '') || !CLAVE.test(clave || '')) { return nada(); }
  try {
    const filas = await rest(`eventos_cliente?id=eq.${id}&clave=eq.${clave}&select=id,titulo,fecha,datos,actualizado_en`);
    if (!filas?.length) { return nada(); }
    return new Response(paginaSeguimiento(filas[0]), { headers: CABECERAS });
  } catch (e) {
    console.error('seguimiento:', e.message);
    return new Response('No disponible ahora mismo', { status: 503, headers: { 'retry-after': '60', 'content-type': 'text/plain; charset=utf-8' } });
  }
};

export const config = {
  path: ['/seguimiento/*'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
