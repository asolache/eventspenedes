/* =============================================================================
   Events Penedès · el blog y la agenda de la red

     GET /blog                      los artículos publicados, lo último arriba
     GET /blog/<slug>               un artículo (entrevista o guía), enlazado a
                                    la página del partner si la tiene publicada
     GET /blog/<slug>/foto/<n>      la foto n de un artículo
     GET /blog/feed.xml             RSS, para lectores y asistentes
     GET /blog/sitemap.xml          para los buscadores
     GET /agenda                    las acciones del año por mes, desde hoy,
                                    y lo que pasa en el territorio (con fuente)
     GET /agenda/<id>/plaza         lleva al formulario de contacto con la
                                    acción y el partner: toda petición llega
                                    primero a Events Penedès, nunca al partner

   Igual que /partners, las páginas salen enteras del servidor con sus datos
   estructurados (BlogPosting, Event) para que buscadores y asistentes de IA
   las lean sin ejecutar nada. Nada de precios, contactos ni condiciones: una
   acción de la agenda guarda su precio para nosotros y aquí no se pide.

   El nombre de un partner sale en un artículo solo si nos dio permiso en su
   entrevista (lo exige la base de datos para publicarla). En la agenda sale
   solo si su página pública está autorizada; si no, la acción sale como «con
   un partner de la red».

   Sin SUPABASE_SECRET_KEY no hay blog ni agenda: responden 404.
   ========================================================================== */
import { FICHAS } from '../ficha/fichas.mjs';
import { fichaPublica } from '../ficha/publica.mjs';
import { configurado, articulosPublicados, agendaAprobada, partnersPorId, foto, sumarImpresion } from '../portal/supabase.mjs';
import { pagina, migas, esc, recorta, SITIO } from '../portal/pagina.mjs';
import { CATEGORIAS, MESES, cuerpoHtml, textoPlano, accionPublica, cuando } from '../../js/blog-comun.js';
import { territorioProximo } from '../../js/agenda-territorio.js';
import { CLUB, NOMBRE_REGLA, citasClub } from '../../js/club.js';

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FOTOS = 8;
const DESCRIPCION_BLOG = 'Experiencias auténticas y de alto nivel en el Penedès: entrevistas a las bodegas, masías y artesanos de la red de Events Penedès, y guías para organizar eventos de empresa entre viñas.';

