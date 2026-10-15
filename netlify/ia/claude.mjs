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

export const cabeceras = apiKey => ({ 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' });

/* POST /v1/messages. Devuelve la respuesta entera y su coste; lanza si la API
   falla, si Claude no quiere responder o si la respuesta no cabe. */
export async function mensaje(cuerpo, { apiKey, fetch = globalThis.fetch, espera = 30000 } = {}) {
  const c = { ...cuerpo };
  const h = { ...cabeceras(apiKey), 'content-type': 'application/json' };
  if (directo()) {
    c.fallbacks = 'default';
    h['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }
  const r = await fetch(`${base()}/v1/messages`, {
    method: 'POST', headers: h, body: JSON.stringify(c), signal: AbortSignal.timeout(espera),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { throw fallo(`Claude ${r.status}: ${j.error?.message || 'sin detalle'}`, 'api'); }
  if (j.stop_reason === 'refusal') { throw fallo('Claude no ha querido responder', 'refusal'); }
  if (j.stop_reason === 'max_tokens') { throw fallo('la respuesta no cabe en el máximo de tokens', 'max_tokens'); }
  return { respuesta: j, uso: coste(j.model || c.model, j.usage) };
}

/* Cada error dice por qué (`motivo`), para que quien llama lo cuente a su manera */
const fallo = (mensaje, motivo) => Object.assign(new Error(mensaje), { motivo });

/* El texto de la respuesta, como JSON cuando se ha pedido salida con esquema */
export const textoDe = j => (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
