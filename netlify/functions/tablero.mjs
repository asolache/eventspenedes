/* =============================================================================
   Events Penedès · lectura de Zoho para el tablero interno

   El tablero de mando corre en el ordenador de quien lo usa y necesita leer
   el CRM. Las claves de Zoho y la de los borradores viven aquí, en Netlify,
   marcadas como secretas: no se pueden copiar a otra máquina. Esta función
   las usa sin sacarlas: lee del CRM lo que el tablero pide y le devuelve el
   resultado.

   **Solo lee.** Contra Zoho solo hay GET, y solo de los módulos de la lista.
   No hay ninguna ruta que escriba, borre o cambie nada.

   **Solo con su clave.** Sin `TABLERO_CLAVE` en el entorno del sitio la
   función no existe a efectos prácticos (503). Con ella, cada petición tiene
   que traer `Authorization: Bearer <clave>`; se compara en tiempo constante.
   Lo que devuelve son datos de clientes: no se cachea en ningún sitio.

   Peticiones:
     GET ?estado=1                 ¿llega a Zoho? y si puede abrir borradores
     GET ?ruta=Deals?fields=…      una lectura de la API v2 de Zoho CRM
     GET ?sobre=v1.…               abre el borrador cifrado de una nota

   Variables de entorno (en Netlify, nunca en el repositorio):
     TABLERO_CLAVE        la clave del tablero, 32 caracteres o más
     ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_DC
     PROPUESTA_SECRET     para abrir los borradores
   ========================================================================== */
import { createHash, timingSafeEqual } from 'node:crypto';
import { abrir } from '../propuesta/sobre.mjs';

const CABECERAS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};
const responder = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });

/* Lo único que se puede leer: listas, una ficha y sus notas, de estos cuatro
   módulos. Ni `..`, ni otra versión de la API, ni otros módulos. */
const RUTA = /^(Deals|Accounts|Leads|Contacts)(\/\d{1,25}(\/Notes)?)?(\?[A-Za-z0-9_=,&.-]*)?$/;
const SOBRE = /^v1\.[A-Za-z0-9_\-.]+$/;

const huella = t => createHash('sha256').update(String(t)).digest();
function autorizado(req) {
  const clave = process.env.TABLERO_CLAVE;
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  return Boolean(m) && timingSafeEqual(huella(m[1]), huella(clave));
}

const dc = () => process.env.ZOHO_DC || 'eu';

/* El mismo token que pide la función de leads. Lo que se guarda entre
   llamadas es el de acceso, que caduca en una hora. */
let cache = { token: null, caduca: 0 };
async function accessToken() {
  const ahora = Date.now();
  if (cache.token && ahora < cache.caduca) { return cache.token; }
  const r = await fetch(`https://accounts.zoho.${dc()}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.access_token) { throw new Error(`Zoho no da token (${j.error ?? r.status})`); }
  cache = { token: j.access_token, caduca: ahora + ((j.expires_in || 3600) - 60) * 1000 };
  return cache.token;
}

export default async (req) => {
  if (req.method !== 'GET') { return responder({ error: 'Solo lectura' }, 405); }
  if ((process.env.TABLERO_CLAVE || '').length < 32) { return responder({ error: 'No configurado' }, 503); }
  if (!autorizado(req)) {
    console.warn('tablero: petición sin clave válida');
    return responder({ error: 'No autorizado' }, 401);
  }

  const url = new URL(req.url);
  try {
    if (url.searchParams.has('estado')) {
      await accessToken();
      return responder({ ok: true, dc: dc(), borradores: Boolean(process.env.PROPUESTA_SECRET) });
    }

    const sobre = url.searchParams.get('sobre');
    if (sobre !== null) {
      if (!SOBRE.test(sobre)) { return responder({ error: 'Sobre no válido' }, 400); }
      if (!process.env.PROPUESTA_SECRET) { return responder({ error: 'Falta PROPUESTA_SECRET en Netlify' }, 503); }
      try { return responder(abrir(sobre, process.env.PROPUESTA_SECRET)); }
      catch (e) { return responder({ error: e.message }, e.message === 'enlace caducado' ? 410 : 400); }
    }

    const ruta = url.searchParams.get('ruta') || '';
    if (!RUTA.test(ruta)) { return responder({ error: 'Ruta no permitida' }, 400); }
    const r = await fetch(`https://www.zohoapis.${dc()}/crm/v2/${ruta}`, {
      headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}` },
    });
    /* 204: Zoho no tiene nada que devolver, que no es un error */
    const j = r.status === 204 ? { data: [] } : await r.json().catch(() => ({}));
    return responder(j, r.status === 204 ? 200 : r.status);
  } catch (e) {
    console.error('tablero:', e.message);
    return responder({ error: e.message }, 502);
  }
};

/* Un tope por IP: de sobra para el tablero, que pide unas pocas páginas al
   abrir cada vista, y un freno a quien pruebe claves. */
export const config = {
  path: '/api/tablero',
  method: 'GET',
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
