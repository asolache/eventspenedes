/* =============================================================================
   Events Penedès · las páginas públicas de los partners

   Cada espacio o proveedor de la red con la ficha aprobada y autorizada para
   publicarse tiene su página, y todos juntos forman el directorio:

     GET  /partners                    el directorio (espacios y proveedores)
     GET  /partners/<código>           la página de un partner
     GET  /partners/<código>/foto/<n>  la foto n de su ficha aprobada
     GET  /partners/<código>/contacto  cuenta el clic y lleva a /contacto con
                                       el código: el lead queda trazado
     GET  /partners/<código>/reservar  igual, pero al formulario de propuesta
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
import { fichaPublica, redPublica } from '../ficha/publica.mjs';
import { configurado, articulosPublicados, agendaAprobada, partnersPublicos, partnerPorCodigo, sumarImpresion, foto, firmarFoto, fichaEnCurso, usuario, esAdmin, esMiembro } from '../portal/supabase.mjs';
import { pagina, migas, esc, recorta, BARRA_SELECCION } from '../portal/pagina.mjs';
import { accionPublica, cuando } from '../../js/blog-comun.js';
import { alPortal } from '../portal/entrada.mjs';

const SITIO = 'https://eventspenedes.com';
const CODIGO = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
const MAX_FOTOS = 12;

const TIPO_LEGIBLE = { localizacion: 'Espacio para eventos', proveedor: 'Proveedor de eventos' };

/* Las fotos publicables: rutas de su carpeta, en la ficha aprobada */
const fotosDe = p => (Array.isArray(p.datos.imagenes) ? p.datos.imagenes : [])
  .filter(r => typeof r === 'string' && r.startsWith(`${p.id}/`)).slice(0, MAX_FOTOS);

/* Lo que se lee de la ficha pública por el nombre del campo: así la página no
   depende de cómo está escrito un rótulo. Todo sale de `fichaPublica()`. */
const filaDe = (pub, n) => {
  for (const s of pub.secciones) { const f = (s.filas || []).find(x => x.n === n); if (f) { return f; } }
  return null;
};
const cifra = (pub, n) => { const f = filaDe(pub, n); return f && /^\d+$/.test(f.v) ? Number(f.v) : 0; };
const seccionDe = (pub, id) => pub.secciones.find(s => s.id === id);

/* Lo esencial, en cifras: lo primero que mira quien organiza un evento.
   `v` la cifra, `l` lo que es y `corto` cómo se dice en una tarjeta. */
function hechosDe(tipo, pub) {
  const h = [];
  const plural = (n, uno, varios) => (n === 1 ? uno : varios);
  if (tipo === 'localizacion') {
    const aforos = [['aforo_banquete', 'sentados'], ['aforo_coctel', 'de pie'], ['aforo_teatro', 'en teatro']]
      .map(([n, como]) => [cifra(pub, n), como]).filter(([n]) => n > 0);
    const max = Math.max(0, ...aforos.map(([n]) => n));
    if (max) { h.push({ v: String(max), l: 'personas como máximo', d: aforos.map(([n, como]) => `${n} ${como}`).join(' · '), corto: `Hasta ${max} personas` }); }
    const salas = (seccionDe(pub, 'salas')?.lista || []).length;
    if (salas) { h.push({ v: String(salas), l: plural(salas, 'sala o espacio', 'salas y espacios'), corto: `${salas} ${plural(salas, 'sala', 'salas')}` }); }
    const min = cifra(pub, 'minutos_bcn');
    if (min) { h.push({ v: `${min} min`, l: 'desde Barcelona', corto: `${min} min de Barcelona` }); }
    const dormir = cifra(pub, 'plazas');
    if (dormir) { h.push({ v: String(dormir), l: 'plazas para dormir', corto: `${dormir} plazas para dormir` }); }
    const parking = cifra(pub, 'parking');
    if (parking) { h.push({ v: String(parking), l: 'plazas de aparcamiento', corto: `${parking} plazas de parking` }); }
  } else {
    const max = Math.max(0, ...['catering_pax_max', 'actividad_pax_max', 'cata_pax_max', 'transporte_plazas'].map(n => cifra(pub, n)));
    if (max) { h.push({ v: String(max), l: 'personas como máximo', corto: `Hasta ${max} personas` }); }
    const servicios = (seccionDe(pub, 'servicios')?.lista || []).length;
    if (servicios) { h.push({ v: String(servicios), l: plural(servicios, 'servicio', 'servicios'), corto: `${servicios} ${plural(servicios, 'servicio', 'servicios')}` }); }
    const idiomas = filaDe(pub, 'idiomas');
    if (idiomas?.vs?.length) { h.push({ v: String(idiomas.vs.length), l: plural(idiomas.vs.length, 'idioma', 'idiomas'), d: idiomas.v, corto: idiomas.v }); }
    const zona = filaDe(pub, 'zona');
    if (zona) { h.push({ v: zona.v, l: 'dónde trabaja', corto: zona.v, texto: true }); }
  }
  return h.slice(0, 4);
}

