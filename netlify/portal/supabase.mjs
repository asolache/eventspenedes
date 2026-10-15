/* =============================================================================
   Events Penedès · el portal de partners desde el servidor

   Las funciones del sitio hablan con la base de datos del portal (Supabase)
   con la clave secreta, que se salta los permisos por fila. Por eso solo hacen
   lo de esta lista: leer las fichas aprobadas, servir sus fotos, sumar visitas
   y clics, apuntar los leads de cada partner sin datos personales y el coste de
   cada importación.

   Variables de entorno (en Netlify, nunca en el repositorio):
     SUPABASE_URL          por defecto, el proyecto del portal
     SUPABASE_SECRET_KEY   la clave secreta (sb_secret_…) o la service_role.
                           Sin ella nada de esto hace nada y la web sigue igual
   ========================================================================== */
export const URL_PORTAL = 'https://kigjhtnwfhbujsotrqiu.supabase.co';

export const configurado = () => Boolean(process.env.SUPABASE_SECRET_KEY);

function cabeceras(extra = {}) {
  const clave = process.env.SUPABASE_SECRET_KEY;
  const h = { apikey: clave, ...extra };
  /* Las claves antiguas (service_role) son un JWT y van también como Bearer */
  if (clave.startsWith('eyJ')) { h.Authorization = `Bearer ${clave}`; }
  return h;
}

const base = () => (process.env.SUPABASE_URL || URL_PORTAL).replace(/\/$/, '');

export async function rest(ruta, { method = 'GET', body, prefer, fetch = globalThis.fetch } = {}) {
  const r = await fetch(`${base()}/rest/v1/${ruta}`, {
    method,
    headers: cabeceras({ 'content-type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (r.status === 204) { return null; }
  const j = await r.json().catch(() => null);
  if (!r.ok) { throw new Error(`Supabase ${r.status}: ${j?.message || 'sin detalle'}`); }
  return j;
}

export async function foto(ruta, { fetch = globalThis.fetch } = {}) {
  const limpia = ruta.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`${base()}/storage/v1/object/fotos/${limpia}`, { headers: cabeceras(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) { throw new Error(`Supabase storage ${r.status}`); }
  return r;
}

/* Los partners activos con ficha aprobada y autorizada: lo que es público */
export async function partnersPublicos({ fetch } = {}) {
  const filas = await rest('partners?select=id,codigo,nombre,tipo,estado,fichas(datos,version,actualizada_en)&estado=eq.activo&order=nombre', { fetch });
  return (filas || []).map(p => {
    const f = Array.isArray(p.fichas) ? p.fichas[0] : p.fichas;
    return { id: p.id, codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, datos: f?.datos || null, actualizada: f?.actualizada_en || null };
  }).filter(p => p.datos && p.datos.autoriza === 'si');
}

export async function partnerPorCodigo(codigo, { fetch } = {}) {
  const filas = await rest(`partners?select=id,codigo,nombre,tipo,estado&codigo=eq.${encodeURIComponent(codigo)}&limit=1`, { fetch });
  return filas?.[0] || null;
}

export const sumarImpresion = (codigo, clic, { fetch } = {}) =>
  rest('rpc/sumar_impresion', { method: 'POST', body: { p_codigo: codigo, p_clic: Boolean(clic) }, fetch });

export const anotar = (tabla, fila, { fetch } = {}) =>
  rest(tabla, { method: 'POST', body: fila, prefer: 'return=minimal', fetch });

/* Quién llama, por su sesión del portal: Supabase dice de quién es el token.
   Sin token válido, nadie. */
export async function usuario(token, { fetch = globalThis.fetch } = {}) {
  if (!token || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) { return null; }
  const r = await fetch(`${base()}/auth/v1/user`, {
    headers: { apikey: process.env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) { return null; }
  const u = await r.json().catch(() => null);
  return u?.id ? { id: u.id, correo: u.email || null } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esUuid = x => UUID.test(String(x || ''));

export async function esAdmin(userId, { fetch } = {}) {
  if (!esUuid(userId)) { return false; }
  return Boolean((await rest(`admins?select=user_id&user_id=eq.${userId}`, { fetch }))?.length);
}

export async function esMiembro(userId, partnerId, { fetch } = {}) {
  if (!esUuid(userId) || !esUuid(partnerId)) { return false; }
  return Boolean((await rest(`miembros?select=user_id&user_id=eq.${userId}&partner_id=eq.${partnerId}`, { fetch }))?.length);
}
