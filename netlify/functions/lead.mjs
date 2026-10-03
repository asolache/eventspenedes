/* =============================================================================
   Events Penedès · del formulario a Zoho CRM

   Netlify avisa a esta función cada vez que alguien envía un formulario del
   sitio (Forms → Notifications → HTTP POST request). La función comprueba que
   el aviso viene de verdad de Netlify, arma la ficha del lead y la mete en
   Zoho sin duplicar.

   Lo que NO hace, a propósito: escribir nada en ningún repositorio. Un briefing
   lleva nombre, correo y teléfono de un cliente, y el historial de git es para
   siempre.

   Variables de entorno (en Netlify, nunca en el repositorio):
     NETLIFY_WEBHOOK_JWS_SECRET   el mismo secreto que en la notificación
     ZOHO_CLIENT_ID
     ZOHO_CLIENT_SECRET
     ZOHO_REFRESH_TOKEN
     ZOHO_DC                      'eu' o 'com'. Por defecto 'eu'
     ZOHO_LEAD_SOURCE             opcional · valor EXISTENTE de tu lista
     ZOHO_CAMPO_MARCA             opcional · nombre de API de tu campo «Marca»
     ZOHO_DRY_RUN                 '1' para no llamar a Zoho (pruebas)
   ========================================================================== */
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

/* --- La firma de Netlify -------------------------------------------------
   Netlify manda un JWS en la cabecera `X-Webhook-Signature`. Dentro va el
   sha256 del cuerpo. Hay que comprobar las dos cosas: que la firma es nuestra
   y que el cuerpo es el que se firmó. Solo con la primera, cualquiera podría
   reenviar un aviso viejo con el cuerpo cambiado. */

const b64url = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function igual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function firmaValida(token, cuerpo, secreto) {
  if (!token || !secreto) { return false; }
  const partes = token.split('.');
  if (partes.length !== 3) { return false; }
  const [cabecera, carga, firma] = partes;

  let alg;
  try { alg = JSON.parse(b64url(cabecera).toString('utf8')).alg; } catch { return false; }
  /* Solo HS256. Aceptar el `alg` que venga en la cabecera es el agujero
     clásico de JWT: con `none` entra cualquiera. */
  if (alg !== 'HS256') { return false; }

  const esperada = createHmac('sha256', secreto)
    .update(`${cabecera}.${carga}`)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  if (!igual(firma, esperada)) { return false; }

  let datos;
  try { datos = JSON.parse(b64url(carga).toString('utf8')); } catch { return false; }
  const hash = createHash('sha256').update(cuerpo, 'utf8').digest('hex');
  return igual(String(datos.sha256 || ''), hash);
}

/* --- Zoho ---------------------------------------------------------------- */

let cache = { token: null, caduca: 0 };

