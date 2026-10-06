/* =============================================================================
   Events Penedès · del formulario a Zoho CRM

   Netlify avisa a esta función cada vez que alguien envía un formulario del
   sitio (Forms → Notifications → HTTP POST request). La función comprueba que
   el aviso viene de verdad de Netlify, arma la ficha del lead y la mete en
   Zoho sin duplicar.

   Cuando el formulario es la ficha de una localización, el espacio entra como
   CUENTA con la etiqueta «Localización» y la de su tipo, la persona como
   CONTACTO de esa cuenta, y la ficha entera como nota. Ver `localizacion()`.

   Y cuando el formulario es el de propuesta, hace una segunda cosa: **monta el
   borrador de la propuesta** y deja en una nota del lead un enlace privado
   para leerlo.
   El borrador sale solo; enviarlo, no. Lo que vende es el párrafo que responde
   a lo que el cliente escribió, y eso lo escribe una persona.

   Lo que NO hace, a propósito: escribir nada en ningún repositorio. Un briefing
   lleva nombre, correo y teléfono de un cliente, y el historial de git es para
   siempre. Tampoco guarda el borrador en ningún sitio: viaja dentro de su
   propio enlace, cifrado —ver `netlify/propuesta/sobre.mjs`—.

   Variables de entorno (en Netlify, nunca en el repositorio):
     NETLIFY_WEBHOOK_JWS_SECRET   el mismo secreto que en la notificación
     ZOHO_CLIENT_ID
     ZOHO_CLIENT_SECRET
     ZOHO_REFRESH_TOKEN
     ZOHO_DC                      'eu' o 'com'. Por defecto 'eu'
     ZOHO_LEAD_SOURCE             opcional · valor EXISTENTE de tu lista
     ZOHO_CAMPO_MARCA             opcional · nombre de API de tu campo «Marca»
     ZOHO_DRY_RUN                 '1' para no llamar a Zoho (pruebas)
     ZOHO_ETAPA_PROPUESTA         opcional · etapa EXACTA de una oportunidad nueva.
                                  Con ella, la propuesta entra como cuenta +
                                  contacto + oportunidad; sin ella, como lead
     PROPUESTA_SECRET             opcional · sin ella no se monta el borrador
                                  (el borrador va en una nota del lead: el
                                  token de Zoho necesita permiso de notas)
     BORRADOR_DIAS                opcional · cuántos días vale el enlace (30)
     ZOHO_ETIQUETA_LOCALIZACION   opcional · etiqueta de las cuentas de espacios
                                  («Localización»)
   ========================================================================== */
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { cerrar } from '../propuesta/sobre.mjs';
import { briefingAEvento } from '../propuesta/briefing-a-evento.mjs';
import { opciones, espacios } from '../propuesta/catalogo.mjs';
import { FORM as FORM_LOCALIZACION, TIPOS, ETIQUETA_TIPO, fichaTexto } from '../localizacion/esquema.mjs';

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

/* Cada formulario tiene sus propias opciones, y «agencia» no significa lo mismo
   en el de contacto («soy agencia y busco partner») que en el de alta («agencia
   de eventos»). Por eso la traducción es por formulario y no una sola tabla. */
const POR_FORM = {
  contacto: {
    tipo: { 'team-building': 'Jornada de equipo / team building',
            convencion: 'Convención o kick-off', incentivo: 'Incentivo',
            celebracion: 'Celebración de empresa',
            agencia: 'Es una agencia y busca partner local',
            dj: 'Sesión de DJ', otro: 'Otro' },
  },
  agencia: {
    tipo: { agencia: 'Agencia de eventos', dmc: 'DMC',
            organizador: 'Organizador profesional de congresos', otro: 'Otro' },
  },
};

const legible = (form, campo, v) =>
  (POR_FORM[form] && POR_FORM[form][campo] && POR_FORM[form][campo][v])
  || (VALORES[campo] && VALORES[campo][v])
  || v;

