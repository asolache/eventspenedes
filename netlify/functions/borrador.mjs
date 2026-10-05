/* =============================================================================
   Events Penedès · la página privada del borrador

   Cuando entra un briefing, el sistema monta la propuesta y deja en la ficha
   del CRM un enlace a esta página. Esto es lo que ese enlace sirve.

   **No hay base de datos.** El evento viaja dentro del propio enlace,
   comprimido y cifrado con `PROPUESTA_SECRET` (ver `netlify/propuesta/sobre.mjs`).
   Eso no es una optimización, es la decisión de privacidad: un borrador lleva
   el nombre, el correo y el teléfono de un cliente, y no se guarda en ningún
   sitio nuevo que luego haya que proteger, respaldar y vaciar a los 24 meses.
   El enlace caduca solo porque la caducidad va firmada dentro, y se revoca
   entero rotando la clave.

   **Lo que esta página NO hace:** enviarse. Es para leerla y decidir. Con
   `&vista=cliente` sirve el documento del cliente, que se retoca en el propio
   navegador y se guarda como PDF desde él —Chromium no cabe en una función de
   Netlify, pero el navegador de quien lo lee ya lo es—. Los retoques no se
   guardan en ningún sitio, y el PDF lo adjunta una persona a un correo que
   escribe una persona.

   Variables de entorno (en Netlify, nunca en el repositorio):
     PROPUESTA_SECRET   la misma que usa la función de leads para cerrar el sobre
   ========================================================================== */
import { abrir } from '../propuesta/sobre.mjs';
import { render, IDIOMAS } from '../propuesta/render-propuesta.mjs';
import { opciones, espacios } from '../propuesta/catalogo.mjs';

/* Una página que no se indexa, no se cachea y no se guarda en el camino.
   `no-store` importa aquí más que en ninguna otra página del sitio: lo que hay
   dentro son datos de un cliente. */
const CABECERAS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
};

