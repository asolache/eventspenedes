/* =============================================================================
   Events Penedès · una llamada a Claude desde las funciones del sitio

   Dos caminos, según lo que haya en el entorno de Netlify:

     directo    una ANTHROPIC_API_KEY propia, contra api.anthropic.com. Se pide
                el modelo de reserva del servidor (`fallbacks`), que va detrás
                de una cabecera beta: si el modelo está saturado, responde otro.
     pasarela   la AI Gateway de Netlify pone ANTHROPIC_API_KEY y
                ANTHROPIC_BASE_URL solas, y cobra en créditos al precio de la
                API. No deja pasar cabeceras beta, así que por ahí no se pide
                nada que dependa de una: la API rechaza entera la petición que
                lleva un campo beta sin su cabecera.

   El workspace, en el camino directo. Una clave ligada a una persona o a una
   cuenta de servicio que no es de un solo workspace tiene que decir en cada
   petición en cuál actúa (cabecera `anthropic-workspace-id`); si no, la API
   responde 400. Sale de ANTHROPIC_WORKSPACE_ID. Sin ella, la primera vez que
   la API lo pide se busca con la misma clave el workspace por defecto de la
   organización y se repite la petición (`pedir`). Una clave de un solo
   workspace no lo necesita y no lo lleva.

   Lo que cuesta cada llamada sale de `coste.mjs` con el modelo que de verdad
   ha respondido y lo que ha gastado: es lo que se apunta para medir, y un día
   cobrar, el uso de la IA.
   ========================================================================== */
import { coste } from '../ficha/coste.mjs';

export const API = 'https://api.anthropic.com';
export const MODELO = 'claude-opus-5-5';

export const base = () => (process.env.ANTHROPIC_BASE_URL || API).replace(/\/+$/, '');

/* ¿Vamos contra la API de Anthropic, sin intermediarios? */
export const directo = () => base() === API;

/* El workspace que se ha encontrado para la clave (ver `pedir`) */
let encontrado = null;
const workspace = () => (directo() ? process.env.ANTHROPIC_WORKSPACE_ID || encontrado : null);

export const cabeceras = apiKey => ({
  'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
  ...(workspace() ? { 'anthropic-workspace-id': workspace() } : {}),
});

/* Una petición a la API con la clave y su workspace. Si la API pide el
   workspace y no se ha dicho cuál, lo busca una vez y la repite. Devuelve la
   respuesta tal cual; lanza si no hay manera de saber el workspace. */
export async function pedir(ruta, { apiKey, fetch = globalThis.fetch, espera, headers = {}, ...op } = {}) {
  const una = () => fetch(`${base()}${ruta}`, {
    ...op, headers: { ...cabeceras(apiKey), ...headers }, ...(espera ? { signal: AbortSignal.timeout(espera) } : {}),
  });
  const r = await una();
  if (r.status !== 400 || !directo() || workspace()) { return r; }
  const j = await r.clone().json().catch(() => ({}));
  if (!/anthropic-workspace-id/.test(j.error?.message || '')) { return r; }
  encontrado = await porDefecto(apiKey, fetch);
  return una();
}

/* El workspace por defecto de la organización. La lista no lo marca: es el
   que sale con `include_default` y no sin él. La API de administración
   admite la misma clave precisamente porque no es de un solo workspace. */
async function porDefecto(apiKey, fetch) {
  const ids = async conDefecto => {
    const r = await fetch(`${API}/v1/organizations/workspaces?limit=1000${conDefecto ? '&include_default=true' : ''}`, {
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(j.data)) { throw sinWorkspace(`error ${r.status}`); }
    return j.data.map(w => w.id);
  };
  const [todos, otros] = await Promise.all([ids(true), ids(false)]);
  const id = todos.find(x => !otros.includes(x));
  if (!id) { throw sinWorkspace('la lista no trae el de por defecto'); }
  return id;
}

/* POST /v1/messages. Devuelve la respuesta entera y su coste; lanza si la API
   falla, si Claude no quiere responder o si la respuesta no cabe. */
export async function mensaje(cuerpo, { apiKey, fetch = globalThis.fetch, espera = 30000 } = {}) {
  const c = { ...cuerpo };
  const headers = { 'content-type': 'application/json' };
  if (directo()) {
    c.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  const r = await pedir('/v1/messages', { apiKey, fetch, espera, method: 'POST', headers, body: JSON.stringify(c) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { throw fallo(`Claude ${r.status}: ${j.error?.message || 'sin detalle'}`, 'api'); }
  if (j.stop_reason === 'refusal') { throw fallo('Claude no ha querido responder', 'refusal'); }
  if (j.stop_reason === 'max_tokens') { throw fallo('la respuesta no cabe en el máximo de tokens', 'max_tokens'); }
  return { respuesta: j, uso: coste(j.model || c.model, j.usage) };
}

/* Cada error dice por qué (`motivo`), para que quien llama lo cuente a su manera */
const fallo = (mensaje, motivo) => Object.assign(new Error(mensaje), { motivo });
const sinWorkspace = detalle => fallo(`no se ha podido buscar el workspace de la clave de Anthropic, ${detalle}; pon su ID en ANTHROPIC_WORKSPACE_ID`, 'workspace');

/* El texto de la respuesta, como JSON cuando se ha pedido salida con esquema */
export const textoDe = j => (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
