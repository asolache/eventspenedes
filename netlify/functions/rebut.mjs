/* =============================================================================
   Events Penedès · «Recibido»: la confirmación de un recordatorio

   El botón del correo de la víspera abre /rebut/<clave>. La página pide un
   clic más y solo ese clic (un POST) apunta la hora en avisos_evento: los
   antivirus de correo abren los enlaces solos para revisarlos, y con un GET
   bastaría eso para dar por leído algo que nadie ha visto.

   No enseña nada del evento más allá del título y el día: la clave es la
   misma que va en el correo de una persona y no abre nada más.

   Variables de entorno: SUPABASE_SECRET_KEY (ver netlify/portal/supabase.mjs)
   ========================================================================== */
import { configurado, rest } from '../portal/supabase.mjs';
import { pagina, esc, SITIO } from '../portal/pagina.mjs';

const CLAVE = /^[a-f0-9]{32}$/;
const CABECERAS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
};
const T = {
  es: { pide: '¿Te ha llegado el recordatorio?', boton: 'Sí, me ha llegado', gracias: '¡Gracias! Ya nos consta que te ha llegado.', locale: 'es-ES' },
  ca: { pide: "T'ha arribat el recordatori?", boton: "Sí, m'ha arribat", gracias: "Gràcies! Ja ens consta que t'ha arribat.", locale: 'ca-ES' },
  en: { pide: 'Did you get the reminder?', boton: 'Yes, I got it', gracias: 'Thanks! We know it reached you.', locale: 'en-GB' },
};

export function paginaRebut(aviso, clave) {
  const t = T[aviso.evento_interesados?.idioma] || T.es;
  const ev = aviso.eventos_cliente || {};
  const dia = ev.fecha ? new Date(`${ev.fecha}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }) : '';
  const cuerpo = `<section class="section"><div class="wrap" style="max-width:36rem">
  <p class="eyebrow">${esc(dia)}</p>
  <h1>${esc(ev.titulo || 'Events Penedès')}</h1>
  ${aviso.recibido_en
    ? `<p class="lead">${esc(t.gracias)}</p>`
    : `<p class="lead">${esc(t.pide)}</p>
  <form method="post" action="/rebut/${clave}"><button class="btn btn--primary" type="submit">${esc(t.boton)}</button></form>`}
</div></section>`;
  return pagina({ titulo: `${ev.titulo || 'Recordatorio'} · Events Penedès`, descripcion: t.pide, canonica: SITIO, estructurados: [], cuerpo, indexar: false });
}

const nada = () => new Response('No encontrado', { status: 404, headers: { ...CABECERAS, 'content-type': 'text/plain; charset=utf-8' } });

export default async (req) => {
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) { return new Response('Solo GET o POST', { status: 405 }); }
  if (!configurado()) { return nada(); }
  const clave = new URL(req.url).pathname.replace(/\/+$/, '').split('/')[2] || '';
  if (!CLAVE.test(clave)) { return nada(); }
  const campos = 'select=id,recibido_en,evento_interesados(idioma),eventos_cliente(titulo,fecha)';
  try {
    if (req.method === 'POST') {
      await rest(`avisos_evento?clave=eq.${clave}&recibido_en=is.null`, { method: 'PATCH', body: { recibido_en: new Date().toISOString() } });
    }
    const [aviso] = await rest(`avisos_evento?clave=eq.${clave}&${campos}`) || [];
    if (!aviso) { return nada(); }
    return new Response(paginaRebut(aviso, clave), { headers: CABECERAS });
  } catch (e) {
    console.error('rebut:', e.message);
    return new Response('No disponible ahora mismo', { status: 503, headers: { 'retry-after': '60', 'content-type': 'text/plain; charset=utf-8' } });
  }
};

export const config = {
  path: ['/rebut/*'],
  rateLimit: { windowLimit: 30, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
