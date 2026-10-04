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

   **Lo que esta página NO hace:** enviarse. Es para leerla y decidir. El PDF se
   genera en la máquina de Álvaro —Chromium no cabe en una función de Netlify—
   y lo adjunta una persona a un correo que escribe una persona.

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
        'Los borradores caducan a propósito. El briefing sigue guardado: vuelve a montarlo desde tu máquina.', 410);
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

  try {
    const { html } = render({
      ev: evento, opciones, espacios, idioma,
      marca: evento.marca || { modo: 'propia' },
      modo: 'borrador', descartes, avisos,
    });
    return new Response(html, { status: 200, headers: CABECERAS });
  } catch (e) {
    console.error('No se pudo montar el borrador:', e.message);
    return aviso('No se ha podido montar', 'El borrador tiene algo que no encaja. Móntalo desde tu máquina para ver qué.', 500);
  }
};