const EXPERIENCIAS = {
  exp_castells: 'Taller de castells',
  exp_cata_vino: 'Cata de vino o cava',
  exp_cata_aceite: 'Cata de aceite',
  exp_chef: 'Chef o showcooking',
  exp_gincana: 'Gincana',
  exp_rrpp: 'Protocolo y RRPP',
};

function ficha(form, d, cuando) {
  const l = [`Formulario: ${form}`, `Idioma de la web: ${legible(form, 'idioma', d.idioma) || '—'}`,
             `Recibido: ${cuando}`, ''];
  for (const [campo, etiqueta] of Object.entries(ETIQUETAS)) {
    const v = (d[campo] || '').toString().trim();
    if (v) { l.push(`${etiqueta}: ${legible(form, campo, v)}`); }
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
  /* Zoho exige Last_Name y Company. Antes que fallar el alta por un campo
     vacío, se rellenan con lo que haya: un lead sin nombre sigue siendo un
     lead, y el correo está.
     Company no se rellena con el nombre de la persona: en el CRM, una empresa
     que se llama igual que el contacto parece un error de datos, y al convertir
     el lead crearía una cuenta con nombre de persona. «Particular» es lo que
     es. */
  const r = {
    Last_Name: persona || empresa || (d.correo || 'Sin nombre'),
    Company: empresa || 'Particular',
    Email: (d.correo || '').trim() || undefined,
    Phone: (d.telefono || '').trim() || undefined,
    Website: (d.web || '').trim() || undefined,
    Description: ficha(form, d, cuando),
  };
  if (process.env.ZOHO_LEAD_SOURCE) { r.Lead_Source = process.env.ZOHO_LEAD_SOURCE; }
  if (process.env.ZOHO_CAMPO_MARCA) { r[process.env.ZOHO_CAMPO_MARCA] = 'Events Penedès'; }
  return r;
}

/* --- El borrador ---------------------------------------------------------
   Se monta aquí porque es el único momento en que el briefing está completo y
   en memoria. Si algo falla, **el lead sigue**: perder una ficha de cliente por
   un borrador que no sale sería cambiar lo importante por lo cómodo. */

function borrador(d, cuando, base) {
  if (!process.env.PROPUESTA_SECRET) {
    console.log('Sin PROPUESTA_SECRET: no se monta el borrador. El briefing está en la ficha.');
    return null;
  }
  try {
    const { evento, descartes, avisos } = briefingAEvento(d, { opciones, espacios, recibido: cuando });
    const dias = Number.parseInt(process.env.BORRADOR_DIAS || '30', 10) || 30;
    const sobre = cerrar({ evento, descartes, avisos }, process.env.PROPUESTA_SECRET, dias * 24 * 3600);
    const enlace = `${base}/p?d=${sobre}`;

    const l = ['', '— Borrador de propuesta montado solo —', enlace,
               `Caduca en ${dias} días. No se ha enviado a nadie.`];
    if (descartes.length) {
      l.push('', 'Pidió cosas que no encajan y están fuera del documento:');
      descartes.forEach(x => l.push(`· ${x.motivo}`));
    }
    if (avisos.length) {
      l.push('', 'Antes de enviarlo:');
      avisos.forEach(a => l.push(`· ${a}`));
    }
    l.push('', 'Para enviarlo: abre el enlace → «Preparar la versión para el cliente» → retoca → «Guardar PDF».');
    return { enlace, nota: l.join('\n'), evento };
  } catch (e) {
    console.error('No se pudo montar el borrador:', e.message);
    return null;
  }
}

async function zoho(ruta, cuerpo) {
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

/* Upsert por correo: si ya escribió hace un mes, se actualiza su ficha en vez
   de crear un duplicado que luego hay que fusionar a mano. */
const upsert = registro =>
  zoho('Leads/upsert', { data: [registro], duplicate_check_fields: ['Email'] });

const nota = (modulo, id, titulo, texto) =>
  zoho(`${modulo}/${id}/Notes`, { data: [{ Note_Title: titulo, Note_Content: texto }] });

/* --- La propuesta como oportunidad -----------------------------------------
   Quien pide una propuesta ya no es un lead por cualificar: quiere un evento.
   Así que, si está configurada la etapa, el briefing entra como CUENTA (la
   empresa), CONTACTO (la persona) y una OPORTUNIDAD por propuesta. La cuenta y
   el contacto se reutilizan si ya existen; la oportunidad es siempre nueva, y
   así un cliente que repite guarda todas sus propuestas, cada una en su etapa.

   ZOHO_ETAPA_PROPUESTA es el valor EXACTO de la etapa en tu Zoho: si no
   coincide, Zoho rechaza la oportunidad y el briefing entra como lead, que es
   lo que pasaba antes. Sin la variable, todo sigue entrando como lead. */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function oportunidad(d, cuando, descripcion) {
  const persona = (d.persona || d.nombre || '').trim();
  const empresa = (d.empresa || '').trim();
  const correo = (d.correo || '').trim();
  const telefono = (d.telefono || '').trim() || undefined;
  const origen = process.env.ZOHO_LEAD_SOURCE ? { Lead_Source: process.env.ZOHO_LEAD_SOURCE } : {};

  /* Sin empresa no se inventa una cuenta: un particular es un contacto y su
     oportunidad, sin cuenta. Una cuenta llamada como una persona parece un
     error de datos. */
  const cuenta = empresa ? { Account_Name: empresa, Phone: telefono } : null;
  const contacto = correo
    ? { Last_Name: persona || empresa || correo, Email: correo, Phone: telefono, ...origen }
    : null;

  /* Zoho exige fecha de cierre. La del evento es la que manda: si se celebra,
     la venta se ha cerrado antes. Sin fecha, a 30 días de la petición. */
  const fecha = FECHA.test(d.fecha || '') ? d.fecha
    : new Date(Date.parse(cuando) + 30 * 864e5).toISOString().slice(0, 10);
  const tipo = legible('propuesta', 'tipo', d.tipo) || 'Evento';
  const trato = {
    Deal_Name: `${empresa || persona || correo || 'Sin nombre'} · ${tipo} · ${FECHA.test(d.fecha || '') ? d.fecha : 'sin fecha'}`.slice(0, 120),
    Stage: process.env.ZOHO_ETAPA_PROPUESTA,
    Closing_Date: fecha,
    Description: descripcion,
    ...origen,
  };
  if (process.env.ZOHO_CAMPO_MARCA) { trato[process.env.ZOHO_CAMPO_MARCA] = 'Events Penedès'; }
  return { cuenta, contacto, trato };
}

const idDe = j => j.data?.[0]?.details?.id;

async function crearOportunidad({ cuenta, contacto, trato }) {
  const ids = {};
  if (cuenta) {
    ids.cuenta = idDe(await zoho('Accounts/upsert', { data: [cuenta], duplicate_check_fields: ['Account_Name'] }));
  }
  if (contacto) {
    const c = ids.cuenta ? { ...contacto, Account_Name: { id: ids.cuenta } } : contacto;
    ids.contacto = idDe(await zoho('Contacts/upsert', { data: [c], duplicate_check_fields: ['Email'] }));
  }
  const t = { ...trato };
  if (ids.cuenta) { t.Account_Name = { id: ids.cuenta }; }
  if (ids.contacto) { t.Contact_Name = { id: ids.contacto }; }
  ids.trato = idDe(await zoho('Deals', { data: [t] }));
  if (!ids.trato) { throw new Error('Zoho no devolvió el id de la oportunidad'); }
  return ids;
}

/* La descripción de un lead en Zoho puede quedarse en 2.000 caracteres según
   cómo esté el campo. Un briefing con el enlace cifrado del borrador los pasa
   —el enlace solo ya ronda los mil—, y entonces Zoho rechaza el lead entero.
   Por eso el borrador va en una nota aparte y la ficha se recorta si hiciera
   falta: lo que no puede pasar es perder el lead. */
const MAX_DESCRIPCION = 2000;
const COLA = '\n… (recortado; el envío completo está en Netlify)';
const recortar = t => (t.length <= MAX_DESCRIPCION ? t
  : t.slice(0, MAX_DESCRIPCION - COLA.length) + COLA);

/* --- La localización como cuenta -------------------------------------------
   Un espacio no es un lead: no se le vende nada, se trabaja con él. Entra como
   CUENTA, con dos etiquetas —«Localización» y su tipo— para poder filtrarlos
   en el CRM, y la persona como CONTACTO de esa cuenta.

   La cuenta se busca por nombre y solo se le escriben datos de hecho (teléfono,
   web, dirección), nunca la descripción: si el espacio ya estaba en Zoho por
   otro motivo, no se le pisa lo que tuviera. La ficha va en una NOTA, así que
   cada visita o corrección deja la suya y se ve cómo ha cambiado. */

function localizacion(d, cuando) {
  const v = k => (d[k] || '').toString().trim() || undefined;
  const nombre = v('nombre') || 'Localización sin nombre';
  const cuenta = {
    Account_Name: nombre,
    Phone: v('telefono'),
    Website: v('web'),
    Billing_Street: v('direccion'),
    Billing_City: v('poblacion'),
    Billing_Code: v('cp'),
  };
  if (process.env.ZOHO_CAMPO_MARCA) { cuenta[process.env.ZOHO_CAMPO_MARCA] = 'Events Penedès'; }
  const persona = v('contacto_persona');
  const correo = v('contacto_correo');
  const movil = v('contacto_movil');
  const contacto = (persona || correo || movil)
    ? { Last_Name: persona || correo || movil, Email: correo, Mobile: movil, Title: v('contacto_cargo') }
    : null;
  const etiquetas = [process.env.ZOHO_ETIQUETA_LOCALIZACION || 'Localización'];
  if (ETIQUETA_TIPO[d.tipo]) { etiquetas.push(ETIQUETA_TIPO[d.tipo]); }
  const nota = [`Ficha de localización · recibida ${cuando}`,
                `Tipo: ${TIPOS[d.tipo] || d.tipo || '—'}`, '', fichaTexto(d)];
  if (d.consentimiento) { nota.push('', `Aviso de privacidad aceptado el ${cuando}.`); }
  return { cuenta, contacto, etiquetas, nota: nota.join('\n') };
}

async function crearLocalizacion({ cuenta, contacto, etiquetas, nota: texto }) {
  const ids = {};
  ids.cuenta = idDe(await zoho('Accounts/upsert', { data: [cuenta], duplicate_check_fields: ['Account_Name'] }));
  if (!ids.cuenta) { throw new Error('Zoho no devolvió el id de la cuenta'); }

  /* Lo que viene después de la cuenta no puede tumbarla: si falla una
     etiqueta o el contacto, el espacio ya está dentro y queda en el registro. */
  const avisos = [];
  try {
    const q = encodeURIComponent(etiquetas.join(','));
    await zoho(`Accounts/${ids.cuenta}/actions/add_tags?tag_names=${q}&over_write=false`, {});
  } catch (e) { avisos.push('etiquetas: ' + e.message); }
  if (contacto) {
    try {
      const c = { ...contacto, Account_Name: { id: ids.cuenta } };
      /* Sin correo no hay con qué deduplicar: se crea. */
      ids.contacto = idDe(contacto.Email
        ? await zoho('Contacts/upsert', { data: [c], duplicate_check_fields: ['Email'] })
        : await zoho('Contacts', { data: [c] }));
    } catch (e) { avisos.push('contacto: ' + e.message); }
  }
  try {
    await nota('Accounts', ids.cuenta, 'Ficha de localización', texto);
  } catch (e) { avisos.push('nota: ' + e.message); }
  return { ids, avisos };
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

  if (form === FORM_LOCALIZACION) {
    const loc = localizacion(d, cuando);
    if (process.env.ZOHO_DRY_RUN === '1') {
      console.log('DRY RUN · localización:', JSON.stringify(loc, null, 2));
      return Response.json({ ok: true, dry_run: true, localizacion: loc });
    }
    try {
      const { ids, avisos } = await crearLocalizacion(loc);
      console.log('Localización en Zoho:', JSON.stringify(ids));
      if (avisos.length) { console.error('La cuenta está, pero:', avisos.join(' · ')); }
      return Response.json({ ok: true, modulo: 'Accounts', avisos });
    } catch (e) {
      /* Si la cuenta no entra, entra como lead con la ficha: perder una visita
         entera por organizarla mejor sería cambiar lo importante por lo cómodo. */
      console.error('No se pudo crear la cuenta del espacio; entra como lead:', e.message);
      try {
        const r = { Last_Name: (d.contacto_persona || d.nombre || 'Localización').trim(),
                    Company: (d.nombre || 'Localización').trim(),
                    Email: (d.contacto_correo || '').trim() || undefined,
                    Phone: (d.telefono || '').trim() || undefined,
                    Description: recortar(loc.nota) };
        await upsert(r);
        return Response.json({ ok: true, modulo: 'Leads' });
      } catch (e2) {
        console.error('Tampoco como lead:', e2.message);
        return Response.json({ ok: false, error: e2.message });
      }
    }
  }
  const registro = lead(form, d, cuando);

  /* Solo el formulario de propuesta trae briefing. Los de contacto y de alta de
     agencia no tienen con qué montar un programa, y un borrador vacío es ruido
     en la ficha. */
  const b = form === 'propuesta'
    ? borrador(d, cuando, process.env.URL || 'https://eventspenedes.com')
    : null;
  if (b) {
    /* También al registro: si la nota no se crea o se borra a mano, aquí sigue. */
    console.log(`Borrador de ${b.evento.id}: ${b.enlace}`);
  }
  registro.Description = recortar(registro.Description);

  const comoOportunidad = form === 'propuesta' && Boolean(process.env.ZOHO_ETAPA_PROPUESTA);
  const op = comoOportunidad ? oportunidad(d, cuando, registro.Description) : null;

  if (process.env.ZOHO_DRY_RUN === '1') {
    console.log('DRY RUN · lo que se habría creado:', JSON.stringify(op || registro, null, 2));
    return Response.json({ ok: true, dry_run: true, lead: op ? null : registro, oportunidad: op, nota: b?.nota || null });
  }

  /* Primero la oportunidad, si toca. Si Zoho la rechaza —una etapa que no
     existe, un token sin permiso—, el briefing entra como lead: perder la
     petición por organizarla mejor sería cambiar lo importante por lo cómodo. */
  let modulo = 'Leads', id;
  if (op) {
    try {
      const ids = await crearOportunidad(op);
      modulo = 'Deals'; id = ids.trato;
      console.log('Propuesta en Zoho como oportunidad:', JSON.stringify(ids));
    } catch (e) {
      console.error('No se pudo crear la oportunidad; entra como lead:', e.message);
    }
  }

  if (!id) {
    try {
      const j = await upsert(registro);
      id = idDe(j);
      console.log(`Lead de ${form} en Zoho:`, JSON.stringify(j.data?.[0]?.details || j));
    } catch (e) {
      /* Se responde 200 a posta: el envío ya está guardado en Netlify y el aviso
         por correo ya ha salido, así que no se pierde nada. Lo que no puede
         pasar es que el fallo sea invisible, y por eso queda en el registro. */
      console.error('No se pudo crear el lead en Zoho:', e.message);
      return Response.json({ ok: false, error: e.message });
    }
  }

  /* El borrador, en una nota de la oportunidad o del lead. Si falla, la ficha
     ya está dentro y el enlace en el registro de la función: se avisa y se sigue. */
  if (b && id) {
    try {
      await nota(modulo, id, 'Borrador de propuesta', b.nota.trim());
    } catch (e) {
      console.error(`La ficha está en Zoho (${modulo}), pero no la nota del borrador:`, e.message);
      return Response.json({ ok: true, modulo, nota: false, error: e.message });
    }
  }
  return Response.json({ ok: true, modulo });
};