/* Qué se puede hacer: las casillas de lo que ofrece, sin repetir */
const QUE_HACER = ['eventos', 'cata_tipos', 'actividad_tipos', 'catering_formatos', 'cata_productos', 'musica_formatos', 'imagen_servicios', 'transporte_vehiculos', 'tecnica_equipos', 'extras'];
function queHacerDe(pub) {
  const xs = [];
  for (const n of QUE_HACER) { for (const v of filaDe(pub, n)?.vs || []) { if (!xs.includes(v)) { xs.push(v); } } }
  return xs.slice(0, 16);
}

/* La frase de arriba: la primera de la descripción, si la descripción es larga */
function entradilla(texto) {
  if (!texto) { return { frase: '', resto: '' }; }
  if (texto.length <= 200) { return { frase: texto, resto: '' }; }
  const m = texto.match(/^(.{20,200}?[.!?])\s/s);
  return m ? { frase: m[1], resto: texto } : { frase: recorta(texto, 180), resto: texto };
}

/* El botón de la cesta: el mismo de la portada (js/site.js lo pinta y lo
   guarda en `ep-seleccion`). En la vista previa no hace nada. */
function botonCesta(id, nombre, { previa, oculto = '', clase = '', textos = ['Añadir a mi selección', 'En tu selección'] }) {
  /* `oculto`: lo que lee un lector de pantalla detrás del texto visible, para
     que «Añadir» diga qué añade */
  const extra = oculto ? `<span class="visually-hidden">: ${esc(oculto)}</span>` : '';
  return previa
    ? `<button type="button" class="interes ${clase}" disabled><span class="interes__no">${textos[0]}</span>${extra}</button>`
    : `<button type="button" class="interes ${clase}" data-interes="${esc(id)}" data-nombre="${esc(nombre)}" aria-pressed="false"><span class="interes__no">${textos[0]}</span><span class="interes__si">${textos[1]}</span>${extra}</button>`;
}

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
  const clase = filaDe(pub, p.tipo === 'localizacion' ? 'tipo' : 'categoria')?.v;
  const lugar = pub.poblacion ? `${pub.poblacion}, Penedès` : 'Penedès';
  const descripcion = recorta(pub.descripcion || `${nombre}: ${tipo.toLowerCase()} en ${lugar}, en la red de Events Penedès.`, 155);
  const hechos = hechosDe(p.tipo, pub);
  const queHacer = queHacerDe(pub);
  const { frase, resto } = entradilla(pub.descripcion);
  const idPartner = `partner:${p.codigo}`;

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
  const aforo = Math.max(...['aforo_banquete', 'aforo_coctel', 'aforo_teatro'].map(n => cifra(pub, n)));
  if (p.tipo === 'localizacion' && aforo > 0) { negocio.maximumAttendeeCapacity = aforo; }
  const servicios = seccionDe(pub, 'servicios');
  if (servicios) {
    negocio.makesOffer = servicios.lista.map(partes => ({
      '@type': 'Offer', itemOffered: { '@type': 'Service', name: partes[0].v,
        ...(partes.find(x => x.n === 'incluye') ? { description: partes.find(x => x.n === 'incluye').v } : {}) },
    }));
  }

  /* La galería: la primera foto grande y hasta cuatro al lado (la quinta
     dice cuántas más hay); en el móvil, una tira que se desliza con el dedo
     con todas */
  const galeria = fotos.length ? `
    <section class="pficha__galeria" aria-label="Fotos de ${esc(nombre)}">
      <ul class="pgal pgal--${Math.min(fotos.length, 5)}" tabindex="0" aria-label="${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}">${fotos.map((f, i) => `
        <li${i === 4 && fotos.length > 5 ? ` data-mas="+${fotos.length - 5} ${fotos.length === 6 ? 'foto' : 'fotos'}"` : ''}><a href="${esc(f)}" target="_blank" rel="noopener"><img src="${esc(f)}" alt="${esc(nombre)} · foto ${i + 1} de ${fotos.length}" loading="${i < 5 ? 'eager' : 'lazy'}"${i ? '' : ' fetchpriority="high"'}></a></li>`).join('')}
      </ul>
    </section>` : '';

  /* La caja de acciones: a un lado en el escritorio, siempre a la vista */
  const reservar = previa ? '#' : `/partners/${p.codigo}/reservar`;
  const datosReserva = previa ? '' : ` data-reservar="${esc(idPartner)}" data-nombre="${esc(nombre)}"`;
  const caja = `
    <aside class="pficha__caja" aria-labelledby="caja-titulo">
      <p class="eyebrow">Organiza tu evento aquí</p>
      <h2 id="caja-titulo" class="pficha__caja-nombre">${esc(nombre)}</h2>
      <p class="pficha__caja-linea">${esc([clase || tipo, pub.poblacion, hechos[0]?.corto].filter(Boolean).join(' · '))}</p>
      <div class="pficha__caja-acciones">
        ${botonCesta(idPartner, nombre, { previa, clase: 'interes--grande' })}
        <a class="btn btn--primary pficha__reservar" href="${reservar}" rel="nofollow"${datosReserva}>Reservar / pedir fecha</a>
      </div>
      <ul class="pficha__garantias">
        <li>Sin compromiso: te preparamos la propuesta con este ${p.tipo === 'localizacion' ? 'espacio' : 'proveedor'}.</li>
        <li>Precio y disponibilidad para tu fecha, bajo petición.</li>
        <li>Un solo interlocutor para todo el evento.</li>
      </ul>
      <p class="pficha__caja-pie"><a href="${previa ? '#' : `/partners/${p.codigo}/contacto`}" rel="nofollow">Hacer una pregunta</a></p>
    </aside>`;

  /* Lo que se puede reservar por separado: salas o servicios, cada uno con su
     botón de la cesta */
  const opciones = s => {
    if (!s || !s.lista?.length) { return ''; }
    const pref = s.id === 'salas' ? 'sala' : 'servicio';
    return `
      <section class="pficha__bloque" aria-labelledby="t-${s.id}">
        <h2 id="t-${s.id}">${s.id === 'salas' ? 'Salas y espacios' : 'Servicios'}</h2>
        <ul class="popciones">${s.lista.map((partes, i) => {
          const titulo = partes[0].v;
          return `
          <li><article class="popcion">
            <h3>${esc(titulo)}</h3>${partes.length > 1 ? `
            <dl class="popcion__datos">${partes.slice(1).map(x => `<div><dt>${esc(x.l)}</dt><dd>${esc(x.v)}</dd></div>`).join('')}</dl>` : ''}
            ${botonCesta(`${idPartner}:${pref}-${i + 1}`, `${titulo} · ${nombre}`, { previa, oculto: titulo, textos: ['Añadir', 'Añadido'] })}
          </article></li>`;
        }).join('')}
        </ul>
      </section>`;
  };

  const bloqueHechos = hechos.length ? `
      <section class="pficha__bloque" aria-labelledby="t-esencial">
        <h2 id="t-esencial" class="visually-hidden">Lo esencial</h2>
        <ul class="phechos">${hechos.map(x => `
          <li${x.texto ? ' class="phechos__texto"' : ''}><span class="phechos__v">${esc(x.v)}</span><span class="phechos__l">${esc(x.l)}</span>${x.d ? `<span class="phechos__d">${esc(x.d)}</span>` : ''}</li>`).join('')}
        </ul>
      </section>` : '';

  const actividades = filaDe(pub, 'actividades')?.v;
  const bloqueQueHacer = queHacer.length || actividades ? `
      <section class="pficha__bloque" aria-labelledby="t-hacer">
        <h2 id="t-hacer">${p.tipo === 'localizacion' ? 'Qué puedes hacer aquí' : 'Qué ofrece'}</h2>
        ${queHacer.length ? `<ul class="pchips">${queHacer.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
        ${actividades ? `<p>${esc(actividades)}</p>` : ''}
      </section>` : '';

  const bloqueSobre = resto ? `
      <section class="pficha__bloque" aria-labelledby="t-sobre">
        <h2 id="t-sobre">Sobre ${esc(nombre)}</h2>
        <p class="pficha__texto">${esc(resto)}</p>
      </section>` : '';

  /* La ficha técnica: todo lo demás, como la de un producto */
  const tecnica = pub.secciones.filter(s => s.filas && !['fotos', 'publicacion'].includes(s.id));
  const bloqueTecnica = tecnica.length ? `
      <section class="pficha__bloque" aria-labelledby="t-tecnica">
        <h2 id="t-tecnica">Ficha técnica</h2>
        <div class="pspecs">${tecnica.map(s => `
          <div class="pspecs__grupo">
            <h3>${esc(s.titulo)}</h3>
            <dl>${s.filas.map(f => `<div><dt>${esc(f.l)}</dt><dd>${esc(f.v)}</dd></div>`).join('')}</dl>
          </div>`).join('')}
        </div>
      </section>` : '';

  const red = bloqueRed(redPublica(p.red, { previa: Boolean(previa) }), nombre);

  const aviso = !previa ? '' : `
  <div class="wrap"><p class="partner-previa" role="status"><strong>Vista previa.</strong> Así se verá tu página${previa.pendiente ? ' con los cambios que tienes pendientes de validar' : ''}.
    No salen precios, teléfonos, correos ni condiciones.${previa.autoriza === 'si' ? '' : ' No se publicará hasta que en tu ficha autorices publicarla.'}</p></div>`;
  const cuerpo = `${aviso}
  <nav class="crumbs wrap" aria-label="Migas de pan">
    <a href="/">Events Penedès</a> <span aria-hidden="true">/</span> <a href="/partners">Espacios y proveedores</a> <span aria-hidden="true">/</span> <span>${esc(nombre)}</span>
  </nav>
  <div class="wrap pficha${fotos.length ? '' : ' pficha--sin-fotos'}">
    <header class="pficha__cabeza">
      <p class="eyebrow">${esc(clase || tipo)} · ${esc(lugar)}</p>
      <h1>${esc(nombre)}</h1>
      ${frase ? `<p class="lead">${esc(frase)}</p>` : ''}
      ${hechos.length ? `<p class="pficha__resumen">${hechos.slice(0, 3).map(x => `<span>${esc(x.corto)}</span>`).join('')}</p>` : ''}
    </header>${galeria}${caja}
    <div class="pficha__cuerpo">${bloqueHechos}${bloqueQueHacer}${bloqueSobre}${opciones(seccionDe(pub, 'salas'))}${opciones(servicios)}${red}${bloqueTecnica}
${bloqueBlog(extra, { previa, nombre })}
      <p class="form__note">Ficha revisada por Events Penedès. Precios y disponibilidad, bajo petición: añade lo que te interese a tu selección y te preparamos la propuesta.</p>
    </div>
  </div>
  <div class="pficha__barra" role="region" aria-label="Reservar ${esc(nombre)}">
    ${botonCesta(idPartner, nombre, { previa, textos: ['Añadir', 'En tu selección'] })}
    <a class="btn btn--primary" href="${reservar}" rel="nofollow"${datosReserva}>Reservar / pedir fecha</a>
  </div>${previa ? '' : `
${BARRA_SELECCION}
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

/* Su lugar en la red: qué rol cumple en el flujo de valor de un evento, qué
   aporta, qué recibe y a quién sirve */
function bloqueRed(r, nombre) {
  if (!r) { return ''; }
  const col = (titulo, xs) => (xs.length ? `
          <div class="partner-red__col"><h3>${titulo}</h3><ul>${xs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '');
  return `
      <section class="partner-ficha__seccion partner-red" aria-labelledby="red-titulo">
        <p class="eyebrow">${r.propuesta ? 'Propuesta, pendiente de aprobar · ' : ''}Su lugar en la red</p>
        <h2 id="red-titulo">${r.rol ? esc(r.rol) : `${esc(nombre)} en la red`}</h2>
        <div class="partner-red__flujo">${col('Lo que aporta al evento', r.aporta)}${col('Lo que recibe de la red', r.recibe)}${col('Para quién', r.para)}
        </div>
      </section>`;
}

/* Lo que el partner ha contado en el blog y lo que propone en la agenda.
   Cada experiencia de la agenda se puede añadir a la selección. */
function bloqueBlog({ entrevistas = [], acciones = [] }, { previa = null, nombre = '' } = {}) {
  return `${acciones.length ? `
      <section class="pficha__bloque" aria-labelledby="t-agenda">
        <h2 id="t-agenda">Próximas experiencias</h2>
        <ul class="popciones">${acciones.map(x => {
          const fecha = `${cuando(x.inicio, x.fin)}${x.cada_ano ? ' · cada año' : ''}`;
          return `
          <li><article class="popcion">
            <h3>${esc(x.titulo)}</h3>
            <p class="popcion__fecha">${esc(fecha)}</p>${x.descripcion ? `
            <p>${esc(recorta(x.descripcion, 220))}</p>` : ''}
            ${botonCesta(`agenda:${x.id}`, `${x.titulo} (${cuando(x.inicio, x.fin)}) · ${nombre}`, { previa, oculto: x.titulo, textos: ['Añadir', 'Añadido'] })}
          </article></li>`;
        }).join('')}
        </ul>
        <p><a href="/agenda">Toda la agenda del Penedès</a></p>
      </section>` : ''}${entrevistas.length ? `
      <section class="pficha__bloque" aria-labelledby="t-blog">
        <h2 id="t-blog">En el blog</h2>
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
  <section class="section section--pdir" aria-labelledby="t-${tipo}">
    <div class="wrap">
      <h2 id="t-${tipo}">${titulo}</h2>
      <ul class="pdir">${del.map(({ p, pub }) => {
        const nombre = pub.nombre || p.nombre;
        const clase = filaDe(pub, tipo === 'localizacion' ? 'tipo' : 'categoria')?.v;
        const hechos = hechosDe(p.tipo, pub).slice(0, 2);
        const enlace = `/partners/${p.codigo}`;
        return `
        <li><article class="pcard">
          ${fotosDe(p).length
            ? `<a class="pcard__foto" href="${enlace}" tabindex="-1" aria-hidden="true"><img src="${enlace}/foto/1" alt="" loading="lazy"></a>`
            : `<a class="pcard__foto pcard__foto--vacia" href="${enlace}" tabindex="-1" aria-hidden="true"><span>${esc(nombre.slice(0, 1))}</span></a>`}
          <div class="pcard__cuerpo">
            <p class="eyebrow">${esc([clase, pub.poblacion].filter(Boolean).join(' · ') || TIPO_LEGIBLE[tipo])}</p>
            <h3><a href="${enlace}">${esc(nombre)}</a></h3>
            ${hechos.length ? `<p class="pcard__hechos">${hechos.map(x => `<span>${esc(x.corto)}</span>`).join('')}</p>` : ''}
            ${pub.descripcion ? `<p class="pcard__texto">${esc(recorta(pub.descripcion, 150))}</p>` : ''}
            <div class="pcard__acciones">
              ${botonCesta(`partner:${p.codigo}`, nombre, { previa: null, oculto: nombre })}
              <a class="pcard__ver" href="${enlace}">Ver ficha<span class="visually-hidden"> de ${esc(nombre)}</span></a>
            </div>
          </div>
        </article></li>`;
      }).join('')}
      </ul>
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
      <p class="lead">Masías, bodegas, catering, actividades y música con los que trabajamos. Añade a tu selección lo que te encaje y te preparamos la propuesta con ellos.</p>
      <div class="hero__actions"><a class="btn btn--primary" href="/propuesta#briefing">Pedir propuesta</a><a class="btn btn--ghost" href="/contacto.html">Contactar</a></div>
    </div>
  </section>${grupo('localizacion', 'Espacios')}${grupo('proveedor', 'Proveedores')}
${BARRA_SELECCION}`;

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
  const fuera = alPortal(req);
  if (fuera) { return fuera; }
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
  /* «Reservar / pedir fecha»: cuenta el clic igual que el contacto y lleva al
     formulario de propuesta con su código (el lead queda trazado) y, si es un
     espacio, marcado en el desplegable cuando lo tiene. La página ya lo ha
     puesto en la selección. */
  if (partes.length === 2 && partes[1] === 'reservar') {
    await sumarImpresion(codigo, true).catch(e => console.error('partners · reservar:', e.message));
    const q = new URLSearchParams({ ref: codigo, ...(p.tipo === 'localizacion' ? { espacio: codigo } : {}) });
    return new Response(null, { status: 302, headers: { location: `/propuesta.html?${q}#briefing`, 'cache-control': 'no-store' } });
  }
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
