/* =============================================================================
   Events Penedès · el seguimiento de una propuesta, sin entrar

   /seguimiento/<id>/<clave> enseña al cliente cómo van las propuestas que
   pedimos para su evento: una por espacio, «en curso», «lista» o «no disponible», con su
   descripción. Se actualiza solo: cada vez que tools/evento-cliente.mjs vuelve
   a escribir el evento, el enlace enseña lo nuevo.

   La clave va en el enlace y está en eventos_cliente.clave; sin las dos cosas
   no hay nada. No lleva precios, ni proveedores, ni lo que nos falta, ni lo
   que el cliente nos ha pedido: eso queda en /evento, con su correo.

   Con ?formato=json devuelve lo mismo en datos, para que otra web de la casa
   (teamtowershuma.com/seguiment) lo pinte con su estilo sin copiar nada: la
   fuente es una, esta.

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
  no_disponible: ['No disponible', 'No tienen libre ese día: seguimos con las otras opciones.'],
};
/* Lo que se enseña de cada propuesta: lo que no sea uno de estos, «en curso» */
export const estadoDe = p => (ESTADOS[p?.estado] ? p.estado : 'en_curso');

const diaLargo = f => (f ? new Date(`${f}T12:00:00Z`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' }) : 'Fecha por cerrar');
const horaDe = t => new Date(t).toLocaleString('es-ES', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

export function paginaSeguimiento(ev) {
  const d = ev.datos || {};
  const propuestas = Array.isArray(d.propuestas) ? d.propuestas : [];
  const listas = propuestas.filter(p => p.estado === 'lista').length;
  const fuera = propuestas.filter(p => p.estado === 'no_disponible').length;
  const resumen = `${listas} de ${propuestas.length - fuera} propuestas listas.${fuera ? ` ${fuera === 1 ? 'Un espacio no tiene' : `${fuera} espacios no tienen`} libre ese día.` : ''}`;
  const filas = propuestas.map(p => {
    const [estado, nota] = ESTADOS[estadoDe(p)];
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
    <p>${propuestas.length ? resumen : 'Estamos preparando las propuestas: salen aquí en cuanto las tengamos.'} Esta página se actualiza sola cuando llega cada una.</p>
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

/* Las webs de la casa que pintan el seguimiento con su estilo */
const ORIGENES = ['https://teamtowershuma.com', 'https://www.teamtowershuma.com'];
const PREVIEW = /^https:\/\/[a-z0-9-]+--teamtowershuma\.netlify\.app$/;

/* Lo mismo que enseña la página, en datos: nada más */
export function datosSeguimiento(ev) {
  const d = ev.datos || {};
  return {
    titulo: ev.titulo,
    fecha: ev.fecha || null,
    pax: Number.isFinite(d.pax) ? d.pax : null,
    propuestas: (Array.isArray(d.propuestas) ? d.propuestas : []).map(p => ({
      titulo: p.titulo, estado: estadoDe(p),
      texto: p.estado === 'lista' ? p.texto || null : null, foto: p.foto || null, alt: p.alt || null,
    })),
    actualizado_en: ev.actualizado_en,
  };
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
    if (new URL(req.url).searchParams.get('formato') === 'json') {
      const origen = req.headers.get('origin') || '';
      return new Response(JSON.stringify(datosSeguimiento(filas[0])), { headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'private, no-store, max-age=0',
        'x-robots-tag': 'noindex',
        ...(ORIGENES.includes(origen) || PREVIEW.test(origen) ? { 'access-control-allow-origin': origen, vary: 'Origin' } : {}),
      } });
    }
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
