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

/* Un enlace a una foto que caduca: para la vista previa, que enseña también
   las fotos aún sin aprobar */
export async function firmarFoto(ruta, segundos = 900, { fetch = globalThis.fetch } = {}) {
  const limpia = ruta.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`${base()}/storage/v1/object/sign/fotos/${limpia}`, {
    method: 'POST', headers: cabeceras({ 'content-type': 'application/json' }),
    body: JSON.stringify({ expiresIn: segundos }), signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.signedURL) { throw new Error(`Supabase storage ${r.status}`); }
  return `${base()}/storage/v1${j.signedURL}`;
}

/* La ficha que vería la web si se aprobara ahora: el último cambio pendiente
   o, si no hay, la aprobada */
export async function fichaEnCurso(partnerId, { fetch } = {}) {
  if (!esUuid(partnerId)) { return null; }
  const [pend, pub] = await Promise.all([
    rest(`cambios_ficha?select=datos&partner_id=eq.${partnerId}&estado=eq.pendiente&order=creado_en.desc&limit=1`, { fetch }),
    rest(`fichas?select=datos&partner_id=eq.${partnerId}&limit=1`, { fetch }),
  ]);
  return pend?.[0]?.datos ? { datos: pend[0].datos, pendiente: true } : pub?.[0]?.datos ? { datos: pub[0].datos, pendiente: false } : null;
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

/* --- El blog y la agenda --------------------------------------------------------
   Solo lo publicado: los artículos con estado `publicado` y las acciones de la
   agenda aprobadas. El precio de una acción nunca se pide aquí. */
const CAMPOS_ARTICULO = 'id,tipo,partner_id,titulo,slug,entradilla,cuerpo,temas,fotos,permiso_fotos,publicado_en,actualizado_en';
const CAMPOS_ACCION = 'id,partner_id,titulo,descripcion,categoria,fecha_inicio,fecha_fin,cada_ano,hora_inicio,hora_fin,plazas_min,plazas_max,estado';

export const articulosPublicados = ({ fetch } = {}) =>
  rest(`articulos?select=${CAMPOS_ARTICULO}&estado=eq.publicado&order=publicado_en.desc&limit=500`, { fetch }).then(x => x || []);

export const agendaAprobada = ({ fetch } = {}) =>
  rest(`agenda?select=${CAMPOS_ACCION}&estado=eq.aprobada&order=fecha_inicio&limit=1000`, { fetch }).then(x => x || []);

/* Los partners por id (activos), para firmar un artículo o una acción */
export async function partnersPorId(ids, { fetch } = {}) {
  const limpios = [...new Set(ids.filter(esUuid))];
  if (!limpios.length) { return {}; }
  const filas = await rest(`partners?select=id,codigo,nombre,tipo,estado,fichas(datos)&estado=eq.activo&id=in.(${limpios.join(',')})`, { fetch });
  return Object.fromEntries((filas || []).map(p => {
    const f = Array.isArray(p.fichas) ? p.fichas[0] : p.fichas;
    return [p.id, { id: p.id, codigo: p.codigo, nombre: p.nombre, tipo: p.tipo, datos: f?.datos || null }];
  }));
}
