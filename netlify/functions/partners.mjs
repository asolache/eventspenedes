/* =============================================================================
   Events Penedès · las páginas públicas de los partners

   Cada espacio o proveedor de la red con la ficha aprobada y autorizada para
   publicarse tiene su página, y todos juntos forman el directorio:

     GET  /partners                    el directorio (espacios y proveedores)
     GET  /partners/<código>           la página de un partner
     GET  /partners/<código>/foto/<n>  la foto n de su ficha aprobada
     GET  /partners/<código>/contacto  cuenta el clic y lleva a /contacto con
                                       el código: el lead queda trazado
     POST /partners/<código>/visto     cuenta una visita (la manda la página)
     GET  /partners/<código>/previa    (su partner o un administrador, con su
                                       sesión del portal) cómo quedaría su
                                       página con la ficha en curso, aunque no
                                       esté aprobada ni autorizada. No se
                                       indexa, no cuenta visitas ni clics y
                                       sale de la misma `fichaPublica()`
     GET  /partners/sitemap.xml        para los buscadores

   Las páginas salen del servidor, enteras, para que buscadores y asistentes
   de IA las lean sin ejecutar nada: título, descripción, datos estructurados
   (schema.org) y el texto de la ficha. Lo que se publica lo decide
   `fichaPublica()`: nada de precios, contactos ni condiciones.

   La visita se cuenta desde el navegador y no al servir la página: así la CDN
   puede guardar la página y los rastreadores, que no ejecutan JavaScript, no
   inflan las cifras que ve el partner.

   Sin SUPABASE_SECRET_KEY no hay directorio: /partners responde 404 y la web
   sigue como estaba.
   ========================================================================== */
import { FICHAS } from '../ficha/fichas.mjs';
import { fichaPublica } from '../ficha/publica.mjs';
import { configurado, articulosPublicados, agendaAprobada, partnersPublicos, partnerPorCodigo, sumarImpresion, foto, firmarFoto, fichaEnCurso, usuario, esAdmin, esMiembro } from '../portal/supabase.mjs';
import { pagina, migas, esc, recorta } from '../portal/pagina.mjs';
import { accionPublica, cuando } from '../../js/blog-comun.js';

const SITIO = 'https://eventspenedes.com';
const CODIGO = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const MAX_FOTOS = 12;

const TIPO_LEGIBLE = { localizacion: 'Espacio para eventos', proveedor: 'Proveedor de eventos' };

/* Las fotos publicables: rutas de su carpeta, en la ficha aprobada */
const fotosDe = p => (Array.isArray(p.datos.imagenes) ? p.datos.imagenes : [])
  .filter(r => typeof r === 'string' && r.startsWith(`${p.id}/`)).slice(0, MAX_FOTOS);

/* `previa`: { fotos: [url], pendiente, autoriza } para la vista previa del
   portal. Se publica igual que la página de verdad, como si estuviera
   autorizada, con un aviso arriba y sin contar nada. */