const aviso = (titulo, texto, estado) => new Response(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${titulo}</title>
<style>
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#050507;
         color:#f4f4f6; font-family:system-ui,-apple-system,"Segoe UI",sans-serif; padding:1.5rem; }
  div { max-width:30rem; text-align:center; }
  h1 { font-size:1.4rem; margin:0 0 .75rem; color:#d9a441; font-weight:600; }
  p { margin:0; color:#a0a0ae; line-height:1.6; }
</style></head>
<body><div><h1>${titulo}</h1><p>${texto}</p></div></body></html>
`, { status: estado, headers: CABECERAS });

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secreto = process.env.PROPUESTA_SECRET;
  if (!secreto) {
    console.error('Falta PROPUESTA_SECRET: no se puede abrir ningún borrador.');
    return aviso('No configurado', 'Falta la clave en el entorno del sitio.', 503);
  }

  const url = new URL(req.url);
  const sobre = url.searchParams.get('d');
  if (!sobre) { return aviso('Aquí no hay nada', 'Este enlace no lleva ningún borrador.', 404); }

  let carga;
  try {
    carga = abrir(sobre, secreto);
  } catch (e) {
    /* La caducidad sí se dice, porque es la única de las tres que le sirve de
       algo a quien tiene derecho a verlo. Las otras dos —clave distinta o
       sobre tocado— responden lo mismo: aquí no hay nada. */
    if (e.message === 'enlace caducado') {
      return aviso('El enlace ha caducado',
        'Los borradores caducan a propósito. El briefing sigue guardado en la ficha de Zoho y en Netlify.', 410);
    }
    console.error('Sobre que no abre:', e.message);
    return aviso('Aquí no hay nada', 'Este enlace no es válido.', 404);
  }

  const { evento, descartes = [], avisos = [] } = carga || {};
  if (!evento) { return aviso('Aquí no hay nada', 'Este enlace no lleva ningún borrador.', 404); }

  /* El idioma se puede cambiar sobre la marcha: el mismo borrador en catalán o
     en inglés sin volver a generar nada. */
  const pedido = url.searchParams.get('idioma');
  const idioma = IDIOMAS.includes(pedido) ? pedido : (evento.idioma || 'es');

  /* Dos vistas del mismo enlace. La de borrador es para leerla tú, con los
     avisos. La de cliente es el documento que se envía: se puede retocar en el
     navegador y guardar como PDF, sin terminal. Los avisos no se esconden con
     CSS: en la vista de cliente ese HTML no se escribe. */
  const cliente = url.searchParams.get('vista') === 'cliente';
  const marca = { ...(evento.marca || { modo: 'propia' }) };
  const pedidaMarca = url.searchParams.get('marca');
  if (MARCAS.includes(pedidaMarca)) { marca.modo = pedidaMarca; }
  const de = (url.searchParams.get('de') || '').trim().slice(0, 80);
  if (de) { marca.de = de; }
  if (marca.modo !== 'propia' && !marca.de) {
    return aviso('Falta la agencia', 'En marca blanca o coproducida hace falta el nombre de la agencia.', 400);
  }

  try {
    /* El párrafo a medida es lo que vende y no lo escribe la máquina: en la
       vista de cliente se deja su hueco, vacío y editable. Vacío no se imprime. */
    const ev = cliente && !evento.a_medida ? { ...evento, a_medida: HUECO } : evento;
    let { html } = render({
      ev, opciones, espacios, idioma, marca,
      modo: cliente ? 'cliente' : 'borrador', descartes, avisos,
    });
    html = cliente
      ? html.replace(`<p>${HUECO}</p>`, '<p class="a-medida" data-hueco="Escribe aquí el párrafo que responde a lo que pidió el cliente"></p>')
            .replace('<div class="hoja">', '<div class="hoja" contenteditable="true" spellcheck="true">')
            .replace('</body>', barraCliente(url, idioma, marca) + '</body>')
      : html.replace('</body>', barraBorrador(url, idioma) + '</body>');
    return new Response(html, { status: 200, headers: CABECERAS });
  } catch (e) {
    console.error('No se pudo montar el borrador:', e.message);
    return aviso('No se ha podido montar', 'El borrador tiene algo que no encaja. Móntalo desde tu máquina para ver qué.', 500);
  }
};

/* --- Las barras ------------------------------------------------------------
   Solo botones y enlaces: no llevan ningún dato del cliente, así que ocultarlas
   al imprimir con CSS no deja nada dentro del PDF. */

const MARCAS = ['propia', 'coproducida', 'blanca'];
const HUECO = '\u2063';

const ESTILO_BARRA = `<style>
  .barra { position:fixed; left:0; right:0; bottom:0; z-index:10; display:flex; flex-wrap:wrap; gap:.5rem 1rem;
           align-items:center; padding:.75rem 1rem; background:#050507; color:#f4f4f6;
           font:14px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif; }
  .barra a, .barra button { color:#050507; background:#d9a441; border:0; border-radius:6px; padding:.45rem .8rem;
           font:inherit; font-weight:600; text-decoration:none; cursor:pointer; }
  .barra a.suave { background:transparent; color:#d9a441; padding:.45rem .2rem; font-weight:400; }
  .barra a.activo { text-decoration:underline; }
  .barra select, .barra input { font:inherit; padding:.35rem .5rem; border-radius:6px; border:1px solid #555; }
  .barra small { color:#a0a0ae; flex-basis:100%; }
  body { padding-bottom:7rem; }
  .a-medida:empty::before { content:attr(data-hueco); color:#a0a0ae; font-style:italic; }
  .a-medida:empty { border:1px dashed #d9a441; padding:.6rem; }
  @media print { .barra { display:none; } body { padding-bottom:0; }
                 .a-medida:empty { display:none; } }
</style>`;

const enlace = (url, cambios) => {
  const u = new URL(url);
  for (const [k, v] of Object.entries(cambios)) {
    if (v === null) { u.searchParams.delete(k); } else { u.searchParams.set(k, v); }
  }
  return u.pathname + u.search;
};
const escA = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function barraBorrador(url, idioma) {
  return `${ESTILO_BARRA}<div class="barra">
  <a href="${escA(enlace(url, { vista: 'cliente' }))}">Preparar la versión para el cliente</a>
  ${['es', 'ca', 'en'].map(i => `<a class="suave${i === idioma ? ' activo' : ''}" href="${escA(enlace(url, { idioma: i }))}">${i}</a>`).join('')}
  <small>Esto es el borrador con los avisos. La versión para el cliente se puede retocar y guardar como PDF.</small>
</div>`;
}

function barraCliente(url, idioma, marca) {
  const base = new URL(url);
  const ocultos = ['d', 'vista'].map(k => base.searchParams.get(k) === null ? ''
    : `<input type="hidden" name="${k}" value="${escA(base.searchParams.get(k))}">`).join('');
  return `${ESTILO_BARRA}<form class="barra" method="get" action="/p" onsubmit="return confirm('Al cambiar idioma o marca se pierden los retoques. ¿Seguir?')">
  ${ocultos}
  <button type="button" onclick="window.print()">Guardar PDF</button>
  <select name="idioma" aria-label="Idioma">${['es', 'ca', 'en'].map(i => `<option${i === idioma ? ' selected' : ''}>${i}</option>`).join('')}</select>
  <select name="marca" aria-label="Marca">${MARCAS.map(m => `<option${m === marca.modo ? ' selected' : ''}>${m}</option>`).join('')}</select>
  <input name="de" placeholder="Agencia (marca blanca)" value="${escA(marca.de || '')}" aria-label="Agencia">
  <button type="submit">Aplicar</button>
  <a class="suave" href="${escA(enlace(url, { vista: null }))}">Volver al borrador</a>
  <small>Elige idioma y marca primero. Luego haz clic en cualquier texto para cambiarlo y pulsa «Guardar PDF» (en el diálogo, «Guardar como PDF» y sin encabezados). Los retoques no se guardan en ningún sitio: se pierden al recargar.</small>
</form>`;
}
