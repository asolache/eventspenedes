/* =============================================================================
   Events Penedès · Zoho para el tablero interno: leer, y escribir lo justo

   El tablero de mando corre en el ordenador de quien lo usa y necesita leer
   el CRM. Las claves de Zoho y la de los borradores viven aquí, en Netlify,
   marcadas como secretas: no se pueden copiar a otra máquina. Esta función
   las usa sin sacarlas: lee del CRM lo que el tablero pide y le devuelve el
   resultado.

   **Lee, y escribe solo lo de su lista.** Las lecturas son GET de los
   módulos de la lista. Las escrituras son cuatro, las que el tablero hace
   cuando se pulsa un botón, y de cada una solo pasan los campos que lleva:
     · una nota en una oportunidad, un lead, una cuenta o un contacto
     · la etapa, el siguiente paso y la fecha de cierre de una oportunidad
     · el estado de un lead
     · un lead nuevo, dado de alta a mano
   Nada se borra, no se convierte nada y no se toca ningún otro campo. Con
   `TABLERO_ESCRITURA=no` en Netlify, las escrituras se cierran.

   **Solo con su clave.** Sin `TABLERO_CLAVE` en el entorno del sitio la
   función no existe a efectos prácticos (503). Con ella, cada petición tiene
   que traer `Authorization: Bearer <clave>`; se compara en tiempo constante.
   Lo que devuelve son datos de clientes: no se cachea en ningún sitio.

   Peticiones:
     GET ?estado=1                 ¿llega a Zoho? y si puede abrir borradores
     GET ?ruta=Deals?fields=…      una lectura de la API v2 de Zoho CRM
     GET ?sobre=v1.…               abre el borrador cifrado de una nota
     POST { metodo, ruta, datos }  una escritura de la lista

   Variables de entorno (en Netlify, nunca en el repositorio):
     TABLERO_CLAVE        la clave del tablero, 32 caracteres o más
     ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_DC
     PROPUESTA_SECRET     para abrir los borradores
     TABLERO_ESCRITURA    'no' para que el tablero solo pueda leer
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

/* Las únicas escrituras: método, ruta y los campos que pueden llevar */
const ID = '\\d{1,25}';
const ESCRITURAS = [
  ['POST', new RegExp(`^(Deals|Leads|Accounts|Contacts)/${ID}/Notes$`), ['Note_Title', 'Note_Content']],
  ['PUT', new RegExp(`^Deals/${ID}$`), ['Stage', 'Next_Step', 'Closing_Date']],
  ['PUT', new RegExp(`^Leads/${ID}$`), ['Lead_Status']],
  ['POST', /^Leads$/, ['First_Name', 'Last_Name', 'Company', 'Email', 'Phone', 'Lead_Source', 'Description']],
];
/* Los campos que no son de la lista se quitan; los que sí, solo como texto */
function filtrar(campos, datos) {
  const fuera = {};
  for (const c of campos) {
    const v = datos?.[c];
    if (v === null) { fuera[c] = null; } else if (typeof v === 'string') { fuera[c] = v.slice(0, 4000); }
  }
  return fuera;
}

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

async function escribir(req) {
  if (/^(no|0|false)$/i.test(String(process.env.TABLERO_ESCRITURA ?? '').trim())) {
    return responder({ error: 'La escritura está cerrada en Netlify (TABLERO_ESCRITURA=no)' }, 403);
  }
  const texto = await req.text();
  if (texto.length > 20_000) { return responder({ error: 'Demasiado grande' }, 413); }
  let p;
  try { p = JSON.parse(texto); } catch { return responder({ error: 'No es JSON' }, 400); }
  const regla = ESCRITURAS.find(([m, ruta]) => m === p?.metodo && ruta.test(String(p?.ruta ?? '')));
  if (!regla) { return responder({ error: 'Escritura no permitida' }, 400); }
  const datos = filtrar(regla[2], p.datos);
  if (!Object.keys(datos).length) { return responder({ error: 'No hay nada que escribir' }, 400); }
  const r = await fetch(`https://www.zohoapis.${dc()}/crm/v2/${p.ruta}`, {
    method: regla[0],
    headers: { Authorization: `Zoho-oauthtoken ${await accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ data: [datos] }),
  });
  const j = await r.json().catch(() => ({}));
  console.log(`tablero: ${regla[0]} ${p.ruta.replace(/\d+/g, ':id')} → ${r.status}`);
  return responder(j, r.status);
}

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') { return responder({ error: 'Método no permitido' }, 405); }
  if ((process.env.TABLERO_CLAVE || '').length < 32) { return responder({ error: 'No configurado' }, 503); }
  if (!autorizado(req)) {
    console.warn('tablero: petición sin clave válida');
    return responder({ error: 'No autorizado' }, 401);
  }

  const url = new URL(req.url);
  try {
    if (req.method === 'POST') { return await escribir(req); }

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
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