const hoy = () => new Date().toISOString().slice(0, 10);
const fechaLarga = f => { const d = new Date(f); return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`; };

/* Cómo se nombra a un partner en público, y si tiene página que enlazar */
function firma(p, { conPermiso }) {
  if (!p) { return null; }
  const pub = p.datos && FICHAS[p.tipo] ? fichaPublica(FICHAS[p.tipo], p.datos) : null;
  if (!pub && !conPermiso) { return null; }
  return {
    nombre: pub?.nombre || p.nombre,
    poblacion: pub?.poblacion || null,
    url: pub ? `${SITIO}/partners/${p.codigo}` : null,
    codigo: p.codigo,
  };
}

/* Las fotos publicables de un artículo: de la carpeta de su partner y con su permiso */
const fotosDe = a => (a.tipo === 'entrevista' && !a.permiso_fotos ? [] : Array.isArray(a.fotos) ? a.fotos : [])
  .filter(r => typeof r === 'string' && (!a.partner_id || r.startsWith(`${a.partner_id}/`))).slice(0, MAX_FOTOS);

const crumbs = items => `
  <nav class="crumbs wrap" aria-label="Migas de pan">
    ${items.map(([t, u], i) => (i < items.length - 1 ? `<a href="${u}">${esc(t)}</a> <span aria-hidden="true">/</span>` : `<span>${esc(t)}</span>`)).join(' ')}
  </nav>`;

const ORGANIZACION = { '@type': 'Organization', '@id': `${SITIO}/#business`, name: 'Events Penedès', url: `${SITIO}/` };

/* --- El blog ------------------------------------------------------------------ */

function tarjetaArticulo(a, socios) {
  const s = firma(socios[a.partner_id], { conPermiso: a.tipo === 'entrevista' });
  return `
        <a class="card card--ruta" href="/blog/${a.slug}">
          <p class="eyebrow">${a.tipo === 'entrevista' ? 'Entrevista' : 'Guía'} · ${esc(fechaLarga(a.publicado_en))}</p>
          <h3>${esc(a.titulo)}</h3>
          ${a.entradilla ? `<p>${esc(recorta(a.entradilla, 200))}</p>` : ''}
          ${s ? `<p class="form__note">${esc(s.nombre)}${s.poblacion ? ` · ${esc(s.poblacion)}` : ''}</p>` : ''}
          <p class="card__more">Leer</p>
        </a>`;
}

function paginaBlog(articulos, socios) {
  const url = `${SITIO}/blog`;
  const grupo = (tipo, titulo) => {
    const del = articulos.filter(a => a.tipo === tipo);
    return del.length ? `
  <section class="section">
    <div class="wrap">
      <h2>${titulo}</h2>
      <div class="grid grid--3">${del.map(a => tarjetaArticulo(a, socios)).join('')}
      </div>
    </div>
  </section>` : '';
  };
  const cuerpo = `${crumbs([['Events Penedès', '/'], ['Blog', null]])}
  <section class="hero hero--dj">
    <div class="wrap">
      <p class="eyebrow">El blog de Events Penedès</p>
      <h1>Experiencias auténticas en el Penedès</h1>
      <p class="lead">Las personas que hay detrás de las bodegas, las masías y los oficios del Penedès, contadas por ellas mismas. Y cómo vivirlo con tu equipo.</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="/agenda">Ver la agenda del año</a>
        <a class="btn btn--ghost" href="/partners">La red de espacios y proveedores</a>
      </div>
    </div>
  </section>${grupo('entrevista', 'Entrevistas')}${grupo('guia', 'Guías')}${articulos.length ? '' : `
  <section class="section"><div class="wrap"><p>Muy pronto, las primeras entrevistas.</p></div></section>`}`;
  return pagina({
    titulo: 'Blog · Experiencias auténticas en el Penedès · Events Penedès',
    descripcion: DESCRIPCION_BLOG, canonica: url, indexar: articulos.length > 0,
    estructurados: [{
      '@context': 'https://schema.org', '@type': 'Blog', '@id': `${url}#blog`, url, name: 'Blog de Events Penedès',
      description: DESCRIPCION_BLOG, inLanguage: 'es', publisher: ORGANIZACION, isPartOf: { '@id': `${SITIO}/#website` },
      blogPost: articulos.slice(0, 50).map(a => ({ '@type': 'BlogPosting', headline: a.titulo, url: `${url}/${a.slug}`, datePublished: a.publicado_en })),
    }, migas([['Events Penedès', `${SITIO}/`], ['Blog', url]])],
    cuerpo,
  });
}

function paginaArticulo(a, socios, acciones) {
  const url = `${SITIO}/blog/${a.slug}`;
  const s = firma(socios[a.partner_id], { conPermiso: a.tipo === 'entrevista' });
  const fotos = fotosDe(a).map((_, i) => `${url}/foto/${i + 1}`);
  const descripcion = recorta(a.entradilla || textoPlano(a.cuerpo), 155);
  const suyas = acciones.filter(x => x.partner_id && x.partner_id === a.partner_id).slice(0, 4);

  const articulo = {
    '@context': 'https://schema.org', '@type': 'BlogPosting', '@id': `${url}#articulo`,
    headline: a.titulo, description: descripcion, url, mainEntityOfPage: url, inLanguage: 'es',
    datePublished: a.publicado_en, dateModified: a.actualizado_en || a.publicado_en,
    author: ORGANIZACION, publisher: ORGANIZACION, isPartOf: { '@id': `${SITIO}/blog#blog` },
    articleSection: a.tipo === 'entrevista' ? 'Entrevistas' : 'Guías',
    ...(a.temas?.length ? { keywords: a.temas.join(', ') } : {}),
    ...(fotos.length ? { image: fotos } : {}),
    ...(s ? { about: s.url ? { '@id': `${s.url}#negocio` } : { '@type': 'LocalBusiness', name: s.nombre } } : {}),
    contentLocation: { '@type': 'Place', name: s?.poblacion ? `${s.poblacion}, Penedès` : 'Penedès' },
  };

  const galeria = fotos.length ? `
      <ul class="partner-ficha__fotos">${fotos.map((f, i) => `<li><img src="${f}" alt="${esc(s?.nombre || a.titulo)} · foto ${i + 1}" loading="${i ? 'lazy' : 'eager'}"></li>`).join('')}</ul>` : '';
  const perfil = s?.url ? `
      <aside class="card">
        <p class="eyebrow">En la red de Events Penedès</p>
        <h2>${esc(s.nombre)}</h2>
        <p>Su ficha, lo que ofrece y cómo organizar un evento con ${esc(s.nombre)}.</p>
        <p><a class="btn btn--primary" href="/partners/${s.codigo}">Ver su perfil</a></p>
      </aside>` : '';
  const agenda = suyas.length ? `
      <section class="partner-ficha__seccion">
        <h2>Próximamente${s ? ` con ${esc(s.nombre)}` : ''}</h2>
        <ul class="partner-ficha__lista">${suyas.map(x => `<li><strong>${esc(x.titulo)}</strong><br><span>${esc(cuando(x.inicio, x.fin))}</span></li>`).join('')}</ul>
        <p><a href="/agenda">Toda la agenda</a></p>
      </section>` : '';

  const cuerpo = `${crumbs([['Events Penedès', '/'], ['Blog', '/blog'], [a.titulo, null]])}
  <article>
    <section class="hero hero--dj">
      <div class="wrap">
        <p class="eyebrow">${a.tipo === 'entrevista' ? 'Entrevista' : 'Guía'} · <time datetime="${esc(a.publicado_en)}">${esc(fechaLarga(a.publicado_en))}</time></p>
        <h1>${esc(a.titulo)}</h1>
        ${a.entradilla ? `<p class="lead">${esc(a.entradilla)}</p>` : ''}
      </div>
    </section>
    <section class="section">
      <div class="wrap partner-ficha">${galeria}
        <div class="articulo">
${cuerpoHtml(a.cuerpo)}
        </div>${perfil}${agenda}
        <p class="form__note">¿Quieres vivirlo con tu equipo? <a href="/contacto.html${s ? `?ref=${s.codigo}` : ''}#escribenos">Cuéntanos tu evento</a> y te preparamos la propuesta.</p>
      </div>
    </section>
  </article>`;

  return pagina({
    titulo: `${a.titulo} · Blog de Events Penedès`, descripcion, canonica: url, imagen: fotos[0], og: 'article',
    cabeza: `\n<meta property="article:published_time" content="${esc(a.publicado_en)}">`,
    estructurados: [articulo, migas([['Events Penedès', `${SITIO}/`], ['Blog', `${SITIO}/blog`], [a.titulo, url]])],
    cuerpo,
  });
}

function feed(articulos) {
  const x = s => esc(s);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Blog de Events Penedès</title>
  <link>${SITIO}/blog</link>
  <atom:link href="${SITIO}/blog/feed.xml" rel="self" type="application/rss+xml"/>
  <description>${x(DESCRIPCION_BLOG)}</description>
  <language>es</language>
${articulos.slice(0, 30).map(a => `  <item>
    <title>${x(a.titulo)}</title>
    <link>${SITIO}/blog/${a.slug}</link>
    <guid isPermaLink="true">${SITIO}/blog/${a.slug}</guid>
    <pubDate>${new Date(a.publicado_en).toUTCString()}</pubDate>
    <description>${x(a.entradilla || recorta(textoPlano(a.cuerpo), 300))}</description>
  </item>`).join('\n')}
</channel>
</rss>
`;
}

function sitemap(articulos) {
  const fila = (loc, fecha) => `  <url><loc>${loc}</loc>${fecha ? `<lastmod>${String(fecha).slice(0, 10)}</lastmod>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[fila(`${SITIO}/blog`), fila(`${SITIO}/agenda`), ...articulos.map(a => fila(`${SITIO}/blog/${a.slug}`, a.actualizado_en || a.publicado_en))].join('\n')}
</urlset>
`;
}

/* --- La agenda ----------------------------------------------------------------- */

/* Una fiesta o feria del territorio: no es nuestra, así que enlaza a su fuente
   y la llamada es ir en grupo con la red, que nos llega por el formulario. */
function filaTerritorio(t) {
  const detalles = [cuando(t.inicio, t.fin), t.hora ? `${t.hora}${t.hora_fin ? `–${t.hora_fin}` : ''}` : '', t.poblacion, CATEGORIAS[t.categoria] || ''].filter(Boolean);
  const q = new URLSearchParams({ asunto: `Ir en grupo: ${t.titulo} (${cuando(t.inicio, t.fin)})`, fecha: t.inicio });
  return `
          <article class="card card--territorio">
            <p class="eyebrow">${esc(detalles.join(' · '))}</p>
            <h3>${esc(t.titulo)}</h3>
            ${t.descripcion ? `<p>${esc(recorta(t.descripcion, 300))}</p>` : ''}
            <p class="form__note">Fuente: <a href="${esc(t.fuente)}" rel="noopener nofollow" target="_blank">${esc(t.fuente_nombre || 'la organización')}</a></p>
            <p><a class="btn btn--ghost" href="/contacto.html?${esc(q.toString())}#escribenos" rel="nofollow">Ir en grupo</a></p>
          </article>`;
}

function paginaAgenda(acciones, socios, territorio = []) {
  const url = `${SITIO}/agenda`;
  const porMes = new Map();
  const mes = clave => { if (!porMes.has(clave)) { porMes.set(clave, { red: [], fuera: [] }); } return porMes.get(clave); };
  for (const x of acciones) { mes(x.inicio.slice(0, 7)).red.push(x); }
  for (const t of territorio) { mes(t.inicio.slice(0, 7)).fuera.push(t); }
  const claves = [...porMes.keys()].sort();
  const quien = x => firma(socios[x.partner_id], { conPermiso: false });
  const fila = x => {
    const s = quien(x);
    const plazas = x.plazas_max ? (x.plazas_min ? `${x.plazas_min}–${x.plazas_max} personas` : `hasta ${x.plazas_max} personas`) : x.plazas_min ? `desde ${x.plazas_min} personas` : '';
    const detalles = [cuando(x.inicio, x.fin) + (x.cada_ano ? ' · cada año' : ''),
      x.hora_inicio ? `${x.hora_inicio}${x.hora_fin ? `–${x.hora_fin}` : ''}` : '', plazas, CATEGORIAS[x.categoria] || ''].filter(Boolean);
    return `
          <article class="card">
            <p class="eyebrow">${esc(detalles.join(' · '))}</p>
            <h3>${esc(x.titulo)}</h3>
            ${x.descripcion ? `<p>${esc(recorta(x.descripcion, 400))}</p>` : ''}
            <p class="form__note">${s ? (s.url ? `Con <a href="/partners/${s.codigo}">${esc(s.nombre)}</a>` : `Con ${esc(s.nombre)}`) : x.partner_id ? 'Con un partner de la red' : 'Con Events Penedès'}${s?.poblacion ? ` · ${esc(s.poblacion)}` : ''}</p>
            <p><a class="btn btn--ghost" href="/agenda/${x.id}/plaza" rel="nofollow">Me interesa</a></p>
          </article>`;
  };
  const meses = claves.map(clave => {
    const { red, fuera } = porMes.get(clave);
    const [ano, m] = clave.split('-').map(Number);
    return `
  <section class="section" id="m-${clave}">
    <div class="wrap">
      <h2>${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${ano}</h2>${red.length ? `
      <div class="grid grid--3">${red.map(fila).join('')}
      </div>` : ''}${fuera.length ? `
      <h3 class="agenda__fuera">En el territorio</h3>
      <div class="grid grid--3">${fuera.map(filaTerritorio).join('')}
      </div>` : ''}
    </div>
  </section>`;
  }).join('');

  const eventos = acciones.slice(0, 100).map(x => {
    const s = quien(x);
    return {
      '@context': 'https://schema.org', '@type': 'Event', '@id': `${url}#${x.id}`, name: x.titulo,
      ...(x.descripcion ? { description: recorta(x.descripcion, 300) } : {}),
      startDate: x.hora_inicio ? `${x.inicio}T${x.hora_inicio}` : x.inicio,
      endDate: x.hora_fin ? `${x.fin}T${x.hora_fin}` : x.fin,
      eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      location: { '@type': 'Place', name: s?.nombre || 'Penedès',
        address: { '@type': 'PostalAddress', ...(s?.poblacion ? { addressLocality: s.poblacion } : {}), addressRegion: 'Barcelona', addressCountry: 'ES' } },
      organizer: ORGANIZACION, url,
      ...(s?.url ? { performer: { '@id': `${s.url}#negocio` } } : {}),
      ...(x.plazas_max ? { maximumAttendeeCapacity: x.plazas_max } : {}),
    };
  });

  const citas = citasClub();
  const club = citas.length ? `
  <section class="section" id="club">
    <div class="wrap">
      <p class="eyebrow">Club Events Penedès ${CLUB.ano} · ${CLUB.plazas} socios como mucho</p>
      <h2>Una cita fija: ${NOMBRE_REGLA[CLUB.regla]}</h2>
      <p>Música entre viñas en un espacio de la red, siempre el mismo día del mes. El lugar de cada cita se anuncia a los socios con la fecha.</p>
      <p class="form__note">${citas.map(f => cuando(f)).join(' · ')}</p>
      <p><a class="btn btn--primary" href="/contacto.html?${esc(new URLSearchParams({ asunto: `Quiero ser socio del Club Events Penedès ${CLUB.ano}` }).toString())}#escribenos" rel="nofollow">Quiero ser socio</a></p>
    </div>
  </section>` : '';
  const cuerpo = `${crumbs([['Events Penedès', '/'], ['Agenda', null]])}
  <section class="hero hero--dj">
    <div class="wrap">
      <p class="eyebrow">Agenda del Penedès</p>
      <h1>Qué vivir en el Penedès, mes a mes</h1>
      <p class="lead">Vendimia, catas, castells, cocina de temporada y paisaje: las experiencias de la red con fecha en el calendario, para grupos y empresas.</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="/propuesta.html">Pedir una propuesta</a>
        <a class="btn btn--ghost" href="/blog">Leer el blog</a>
      </div>
      ${claves.length > 1 ? `<p class="form__note">${claves.map(k => `<a href="#m-${k}">${MESES[Number(k.slice(5)) - 1]}</a>`).join(' · ')}</p>` : ''}
    </div>
  </section>${club}${meses || `
  <section class="section"><div class="wrap"><p>Estamos preparando la agenda del año con los espacios y proveedores de la red.</p></div></section>`}
  <section class="section">
    <div class="wrap">
      <h2>Música entre viñas</h2>
      <p>Sesiones de DJ y música en directo al aire libre, en las bodegas, masías y rincones de la red. Si tienes un espacio y quieres una sesión, proponla en tu portal; si buscas música para tu grupo, te la preparamos.</p>
      <div class="hero__actions">
        <a class="btn btn--ghost" href="/dj.html">Música para tu evento</a>
        <a class="btn btn--ghost" href="/acceso.html">Proponer una sesión (partners)</a>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="wrap"><p class="form__note">Precios y disponibilidad, bajo petición. Pulsa «Me interesa» o «Ir en grupo» y te contestamos nosotros con la propuesta: transporte, espacio, comida y actividad con la red. Las fechas del territorio son de su fuente; confírmalas allí.</p></div>
  </section>`;

  return pagina({
    titulo: 'Agenda de experiencias en el Penedès · Events Penedès',
    descripcion: 'Vendimia, catas, castells y cocina de temporada en el Penedès, mes a mes: las experiencias para grupos y empresas de la red de Events Penedès.',
    canonica: url, indexar: acciones.length + territorio.length + citas.length > 0,
    estructurados: [...eventos, migas([['Events Penedès', `${SITIO}/`], ['Agenda', url]])],
    cuerpo,
  });
}

/* --- Rutas ----------------------------------------------------------------------- */

const CACHE = { 'cache-control': 'public, max-age=300', 'netlify-cdn-cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' };
const responder = (cuerpo, tipo = 'text/html; charset=utf-8') => new Response(cuerpo, { headers: { 'content-type': tipo, ...CACHE } });
const noEncontrado = () => new Response('No encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });

/* Las acciones que vienen, ordenadas por cuándo tocan */
export const proximas = (filas, dia = hoy()) => filas.map(a => accionPublica(a, dia)).filter(Boolean)
  .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo));

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { return new Response('Solo GET', { status: 405 }); }
  if (!configurado()) { return noEncontrado(); }
  const [raiz, ...partes] = new URL(req.url).pathname.replace(/\/+$/, '').split('/').slice(1);

  try {
    if (raiz === 'agenda') {
      const acciones = proximas(await agendaAprobada());
      if (partes.length === 0) {
        return responder(paginaAgenda(acciones, await partnersPorId(acciones.map(x => x.partner_id)), territorioProximo()));
      }
      if (partes.length === 2 && partes[1] === 'plaza' && UUID.test(partes[0])) {
        const x = acciones.find(a => a.id === partes[0]);
        if (!x) { return noEncontrado(); }
        const s = x.partner_id ? (await partnersPorId([x.partner_id]))[x.partner_id] : null;
        if (s) { await sumarImpresion(s.codigo, true).catch(e => console.error('agenda · clic:', e.message)); }
        const q = new URLSearchParams({ asunto: `Me interesa: ${x.titulo} (${cuando(x.inicio, x.fin)})`, fecha: x.inicio });
        if (s) { q.set('ref', s.codigo); }
        return new Response(null, { status: 302, headers: { location: `/contacto.html?${q}#escribenos`, 'cache-control': 'no-store' } });
      }
      return noEncontrado();
    }

    const articulos = await articulosPublicados();
    if (partes.length === 0) {
      return responder(paginaBlog(articulos, await partnersPorId(articulos.map(a => a.partner_id))));
    }
    if (partes.length === 1 && partes[0] === 'feed.xml') { return responder(feed(articulos), 'application/rss+xml; charset=utf-8'); }
    if (partes.length === 1 && partes[0] === 'sitemap.xml') { return responder(sitemap(articulos), 'application/xml; charset=utf-8'); }
    if (!SLUG.test(partes[0])) { return noEncontrado(); }
    const a = articulos.find(x => x.slug === partes[0]);
    if (!a) { return noEncontrado(); }
    if (partes.length === 1) {
      const [socios, acciones] = await Promise.all([partnersPorId([a.partner_id]), a.partner_id ? agendaAprobada().then(proximas) : []]);
      return responder(paginaArticulo(a, socios, acciones));
    }
    if (partes.length === 3 && partes[1] === 'foto' && /^\d{1,2}$/.test(partes[2])) {
      const ruta = fotosDe(a)[Number(partes[2]) - 1];
      if (!ruta) { return noEncontrado(); }
      const r = await foto(ruta);
      return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
    }
    return noEncontrado();
  } catch (e) {
    console.error(`${raiz}:`, e.message);
    return new Response('No disponible ahora mismo', { status: 503, headers: { 'retry-after': '60', 'content-type': 'text/plain; charset=utf-8' } });
  }
};

export const config = {
  path: ['/blog', '/blog/*', '/agenda', '/agenda/*'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

export { paginaBlog, paginaArticulo, paginaAgenda, feed, sitemap, firma, fotosDe };