/* `extra`: { entrevistas: [{ titulo, slug }], acciones: [accionPublica] } del blog y la agenda */
function paginaPartner(p, previa = null, extra = {}) {
  const pub = fichaPublica(FICHAS[p.tipo], previa ? { ...p.datos, autoriza: 'si' } : p.datos);
  const nombre = pub.nombre || p.nombre;
  const url = `${SITIO}/partners/${p.codigo}`;
  const fotos = previa ? previa.fotos : fotosDe(p).map((_, i) => `${SITIO}/partners/${p.codigo}/foto/${i + 1}`);
  const tipo = TIPO_LEGIBLE[p.tipo];
  const lugar = pub.poblacion ? `${pub.poblacion}, Penedès` : 'Penedès';
  const descripcion = recorta(pub.descripcion || `${nombre}: ${tipo.toLowerCase()} en ${lugar}, en la red de Events Penedès.`, 155);

  /* Para buscadores y asistentes: qué es, dónde está y qué ofrece, con los
     mismos datos que se leen en la página. */
  const negocio = {
    '@context': 'https://schema.org',
    '@type': p.tipo === 'localizacion' ? ['LocalBusiness', 'EventVenue'] : 'LocalBusiness',
    '@id': `${url}#negocio`,
    name: nombre,
    url,
    description: pub.descripcion || descripcion,
    address: { '@type': 'PostalAddress', ...(pub.poblacion ? { addressLocality: pub.poblacion } : {}), addressRegion: 'Barcelona', addressCountry: 'ES' },
    areaServed: 'Penedès',
    ...(fotos.length ? { image: fotos } : {}),
    memberOf: { '@id': `${SITIO}/#business` },
  };
  const aforo = Math.max(...['aforo_banquete', 'aforo_coctel', 'aforo_teatro'].map(k => Number(p.datos[k]) || 0));
  if (p.tipo === 'localizacion' && aforo > 0) { negocio.maximumAttendeeCapacity = aforo; }
  const servicios = pub.secciones.find(s => s.titulo === 'Servicios');
  if (servicios) {
    negocio.makesOffer = servicios.lista.map(partes => ({
      '@type': 'Offer', itemOffered: { '@type': 'Service', name: partes[0].v,
        ...(partes.find(x => x.l === 'Qué incluye') ? { description: partes.find(x => x.l === 'Qué incluye').v } : {}) },
    }));
  }

  const secciones = pub.secciones.map(s => `
      <section class="partner-ficha__seccion">
        <h2>${esc(s.titulo)}</h2>
        ${s.filas ? `<dl class="partner-ficha__datos">${s.filas.map(f => `<div><dt>${esc(f.l)}</dt><dd>${esc(f.v)}</dd></div>`).join('')}</dl>` : ''}
        ${s.lista ? `<ul class="partner-ficha__lista">${s.lista.map(partes => `<li><strong>${esc(partes[0].v)}</strong>${partes.slice(1).map(x => `<br><span>${esc(x.l)}: ${esc(x.v)}</span>`).join('')}</li>`).join('')}</ul>` : ''}
      </section>`).join('');

  const galeria = fotos.length ? `
      <ul class="partner-ficha__fotos">${fotos.map((f, i) => `<li><img src="${f}" alt="${esc(nombre)} · foto ${i + 1}" loading="${i ? 'lazy' : 'eager'}"></li>`).join('')}</ul>` : '';

  const aviso = !previa ? '' : `
  <div class="wrap"><p class="partner-previa" role="status"><strong>Vista previa.</strong> Así se verá tu página${previa.pendiente ? ' con los cambios que tienes pendientes de validar' : ''}.
    No salen precios, teléfonos, correos ni condiciones.${previa.autoriza === 'si' ? '' : ' No se publicará hasta que en tu ficha autorices publicarla.'}</p></div>`;
  const cuerpo = `${aviso}
  <nav class="crumbs wrap" aria-label="Migas de pan">
    <a href="/">Events Penedès</a> <span aria-hidden="true">/</span> <a href="/partners">Espacios y proveedores</a> <span aria-hidden="true">/</span> <span>${esc(nombre)}</span>
  </nav>
  <section class="hero hero--dj">
    <div class="wrap">
      <p class="eyebrow">${esc(tipo)} · ${esc(lugar)}</p>
      <h1>${esc(nombre)}</h1>
      ${pub.descripcion ? `<p class="lead">${esc(pub.descripcion)}</p>` : ''}
      <div class="hero__actions">
        <a class="btn btn--primary" href="${previa ? '#' : `/partners/${p.codigo}/contacto`}" rel="nofollow">Organizar un evento aquí</a>
        <a class="btn btn--ghost" href="/partners">Ver toda la red</a>
      </div>
    </div>
  </section>
  <section class="section">
    <div class="wrap partner-ficha">${galeria}${secciones}
${bloqueBlog(extra)}
      <p class="form__note">Ficha revisada por Events Penedès. Precios y disponibilidad, bajo petición: escríbenos y te preparamos la propuesta.</p>
    </div>
  </section>${previa ? '' : `
  <script>
    try { fetch('/partners/${p.codigo}/visto', { method: 'POST', keepalive: true }); } catch (e) {}
  </script>`}`;

  return pagina({
    titulo: `${nombre} · ${tipo} en ${lugar} · Events Penedès`,
    descripcion, canonica: url, imagen: fotos[0],
    estructurados: [negocio, migas([['Events Penedès', `${SITIO}/`], ['Espacios y proveedores', `${SITIO}/partners`], [nombre, url]])],
    cuerpo, indexar: !previa,
  });
}

