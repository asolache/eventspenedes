/* =============================================================================
   Events Penedès · lectura de B2Brouter para el tablero interno

   La hermana de `tablero.mjs`, para la facturación. La clave de B2Brouter vive
   aquí, en Netlify, marcada como secreta. El tablero, que corre en el
   ordenador de quien lo usa, pide las facturas a esta función con su propia
   clave y nunca ve la de B2Brouter.

   **Solo lee.** Contra B2Brouter solo hay GET, y solo de las facturas de la
   cuenta configurada. No hay ninguna ruta que emita, cambie o borre nada.

   **Solo con su clave.** Sin `TABLERO_CLAVE` (32 caracteres o más) responde
   503. Con ella, cada petición trae `Authorization: Bearer <clave>`, que se
   compara en tiempo constante. Lo que devuelve son datos de clientes: no se
   cachea en ningún sitio.

   Peticiones:
     GET ?estado=1                       ¿llega a B2Brouter? ¿es el sandbox?
     GET ?ruta=invoices?type=…&limit=…   la lista de facturas de la cuenta
     GET ?ruta=invoices/123              una factura

   Variables de entorno (en Netlify, nunca en el repositorio):
     TABLERO_CLAVE          la clave del tablero, la misma que usa tablero.mjs
     B2BROUTER_API_KEY      Developers → API Keys. Si empieza por test_, es el
                            sandbox: misma URL, sin tocar la cuenta real
     B2BROUTER_CUENTA       el id de la cuenta
     B2BROUTER_API_BASE     por defecto https://api.b2brouter.net
     B2BROUTER_API_VERSION  por defecto 2026-06-26
     B2BROUTER_WEB          por defecto https://app.b2brouter.net (enlaces)
   ========================================================================== */
import { createHash, timingSafeEqual } from 'node:crypto';

const CABECERAS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};
const responder = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });

/* Lo único que se puede leer: la lista de facturas o una factura, siempre de
   la cuenta configurada. La cuenta no la elige quien pregunta. */
const RUTA = /^invoices(\/\d{1,20})?(\?[A-Za-z0-9_=,&.-]*)?$/;

const huella = t => createHash('sha256').update(String(t)).digest();
function autorizado(req) {
  const clave = process.env.TABLERO_CLAVE;
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  return Boolean(m) && timingSafeEqual(huella(m[1]), huella(clave));
}

const api = () => (process.env.B2BROUTER_API_BASE || 'https://api.b2brouter.net').replace(/\/$/, '');
const version = () => process.env.B2BROUTER_API_VERSION || '2026-06-26';
const web = () => (process.env.B2BROUTER_WEB || 'https://app.b2brouter.net').replace(/\/$/, '');
const sandbox = () => String(process.env.B2BROUTER_API_KEY).startsWith('test_');

async function leer(ruta) {
  const [camino, consulta] = ruta.split('?');
  const cuenta = encodeURIComponent(process.env.B2BROUTER_CUENTA);
  const r = await fetch(`${api()}/accounts/${cuenta}/${camino}${consulta ? '?' + consulta : ''}`, {
    headers: {
      'X-B2B-API-Key': process.env.B2BROUTER_API_KEY,
      'X-B2B-API-Version': version(),
      accept: 'application/json',
    },
  });
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
}

export default async (req) => {
  if (req.method !== 'GET') { return responder({ error: 'Solo lectura' }, 405); }
  if ((process.env.TABLERO_CLAVE || '').length < 32) { return responder({ error: 'No configurado' }, 503); }
  if (!autorizado(req)) {
    console.warn('tablero-b2b: petición sin clave válida');
    return responder({ error: 'No autorizado' }, 401);
  }
  if (!process.env.B2BROUTER_API_KEY || !process.env.B2BROUTER_CUENTA) {
    return responder({ error: 'Faltan B2BROUTER_API_KEY y B2BROUTER_CUENTA en Netlify' }, 503);
  }

  const url = new URL(req.url);
  try {
    if (url.searchParams.has('estado')) {
      const r = await leer('invoices?limit=1');
      return responder({ ok: r.estado === 200, sandbox: sandbox(), web: web(), ...(r.estado === 200 ? {} : { error: r.datos }) },
        r.estado === 200 ? 200 : 502);
    }

    const ruta = url.searchParams.get('ruta') || '';
    if (!RUTA.test(ruta)) { return responder({ error: 'Ruta no permitida' }, 400); }
    const r = await leer(ruta);
    return responder(r.datos, r.estado);
  } catch (e) {
    console.error('tablero-b2b:', e.message);
    return responder({ error: e.message }, 502);
  }
};

/* El mismo tope que la lectura de Zoho */
export const config = {
  path: '/api/tablero-b2b',
  method: 'GET',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
