/* =============================================================================
   Events Penedès · el cliente de Zoho CRM de las funciones del sitio

   Lo usan la función de leads y el portal de partners. Las credenciales son
   las de siempre, en Netlify: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET,
   ZOHO_REFRESH_TOKEN y ZOHO_DC ('eu' o 'com'; por defecto 'eu').
   ========================================================================== */

export const configurado = () => Boolean(process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID);
export const dc = () => process.env.ZOHO_DC || 'eu';

let cache = { token: null, caduca: 0 };

export async function accessToken() {
  const ahora = Date.now();
  if (cache.token && ahora < cache.caduca) { return cache.token; }

  const dc = process.env.ZOHO_DC || 'eu';
  const r = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.ZOHO_CLIENT_ID,
      client_secret: process.env.ZOHO_CLIENT_SECRET,
      refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    }),
  });
  const j = await r.json();
  if (!j.access_token) { throw new Error('Zoho no devolvió access_token: ' + JSON.stringify(j)); }
  /* Un minuto de margen: un token que caduca a mitad de la llamada da un 401
     que parece otra cosa. */
  cache = { token: j.access_token, caduca: ahora + ((j.expires_in || 3600) - 60) * 1000 };
  return cache.token;
}

export async function zoho(ruta, cuerpo) {
  const dc = process.env.ZOHO_DC || 'eu';
  const token = await accessToken();
  const r = await fetch(`https://www.zohoapis.${dc}/crm/v2/${ruta}`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => ({}));
  /* Zoho responde 200 o 202 con el error DENTRO cuando falla un registro
     concreto («MAX_LENGTH_EXCEEDED», «INVALID_DATA»…). Mirar solo el estado
     HTTP da por bueno un lead que no se ha creado. */
  const fila = j.data?.[0];
  if (!r.ok || (fila && fila.status === 'error')) {
    throw new Error(`Zoho ${r.status}: ${JSON.stringify(fila || j)}`);
  }
  return j;
}

export async function zohoGet(ruta) {
  const dc = process.env.ZOHO_DC || 'eu';
  const token = await accessToken();
  const r = await fetch(`https://www.zohoapis.${dc}/crm/v2/${ruta}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (r.status === 204) { return {}; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { throw new Error(`Zoho ${r.status}: ${JSON.stringify(j)}`); }
  return j;
}