/* Lo que el partner ha contado en el blog y lo que propone en la agenda */
function bloqueBlog({ entrevistas = [], acciones = [] }) {
  return `${acciones.length ? `
      <section class="partner-ficha__seccion">
        <h2>Próximas experiencias</h2>
        <ul class="partner-ficha__lista">${acciones.map(x => `<li><strong>${esc(x.titulo)}</strong><br><span>${esc(cuando(x.inicio, x.fin))}${x.cada_ano ? ' · cada año' : ''}</span>${x.descripcion ? `<br><span>${esc(recorta(x.descripcion, 220))}</span>` : ''}</li>`).join('')}</ul>
        <p><a href="/agenda">Toda la agenda del Penedès</a></p>
      </section>` : ''}${entrevistas.length ? `
      <section class="partner-ficha__seccion">
        <h2>En el blog</h2>
        <ul class="partner-ficha__lista">${entrevistas.map(a => `<li><a href="/blog/${a.slug}">${esc(a.titulo)}</a></li>`).join('')}</ul>
      </section>` : ''}`;
}

/* El blog y la agenda de un partner. Si fallan, la página sale sin ellos. */
async function delBlog(p) {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const [articulos, agenda] = await Promise.all([articulosPublicados(), agendaAprobada()]);
    return {
      entrevistas: articulos.filter(a => a.partner_id === p.id).map(a => ({ titulo: a.titulo, slug: a.slug })),
      acciones: agenda.filter(a => a.partner_id === p.id).map(a => accionPublica(a, hoy)).filter(Boolean)
        .sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 6),
    };
  } catch (e) {
    console.error('partners · blog:', e.message);
    return {};
  }
}

/* La vista previa: solo para quien es del partner o administra, con su
   sesión del portal. Nunca se guarda en la CDN. */
const PRIVADO = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
async function vistaPrevia(req, codigo) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await usuario(token);
  if (!u) { return new Response('Entra en el portal para ver la vista previa', { status: 401, headers: PRIVADO }); }
  const p = await partnerPorCodigo(codigo);
  if (!p || !(await esAdmin(u.id) || await esMiembro(u.id, p.id))) { return new Response('No encontrado', { status: 404, headers: PRIVADO }); }
  const ficha = await fichaEnCurso(p.id);
  if (!ficha) { return new Response('Aún no hay ficha', { status: 404, headers: PRIVADO }); }
  const conDatos = { ...p, datos: ficha.datos };
  const fotos = await Promise.all(fotosDe(conDatos).map(r => firmarFoto(r).catch(() => null)));
  return html(paginaPartner(conDatos, { fotos: fotos.filter(Boolean), pendiente: ficha.pendiente, autoriza: ficha.datos.autoriza }), 200, PRIVADO);
}

