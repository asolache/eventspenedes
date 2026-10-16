/* =============================================================================
   Events Penedès · cuenta los clics en los botones que llevan a pedir algo

   La analítica de Netlify cuenta páginas vistas, pero no si alguien pulsó
   «Pedir propuesta» o «Reservar una llamada». El navegador manda aquí, con
   sendBeacon, qué botón (`data-clic`) y en qué página. No hay cookies ni se
   guarda nada de la persona: solo una línea en el registro de la función, que
   se lee en Netlify Observability (filtrando por la función «clic»).
   ========================================================================== */

const BOTON = /^[a-z0-9-]{1,40}$/;
const PAGINA = /^\/[a-z0-9\-./]{0,100}$/i;

export function leerClic(texto) {
  let datos;
  try { datos = JSON.parse(texto); } catch { return null; }
  if (!datos || typeof datos !== 'object') return null;
  const boton = String(datos.b || '');
  const pagina = String(datos.p || '/');
  if (!BOTON.test(boton) || !PAGINA.test(pagina)) return null;
  return { boton, pagina };
}

export default async (req) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 });
  const clic = leerClic((await req.text()).slice(0, 500));
  if (!clic) return new Response(null, { status: 400 });
  console.log(JSON.stringify({ clic: clic.boton, pagina: clic.pagina }));
  return new Response(null, { status: 204 });
};

export const config = {
  path: '/api/clic',
  method: 'POST',
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
