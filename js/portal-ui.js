/* =============================================================================
   Events Penedès — piezas comunes del portal de partners (/acceso)
   ========================================================================== */
import { sb } from './portal-cliente.js';

const estado = () => document.querySelector('#portal [data-estado]');

export function decir(texto, tipo) {
  const e = estado();
  if (!e) { return; }
  e.textContent = texto;
  e.setAttribute('data-tipo', tipo || 'info');
  e.hidden = !texto;
  if (texto && tipo === 'error') { e.scrollIntoView({ block: 'nearest' }); }
}

/* Un nodo sin innerHTML: lo que escribe un partner nunca se interpreta */
export function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) { continue; }
    if (k.startsWith('on')) { el.addEventListener(k.slice(2), v); } else { el.setAttribute(k, v === true ? '' : v); }
  }
  for (const c of hijos.flat()) { if (c !== null && c !== undefined && c !== false) { el.append(c.nodeType ? c : String(c)); } }
  return el;
}

/* append sin los null de los «cond ? nodo : null» */
export const poner = (el, ...n) => el.append(...n.flat().filter(x => x !== null && x !== undefined && x !== false));

export const fecha = f => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fechaHora = f => (f ? new Date(f).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const euros = n => (n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`);
export const hora = t => (t ? String(t).slice(0, 5) : '');

export const ok = ({ error, data }) => { if (error) { throw new Error(error.message); } return data; };
export const intentar = fn => async (...a) => {
  try { await fn(...a); } catch (e) { decir(e.message, 'error'); }
};

/* Un campo con su etiqueta */
export const campo = (etiqueta, control, nota) =>
  h('p', { class: 'field' }, h('label', {}, etiqueta, control), nota ? h('span', { class: 'form__note' }, nota) : null);

export const boton = (texto, onclick, tipo = 'ghost') =>
  h('button', { class: `btn btn--${tipo}`, type: 'button', onclick: intentar(onclick) }, texto);

/* La función del sitio que habla con Zoho, con la sesión de quien llama */
export async function api(ruta, { method = 'GET', body } = {}) {
  const { data } = await sb.auth.getSession();
  const r = await fetch(ruta, {
    method,
    headers: { Authorization: `Bearer ${data.session?.access_token || ''}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { throw new Error(j.error || `Error ${r.status}`); }
  return j;
}

/* Cada paso pasa a Zoho como nota. Si Zoho no responde, el paso ya está en el
   portal y administración lo pasa después: no se para a nadie por ello. */
export async function aZoho({ mensaje, ref } = {}) {
  try {
    let id = mensaje;
    if (!id && ref) {
      const { data: u } = await sb.auth.getUser();
      const { data } = await sb.from('mensajes').select('id').eq('ref', ref).eq('autor', u.user.id)
        .is('zoho_nota_id', null).order('creado_en', { ascending: false }).limit(1);
      id = data?.[0]?.id;
    }
    await api('/api/portal/sincronizar', { method: 'POST', body: id ? { mensaje: id } : {} });
  } catch (e) { console.warn('Zoho, más tarde:', e.message); }
}