function paginaDirectorio(lista) {
  const url = `${SITIO}/partners`;
  const fichas = lista.map(p => ({ p, pub: fichaPublica(FICHAS[p.tipo], p.datos) }));
  const grupo = (tipo, titulo) => {
    const del = fichas.filter(x => x.p.tipo === tipo);
    if (!del.length) { return ''; }
    return `
  <section class="section">
    <div class="wrap">
      <h2>${titulo}</h2>
      <div class="grid grid--3">${del.map(({ p, pub }) => `
        <a class="card card--ruta" href="/partners/${p.codigo}">
          <h3>${esc(pub.nombre || p.nombre)}</h3>
          ${pub.poblacion ? `<p class="eyebrow">${esc(pub.poblacion)}</p>` : ''}
          ${pub.descripcion ? `<p>${esc(recorta(pub.descripcion, 180))}</p>` : ''}
          <p class="card__more">Ver ficha</p>
        </a>`).join('')}
      </div>
    </div>
  </section>`;
  };
  const cuerpo = `
  <nav class="crumbs wrap" aria-label="Migas de pan">
    <a href="/">Events Penedès</a> <span aria-hidden="true">/</span> <span>Espacios y proveedores</span>
  </nav>
  <section class="hero hero--dj">
    <div class="wrap">
      <p class="eyebrow">La red de Events Penedès</p>
      <h1>Espacios y proveedores para eventos en el Penedès</h1>
      <p class="lead">Masías, bodegas, catering, actividades y música con los que trabajamos. Cuéntanos tu evento y lo montamos con ellos.</p>
      <div class="hero__actions"><a class="btn btn--primary" href="/contacto.html">Contactar</a></div>
    </div>
  </section>${grupo('localizacion', 'Espacios')}${grupo('proveedor', 'Proveedores')}`;

  return pagina({
    titulo: 'Espacios y proveedores para eventos en el Penedès · Events Penedès',
    descripcion: 'La red de Events Penedès: masías, bodegas, catering, actividades y música para eventos de empresa en el Alt Penedès.',
    canonica: url,
    indexar: lista.length > 0,
    estructurados: [{
      '@context': 'https://schema.org', '@type': 'CollectionPage', '@id': `${url}#pagina`, url,
      name: 'Espacios y proveedores para eventos en el Penedès', inLanguage: 'es',
      isPartOf: { '@id': `${SITIO}/#website` },
      mainEntity: { '@type': 'ItemList', itemListElement: fichas.map(({ p, pub }, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITIO}/partners/${p.codigo}`, name: pub.nombre || p.nombre })) },
    }],
    cuerpo,
  });
}

function sitemap(lista) {
  const fila = (loc, fecha) => `  <url><loc>${loc}</loc>${fecha ? `<lastmod>${fecha.slice(0, 10)}</lastmod>` : ''}</url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[fila(`${SITIO}/partners`), ...lista.map(p => fila(`${SITIO}/partners/${p.codigo}`, p.actualizada))].join('\n')}
</urlset>
`;
}

/* La página se guarda en la CDN unos minutos: una aprobación tarda eso en verse */
const CACHE = { 'cache-control': 'public, max-age=300', 'netlify-cdn-cache-control': 'public, s-maxage=600, stale-while-revalidate=3600' };
const html = (cuerpo, status = 200, extra = {}) => new Response(cuerpo, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...CACHE, ...extra } });
const noEncontrado = () => new Response('No encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' } });

export default async (req) => {
  const partes = new URL(req.url).pathname.replace(/\/+$/, '').split('/').slice(2);
  if (!configurado()) { return noEncontrado(); }

  /* Visita: lo único que se acepta por POST */
  if (req.method === 'POST') {
    if (partes.length === 2 && partes[1] === 'visto' && CODIGO.test(partes[0])) {
      await sumarImpresion(partes[0], false).catch(e => console.error('partners · visita:', e.message));
      return new Response(null, { status: 204 });
    }
    return new Response('Solo GET', { status: 405 });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { return new Response('Solo GET', { status: 405 }); }

  if (partes.length === 2 && partes[1] === 'previa' && CODIGO.test(partes[0])) {
    try { return await vistaPrevia(req, partes[0]); } catch (e) {
      console.error('partners · previa:', e.message);
      return new Response('La vista previa no está disponible ahora mismo', { status: 503, headers: PRIVADO });
    }
  }

  let lista;
  try { lista = await partnersPublicos(); } catch (e) {
    console.error('partners:', e.message);
    return new Response('El directorio no está disponible ahora mismo', { status: 503, headers: { 'retry-after': '60' } });
  }

  if (partes.length === 0) { return html(paginaDirectorio(lista)); }
  if (partes.length === 1 && partes[0] === 'sitemap.xml') {
    return new Response(sitemap(lista), { headers: { 'content-type': 'application/xml; charset=utf-8', ...CACHE } });
  }
  const codigo = partes[0];
  if (!CODIGO.test(codigo)) { return noEncontrado(); }
  const p = lista.find(x => x.codigo === codigo);
  if (!p) { return noEncontrado(); }

  if (partes.length === 1) { return html(paginaPartner(p, null, await delBlog(p))); }
  if (partes.length === 2 && partes[1] === 'contacto') {
    await sumarImpresion(codigo, true).catch(e => console.error('partners · clic:', e.message));
    return new Response(null, { status: 302, headers: { location: `/contacto.html?ref=${codigo}#escribenos`, 'cache-control': 'no-store' } });
  }
  if (partes.length === 3 && partes[1] === 'foto' && /^\d{1,2}$/.test(partes[2])) {
    const ruta = fotosDe(p)[Number(partes[2]) - 1];
    if (!ruta) { return noEncontrado(); }
    try {
      const r = await foto(ruta);
      return new Response(r.body, { headers: { 'content-type': r.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' } });
    } catch (e) {
      console.error('partners · foto:', e.message);
      return noEncontrado();
    }
  }
  return noEncontrado();
};

export const config = {
  path: ['/partners', '/partners/*'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};

export { paginaPartner, paginaDirectorio, sitemap, fotosDe };