async function accessToken() {
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

/* --- La ficha ------------------------------------------------------------ */

const ETIQUETAS = {
  objetivo: 'Qué quieren que pase',
  tipo: 'Tipo de evento',
  pax: 'Personas',
  fecha: 'Fecha',
  fecha_firme: 'Fecha cerrada',
  duracion: 'Duración',
  espacio: 'Espacio',
  catering: 'Comida',
  movilidad: 'Transporte',
  origen_transporte: 'Salen desde',
  idioma_evento: 'Idioma del evento',
  presupuesto_orientativo: 'Presupuesto orientativo',
  restricciones: 'A tener en cuenta',
  quien_decide: 'Quién decide',
  cuando_decide: 'Decide antes de',
  a_traves_de: 'A través de',
  mercado: 'Clientes y mercados',
  cargo: 'Cargo',
  web: 'Web',
  mensaje: 'Mensaje',
  personas: 'Personas',
};

/* Los `value` de los desplegables son identificadores, no castellano. En la
   ficha de Zoho se lee «Convención», no «convencion»: quien abre el lead no
   tiene por qué traducir del formulario. */
const VALORES = {
  tipo: { convencion: 'Convención o jornada de empresa', incentivo: 'Incentivo o viaje de equipo',
          teambuilding: 'Team building', celebracion: 'Celebración o aniversario',
          presentacion: 'Presentación de producto', otro: 'Otro' },
  fecha_firme: { si: 'Sí, es esa', aproximada: 'Aproximada, hay margen',
                 abierta: 'Abierta: que la propongamos nosotros' },
  duracion: { media: 'Media jornada', jornada: 'Jornada completa',
              'jornada-noche': 'Jornada y cena', 'dos-dias': 'Dos días o más' },
  espacio: { 'cal-segue': 'Cal Segue', 'masia-torreblanca': 'Masia Torreblanca',
             'torre-del-gall': 'La Torre del Gall', bellesguart: 'Bellesguart' },
  catering: { 'no-se': 'Aún no lo sabe', sentado: 'Menú sentado', coctel: 'Cóctel con estaciones',
              showcooking: 'Showcooking', 'aire-libre': 'Al aire libre o barbacoa',
              ninguna: 'No hace falta' },
  movilidad: { 'no-se': 'Aún no lo sabe', microbus: 'Sí, microbús privado',
               propio: 'No, cada uno por su cuenta' },
  idioma_evento: { es: 'Castellano', ca: 'Catalán', en: 'Inglés', mixto: 'Mezcla' },
  presupuesto_orientativo: { 'hasta-5k': 'Hasta 5.000 €', '5-15k': '5.000 – 15.000 €',
                             '15-40k': '15.000 – 40.000 €', 'mas-40k': 'Más de 40.000 €' },
  idioma: { es: 'castellano', ca: 'catalán', en: 'inglés' },
};

const legible = (campo, v) => (VALORES[campo] && VALORES[campo][v]) || v;

const EXPERIENCIAS = {
  exp_castells: 'Taller de castells',
  exp_cata_vino: 'Cata de vino o cava',
  exp_cata_aceite: 'Cata de aceite',
  exp_chef: 'Chef o showcooking',
  exp_gincana: 'Gincana',
  exp_rrpp: 'Protocolo y RRPP',
};

function ficha(form, d, cuando) {
  const l = [`Formulario: ${form}`, `Idioma de la web: ${legible('idioma', d.idioma) || '—'}`,
             `Recibido: ${cuando}`, ''];
  for (const [campo, etiqueta] of Object.entries(ETIQUETAS)) {
    const v = (d[campo] || '').toString().trim();
    if (v) { l.push(`${etiqueta}: ${legible(campo, v)}`); }
  }
  const exp = Object.entries(EXPERIENCIAS).filter(([k]) => d[k]).map(([, v]) => v);
  if (exp.length) { l.push(`Experiencias marcadas: ${exp.join(', ')}`); }
  if (d.consentimiento) {
    l.push('', `Consentimiento del aviso de privacidad aceptado el ${cuando}.`);
  }
  return l.join('\n');
}

function lead(form, d, cuando) {
  const persona = (d.persona || d.nombre || '').trim();
  const empresa = (d.empresa || '').trim();
  /* Zoho exige Last_Name y Company. Antes que fallar la alta por un campo
     vacío, se rellenan con lo que haya: un lead sin nombre sigue siendo un
     lead, y el correo está. */
  const r = {
    Last_Name: persona || empresa || (d.correo || 'Sin nombre'),
    Company: empresa || persona || 'Particular',
    Email: (d.correo || '').trim() || undefined,
    Phone: (d.telefono || '').trim() || undefined,
    Website: (d.web || '').trim() || undefined,
    Description: ficha(form, d, cuando),
  };
  if (process.env.ZOHO_LEAD_SOURCE) { r.Lead_Source = process.env.ZOHO_LEAD_SOURCE; }
  if (process.env.ZOHO_CAMPO_MARCA) { r[process.env.ZOHO_CAMPO_MARCA] = 'Events Penedès'; }
  return r;
}

async function upsert(registro) {
  const dc = process.env.ZOHO_DC || 'eu';
  const token = await accessToken();
  const r = await fetch(`https://www.zohoapis.${dc}/crm/v2/Leads/upsert`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'content-type': 'application/json',
    },
    /* Upsert por correo: si ya escribió hace un mes, se actualiza su ficha en
       vez de crear un duplicado que luego hay que fusionar a mano. */
    body: JSON.stringify({ data: [registro], duplicate_check_fields: ['Email'] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { throw new Error(`Zoho ${r.status}: ${JSON.stringify(j)}`); }
  return j;
}

/* --- La función ---------------------------------------------------------- */

export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const cuerpo = await req.text();
  const secreto = process.env.NETLIFY_WEBHOOK_JWS_SECRET;

  /* Sin secreto configurado NO se acepta nada. Un endpoint abierto es una vía
     para llenar el CRM de basura, y que falle ruidosamente es mejor que
     tragarse avisos sin firmar sin que nadie se entere. */
  if (!secreto) {
    console.error('Falta NETLIFY_WEBHOOK_JWS_SECRET: el aviso se rechaza.');
    return new Response('No configurado', { status: 503 });
  }
  if (!firmaValida(req.headers.get('x-webhook-signature'), cuerpo, secreto)) {
    console.error('Firma inválida: el aviso no viene de Netlify.');
    return new Response('Firma inválida', { status: 401 });
  }

  let aviso;
  try { aviso = JSON.parse(cuerpo); } catch {
    return new Response('Cuerpo ilegible', { status: 400 });
  }

  const form = aviso.form_name || 'desconocido';
  const d = aviso.data || {};
  const cuando = aviso.created_at || new Date().toISOString();
  const registro = lead(form, d, cuando);

  if (process.env.ZOHO_DRY_RUN === '1') {
    console.log('DRY RUN · lead que se habría creado:', JSON.stringify(registro, null, 2));
    return Response.json({ ok: true, dry_run: true, lead: registro });
  }

  try {
    const j = await upsert(registro);
    console.log(`Lead de ${form} en Zoho:`, JSON.stringify(j.data?.[0]?.details || j));
    return Response.json({ ok: true });
  } catch (e) {
    /* Se responde 200 a posta: el envío ya está guardado en Netlify y el aviso
       por correo ya ha salido, así que no se pierde nada. Lo que no puede
       pasar es que el fallo sea invisible, y por eso queda en el registro. */
    console.error('No se pudo crear el lead en Zoho:', e.message);
    return Response.json({ ok: false, error: e.message });
  }
};
