/* =============================================================================
   Events Penedès · del formulario a Zoho CRM

   Netlify avisa a esta función cada vez que alguien envía un formulario del
   sitio (Forms → Notifications → HTTP POST request). La función comprueba que
   el aviso viene de verdad de Netlify, arma la ficha del lead y la mete en
   Zoho sin duplicar.

   Cuando el formulario es la ficha de una localización, el espacio entra como
   CUENTA con la etiqueta «Localización» y la de su tipo, la persona como
   CONTACTO de esa cuenta, y la ficha entera como nota. Mientras la ficha no
   traiga fecha de visita, la cuenta lleva «Pendiente de visita», y la primera
   vez que la lleva se crea una TAREA para visitarla: es el aviso de que ha
   llegado un espacio. Ver `localizacion()`.

   La ficha de un proveedor entra igual: CUENTA de tipo Proveedor con la
   etiqueta «Proveedor» y la de cada cosa que ofrece, CONTACTO y nota. Hasta
   que la validamos lleva «Pendiente de validar» y una tarea para revisarla.
   Ver `proveedor()`.

   Y cuando el formulario es el de propuesta, hace una segunda cosa: **monta el
   borrador de la propuesta** y deja en una nota del lead un enlace privado
   para leerlo.
   El borrador sale solo; enviarlo, no. Lo que vende es el párrafo que responde
   a lo que el cliente escribió, y eso lo escribe una persona.

   Y a todo el que escribe pidiendo algo (propuesta, contacto, alta de agencia
   o «Entra en la red») le deja **la respuesta preparada**: el correo escrito en
   su idioma, en una nota de su registro con los enlaces para abrirlo en Gmail
   y agendar la llamada en Google Calendar, y una tarea para responder hoy.
   Tampoco se envía sola. Ver `netlify/respuesta/respuesta.mjs`.

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
     ZOHO_ETIQUETA_PENDIENTE      opcional · etiqueta de los espacios sin visitar
                                  («Pendiente de visita»)
     ZOHO_AVISO_TAREA             opcional · '0' para no crear la tarea de aviso
                                  cuando llega un espacio o un proveedor nuevo
     ZOHO_ETIQUETA_PROVEEDOR      opcional · etiqueta de los proveedores («Proveedor»)
     ZOHO_TIPO_PROVEEDOR          opcional · valor del tipo de cuenta («Proveedor»;
                                  '' para no tocarlo)
     ZOHO_ETIQUETA_POR_VALIDAR    opcional · etiqueta de los proveedores sin
                                  validar («Pendiente de validar»)
     PARTNERS                     opcional · códigos de partner válidos, separados
                                  por comas. Con la lista, un código que no está
                                  se anota como «no reconocido» y no se escribe
                                  en el campo del partner
     ZOHO_CAMPO_PARTNER           opcional · nombre de API de un campo de texto en
                                  Leads, Contacts y Deals donde va el código
     ZOHO_LEAD_SOURCE_PARTNER     opcional · valor EXISTENTE de «Fuente» para lo
                                  que llega por el enlace de un partner
     SUPABASE_SECRET_KEY          opcional · con ella, el lead de un partner se
                                  anota en su panel del portal, sin datos personales,
                                  y lo que cuesta cada respuesta escrita por Claude
     ANTHROPIC_API_KEY            opcional · con ella, la respuesta la escribe
                                  Claude; sin ella, sale de una plantilla fija. La
                                  AI Gateway de Netlify la pone sola, con
                                  ANTHROPIC_BASE_URL (ver `netlify/ia/claude.mjs`)
     ANTHROPIC_MODEL              opcional · por defecto claude-opus-5-5
     ANTHROPIC_WORKSPACE_ID       opcional · el workspace (wrkspc_…) de una
                                  clave que no es de un solo workspace. Sin
                                  ella, se usa el de por defecto
     CATALOGO_AGENCIAS_URL        opcional · enlace al PDF del catálogo para
                                  agencias, para tenerlo a mano en la nota
   ========================================================================== */
import { createHmac, timingSafeEqual, createHash } from 'node:crypto';
import { cerrar } from '../propuesta/sobre.mjs';
import { briefingAEvento } from '../propuesta/briefing-a-evento.mjs';
import { opciones, espacios } from '../propuesta/catalogo.mjs';
import { FORM as FORM_LOCALIZACION, TIPOS, ETIQUETA_TIPO, fichaTexto, cambios, cambiosTexto } from '../localizacion/esquema.mjs';
import * as PROV from '../proveedor/esquema.mjs';
import * as PORTAL from '../portal/supabase.mjs';
import { zoho, zohoGet } from '../portal/zoho.mjs';
import * as RESP from '../respuesta/respuesta.mjs';

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

/* --- Zoho: el cliente vive en netlify/portal/zoho.mjs ---------------------- */

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
  perfil: 'Perfil de partner',
  poblacion: 'Población',
  origen: 'Llegó por',
  recomienda: 'Dice que le recomendó',
  seleccion: 'Marcó en la web',
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
             'torre-del-gall': 'La Torre del Gall', bellesguart: 'Bellesguart',
             'albet-i-noya': 'Albet i Noya' },
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
  /* «Entra en la red»: un espacio o un proveedor que se presenta. */
  red: { perfil: PROV.PERFILES_RED },
};

const legible = (form, campo, v) =>
  (POR_FORM[form] && POR_FORM[form][campo] && POR_FORM[form][campo][v])
  || (VALORES[campo] && VALORES[campo][v])
  || v;

const EXPERIENCIAS = {
  exp_dj: 'Sesión de DJ',
  exp_castells: 'Taller de castells',
  exp_cata_aceite: 'Cata de aceite',
  exp_cata_vino: 'Visita entre viñas y cata en Albet i Noya',
  exp_catas_ludicas: 'Catas lúdicas en Albet i Noya',
  exp_comer_bodega: 'Comer en la bodega Albet i Noya',
  exp_maridaje: 'Maridaje de paisaje y rutas en Albet i Noya',
};

/* --- El partner que trae el lead -----------------------------------------
   Cada espacio o proveedor de la red tiene su enlace (eventspenedes.com/r/
   <código>) y la web pone el código en el campo oculto `partner` de lo que se
   envíe. Es lo que permite saber, meses después, qué lead trajo quién.

   Un campo oculto lo puede escribir cualquiera, así que el código se trata como
   lo que es: un dato que llega del navegador. Solo se acepta con forma de
   código, y si está configurada la lista PARTNERS, uno que no esté se anota en
   la ficha como no reconocido y no llega al campo del CRM, para que nadie se
   atribuya un lead escribiendo una URL. */

const CODIGO_PARTNER = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

export function partnerDe(d) {
  const codigo = String(d.partner || '').trim().toLowerCase();
  if (!CODIGO_PARTNER.test(codigo)) { return null; }
  const lista = (process.env.PARTNERS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  return { codigo, reconocido: lista.length ? lista.includes(codigo) : null };
}

/* El lead, en el panel del partner que lo trajo: tipo, personas, fecha y en
   qué registro de Zoho está. Ni nombre, ni correo, ni teléfono: el partner ve
   que le hemos traído trabajo, no a quién. Si el portal no está configurado o
   el código no es de un partner activo, no se anota nada. */
async function anotarEnPortal(form, d, modulo, id) {
  const p = partnerDe(d);
  if (!p || p.reconocido === false || !PORTAL.configurado()) { return; }
  try {
    const partner = await PORTAL.partnerPorCodigo(p.codigo);
    if (!partner || partner.estado !== 'activo') { return; }
    const personas = Number.parseInt(d.pax || d.personas, 10);
    await PORTAL.anotar('leads', {
      partner_id: partner.id,
      zoho_modulo: modulo, zoho_id: id ? String(id) : null,
      tipo_evento: legible(form, 'tipo', d.tipo) || form,
      personas: personas > 0 ? personas : null,
      fecha_evento: FECHA.test(d.fecha || '') ? d.fecha : null,
    });
  } catch (e) {
    console.error('El lead está en Zoho, pero no en el panel del partner:', e.message);
  }
}

/* Lo que el partner pone en un registro de Zoho: el código en su campo y la
   fuente «partner», solo si el código es bueno. */
function camposPartner(d) {
  const p = partnerDe(d);
  if (!p || p.reconocido === false) { return {}; }
  const r = {};
  if (process.env.ZOHO_CAMPO_PARTNER) { r[process.env.ZOHO_CAMPO_PARTNER] = p.codigo; }
  if (process.env.ZOHO_LEAD_SOURCE_PARTNER) { r.Lead_Source = process.env.ZOHO_LEAD_SOURCE_PARTNER; }
  return r;
}

function ficha(form, d, cuando) {
  const l = [`Formulario: ${form}`, `Idioma de la web: ${legible(form, 'idioma', d.idioma) || '—'}`,
             `Recibido: ${cuando}`, ''];
  for (const [campo, etiqueta] of Object.entries(ETIQUETAS)) {
    const v = (d[campo] || '').toString().trim();
    if (v) { l.push(`${etiqueta}: ${legible(form, campo, v)}`); }
  }
  const exp = Object.entries(EXPERIENCIAS).filter(([k]) => d[k]).map(([, v]) => v);
  if (exp.length) { l.push(`Experiencias marcadas: ${exp.join(', ')}`); }
  const p = partnerDe(d);
  if (p) { l.push(`Partner que lo trae: ${p.codigo}${p.reconocido === false ? ' (código no reconocido)' : ''}`); }
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
  return { ...r, ...camposPartner(d) };
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

/* Upsert por correo: si ya escribió hace un mes, se actualiza su ficha en vez
   de crear un duplicado que luego hay que fusionar a mano. */
const upsert = registro =>
  zoho('Leads/upsert', { data: [registro], duplicate_check_fields: ['Email'] });

const nota = (modulo, id, titulo, texto) =>
  zoho(`${modulo}/${id}/Notes`, { data: [{ Note_Title: titulo, Note_Content: texto }] });

/* --- La respuesta preparada ------------------------------------------------
   Lo que lee Claude para escribirla es lo que se pidió: ni correo, ni
   teléfono, ni presupuesto, ni lo que solo nos sirve a nosotros (quién decide,
   de dónde llegó). Tampoco las restricciones: pueden ser de salud. */

const PARA_RESPUESTA = ['tipo', 'pax', 'personas', 'fecha', 'fecha_firme', 'duracion', 'objetivo', 'espacio', 'seleccion',
  'catering', 'movilidad', 'idioma_evento', 'mercado', 'cargo', 'a_traves_de', 'perfil', 'poblacion', 'mensaje'];

function peticion(form, d) {
  const { nombre } = RESP.quienEs(d);
  const empresa = String(d.empresa || '').trim();
  const l = [...(nombre ? [`Nombre: ${nombre}`] : []), ...(empresa ? [`Empresa: ${empresa}`] : [])];
  for (const campo of PARA_RESPUESTA) {
    const v = String(d[campo] || '').trim();
    if (v) { l.push(`${ETIQUETAS[campo]}: ${legible(form, campo, v).slice(0, 3000)}`); }
  }
  const exp = Object.entries(EXPERIENCIAS).filter(([k]) => d[k]).map(([, v]) => v);
  if (exp.length) { l.push(`Experiencias que le interesan: ${exp.join(', ')}`); }
  return l.join('\n');
}

/* La respuesta, en una nota del registro, con su tarea para hoy y su coste en
   el portal. Nada de esto puede tumbar el lead, que ya está dentro: lo que
   falle queda en el registro de la función. Sin `destino` (prueba en seco)
   solo la prepara. */
async function responder(form, d, cuando, destino, seguimiento = null) {
  try {
    const r = await RESP.preparar({ form, d, cuando, peticion: peticion(form, d), seguimiento,
      apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL });
    if (!destino) { return r; }
    const fallos = [];
    try {
      await nota(destino.modulo, destino.id, RESP.TITULO_NOTA, RESP.notaTexto(r));
    } catch (e) { fallos.push('nota: ' + e.message); }
    if (process.env.ZOHO_AVISO_TAREA !== '0') {
      try {
        const t = { ...RESP.tarea(r, cuando), What_Id: { id: destino.id }, $se_module: destino.modulo };
        if (destino.contacto) { t.Who_Id = { id: destino.contacto }; }
        await zoho('Tasks', { data: [t] });
      } catch (e) { fallos.push('tarea: ' + e.message); }
    }
    if (r.uso && PORTAL.configurado()) {
      await PORTAL.anotar('uso_ia', {
        operacion: `respuesta-${form}`, modelo: r.uso.modelo,
        tokens_entrada: r.uso.tokens.entrada, tokens_salida: r.uso.tokens.salida, tokens_cache: r.uso.tokens.cache,
        coste_usd: r.uso.usd || 0, zoho_modulo: destino.modulo, zoho_id: String(destino.id),
      }).catch(e => fallos.push('coste: ' + e.message));
    }
    console.log(`Respuesta preparada (${r.modo}) en ${destino.modulo}`
      + (r.uso ? ` · ${r.uso.modelo} · ${r.uso.tokens.entrada}+${r.uso.tokens.salida} tokens · ${r.uso.usd ?? '?'} USD` : ''));
    if (fallos.length) { console.error('La respuesta está preparada, pero:', fallos.join(' · ')); }
    return { ...r, fallos };
  } catch (e) {
    console.error('No se pudo preparar la respuesta:', e.message);
    return null;
  }
}

/* --- El seguimiento del cliente ---------------------------------------------
   Cada pedido de propuesta abre su página de seguimiento
   (/seguimiento/<id>/<clave>, ver netlify/functions/seguimiento.mjs): el
   cliente ve cómo van las propuestas sin entrar, y el enlace va en la
   respuesta preparada y en una nota de su ficha. Sin propuestas todavía: las
   añade tools/evento-cliente.mjs cuando los espacios contestan. El id lleva el
   final del registro de Zoho para que dos pedidos del mismo día no choquen. */
export function eventoSeguimiento(b, d, zohoId) {
  const ev = b?.evento;
  if (!ev?.id || !zohoId) { return null; }
  const pax = Number.parseInt(d.personas || d.pax, 10);
  return {
    id: `${ev.id}-${String(zohoId).slice(-6)}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 80),
    titulo: (ev.titulo || legible('propuesta', 'tipo', d.tipo) || 'Vuestro evento').slice(0, 160),
    fecha: FECHA.test(d.fecha || '') ? d.fecha : null,
    estado: 'propuesta',
    datos: { pax: Number.isFinite(pax) ? pax : null, propuestas: [], faltan: [] },
  };
}

async function abrirSeguimiento(b, d, zohoId, base) {
  const fila = eventoSeguimiento(b, d, zohoId);
  if (!fila || !PORTAL.configurado()) { return null; }
  try {
    const [c] = await PORTAL.rest('eventos_cliente?select=id,clave', { method: 'POST', body: fila, prefer: 'return=representation' });
    return c?.clave ? `${base}/seguimiento/${c.id}/${c.clave}` : null;
  } catch (e) {
    console.error('No se pudo abrir el seguimiento del cliente:', e.message);
    return null;
  }
}

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
  const origen = { ...(process.env.ZOHO_LEAD_SOURCE ? { Lead_Source: process.env.ZOHO_LEAD_SOURCE } : {}),
                   ...camposPartner(d) };

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

const AUTORIZA = { si: 'Web autorizada', revisar: 'Web por revisar', no: 'Web no autorizada' };

/* Lo que comparten las dos fichas: la persona de contacto y el registro de
   cambios. `borrador` es la versión de la que partió el formulario: la ficha
   prellenada que les mandamos o su envío anterior. Las notas se archivan en la
   cuenta y la persona se reconoce por su correo, así que cada envío deja su
   versión y lo que cambió respecto a la anterior. */
function comun(d, comparar = PROV.cambios) {
  const v = k => (d[k] || '').toString().trim() || undefined;
  const persona = v('contacto_persona');
  const correo = v('contacto_correo');
  const movil = v('contacto_movil');
  const contacto = (persona || correo || movil)
    ? { Last_Name: persona || correo || movil, Email: correo, Mobile: movil, Title: v('contacto_cargo') }
    : null;
  let partida = null;
  try { partida = d.borrador ? JSON.parse(String(d.borrador).slice(0, 50000)) : null; } catch { partida = null; }
  const lista = partida && typeof partida === 'object' ? comparar(partida, d) : null;
  const registro = lista === null
    ? ['## Cambios', 'Primera versión: no partía de ningún borrador.']
    : ['## Cambios respecto a la versión anterior', lista.length ? cambiosTexto(lista) : 'Ninguno: la confirman tal cual.'];
  return { contacto, correo, persona, movil, partida, lista, registro, importado: v('importado') };
}

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
  const { contacto, correo, persona, movil, lista, registro, importado } = comun(d, cambios);
  const etiquetas = [process.env.ZOHO_ETIQUETA_LOCALIZACION || 'Localización'];
  if (ETIQUETA_TIPO[d.tipo]) { etiquetas.push(ETIQUETA_TIPO[d.tipo]); }
  /* La autorización de publicar, también como etiqueta: es el filtro con el
     que se decide qué ficha se puede pasar a la web. */
  if (AUTORIZA[d.autoriza]) { etiquetas.push(AUTORIZA[d.autoriza]); }
  /* Pendiente de visita hasta que una ficha llegue con la fecha de la visita.
     Un espacio que se da de alta solo, o que importa su catálogo, entra así:
     no se publica nada de él (la web sale solo de data/espacios.json, en el
     repositorio privado) y nos llega una tarea para ir a verlo. */
  const pendiente = process.env.ZOHO_ETIQUETA_PENDIENTE || 'Pendiente de visita';
  const visitado = Boolean(v('visita_fecha'));
  if (!visitado) { etiquetas.push(pendiente); }
  const nota = [`Ficha de localización · recibida ${cuando}`,
                `Enviada por: ${correo || persona || 'sin correo'}`,
                `Tipo: ${TIPOS[d.tipo] || d.tipo || '—'}`,
                `Publicar en la web: ${AUTORIZA[d.autoriza] || 'sin respuesta'}`,
                `Visita: ${visitado ? `hecha el ${v('visita_fecha')}` : 'pendiente'}`,
                ...(importado ? [`Importada de: ${importado.slice(0, 500)} · el espacio la ha revisado antes de enviarla`] : []),
                '', ...registro, '', fichaTexto(d)];
  if (d.consentimiento) { nota.push('', `Aviso de privacidad aceptado el ${cuando}.`); }
  const titulo = lista === null ? 'Ficha de localización' : `Ficha de localización · ${lista.length} cambios`;
  const tarea = !visitado && process.env.ZOHO_AVISO_TAREA !== '0' ? {
    Subject: `Visitar ${nombre}: ficha de localización nueva`,
    Due_Date: new Date(Date.parse(cuando) + 7 * 864e5 || Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    Description: [`Ha llegado la ficha de «${nombre}» (${TIPOS[d.tipo] || d.tipo || 'sin tipo'}).`,
      importado ? `La han importado de su web o catálogo: ${importado.slice(0, 300)}.` : 'La han rellenado a mano.',
      `Publicar en la web: ${AUTORIZA[d.autoriza] || 'sin respuesta'}. No se publica nada hasta visitarla y validarla.`,
      `Contacto: ${[persona, movil, correo].filter(Boolean).join(' · ') || 'sin contacto'}.`].join('\n'),
  } : null;
  return { cuenta, contacto, etiquetas, quitar: visitado ? [pendiente] : [], pendiente, tarea, titulo, nota: nota.join('\n') };
}

/* --- El proveedor como cuenta --------------------------------------------
   Lo mismo que un espacio, con su tipo de cuenta y sus etiquetas: «Proveedor»
   y la de cada cosa que ofrece (Catering, Música…), que es como se filtran en
   el CRM. «Pendiente de validar» hasta que una ficha llega con la fecha en
   que lo validamos; la primera vez, una tarea para revisarla. */

function proveedor(d, cuando) {
  const v = k => (d[k] || '').toString().trim() || undefined;
  const nombre = v('nombre') || 'Proveedor sin nombre';
  const cuenta = { Account_Name: nombre, Phone: v('telefono'), Website: v('web'), Billing_City: v('poblacion') };
  const tipoCuenta = process.env.ZOHO_TIPO_PROVEEDOR ?? 'Proveedor';
  if (tipoCuenta) { cuenta.Account_Type = tipoCuenta; }
  if (process.env.ZOHO_CAMPO_MARCA) { cuenta[process.env.ZOHO_CAMPO_MARCA] = 'Events Penedès'; }
  const { contacto, correo, persona, movil, lista, registro, importado } = comun(d);
  const ofrece = [d.categoria, ...Object.keys(PROV.CATEGORIAS).filter(k => d[`tambien_${k}`])]
    .filter((k, i, a) => Object.hasOwn(PROV.CATEGORIAS, k) && a.indexOf(k) === i);
  const etiquetas = [process.env.ZOHO_ETIQUETA_PROVEEDOR || 'Proveedor',
    ...ofrece.map(k => PROV.CATEGORIAS[k].zoho).filter(Boolean)];
  if (AUTORIZA[d.autoriza]) { etiquetas.push(AUTORIZA[d.autoriza]); }
  const pendiente = process.env.ZOHO_ETIQUETA_POR_VALIDAR || 'Pendiente de validar';
  const validado = Boolean(v('revision_fecha'));
  if (!validado) { etiquetas.push(pendiente); }
  const categoria = PROV.CATEGORIAS[d.categoria]?.l || d.categoria || '—';
  const servicios = PROV.nombres().filter(n => /^servicio\d+_nombre$/.test(n) && v(n)).length;
  const nota = [`Ficha de proveedor · recibida ${cuando}`,
                `Enviada por: ${correo || persona || 'sin correo'}`,
                `Ofrece: ${ofrece.map(k => PROV.CATEGORIAS[k].l).join(', ') || categoria}`,
                `Servicios con precio: ${servicios}`,
                `Publicar en la web: ${AUTORIZA[d.autoriza] || 'sin respuesta'}`,
                `Validado: ${validado ? `el ${v('revision_fecha')}` : 'pendiente'}`,
                ...(importado ? [`Importada de: ${importado.slice(0, 500)} · el proveedor la ha revisado antes de enviarla`] : []),
                '', ...registro, '', PROV.fichaTexto(d)];
  if (d.consentimiento) { nota.push('', `Aviso de privacidad aceptado el ${cuando}.`); }
  const titulo = lista === null ? 'Ficha de proveedor' : `Ficha de proveedor · ${lista.length} cambios`;
  const tarea = !validado && process.env.ZOHO_AVISO_TAREA !== '0' ? {
    Subject: `Revisar ${nombre}: ficha de proveedor nueva`,
    Due_Date: new Date(Date.parse(cuando) + 7 * 864e5 || Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    Description: [`Ha llegado la ficha de «${nombre}» (${categoria}) con ${servicios} servicios con precio.`,
      importado ? `La han importado de su web o sus tarifas: ${importado.slice(0, 300)}.` : 'La han rellenado a mano.',
      `Publicar en la web: ${AUTORIZA[d.autoriza] || 'sin respuesta'}. No se publica nada hasta validarlo.`,
      `Contacto: ${[persona, movil, correo].filter(Boolean).join(' · ') || 'sin contacto'}.`].join('\n'),
  } : null;
  return { cuenta, contacto, etiquetas, quitar: validado ? [pendiente] : [], pendiente, tarea, titulo, nota: nota.join('\n') };
}

async function crearCuenta({ cuenta, contacto, etiquetas, quitar, pendiente, tarea, titulo, nota: texto }) {
  const ids = {};
  ids.cuenta = idDe(await zoho('Accounts/upsert', { data: [cuenta], duplicate_check_fields: ['Account_Name'] }));
  if (!ids.cuenta) { throw new Error('Zoho no devolvió el id de la cuenta'); }

  /* Lo que viene después de la cuenta no puede tumbarla: si falla una
     etiqueta o el contacto, el espacio ya está dentro y queda en el registro. */
  const avisos = [];
  /* ¿Ya estaba pendiente de visita? Entonces ya hay tarea: cada corrección
     del espacio no puede crear otra. Si no se puede saber, se crea: un aviso
     de más se borra; uno de menos es un espacio que nadie va a ver. */
  let yaPendiente = false;
  if (tarea) {
    try {
      const j = await zohoGet(`Accounts/${ids.cuenta}?fields=Tag`);
      yaPendiente = (j.data?.[0]?.Tag || []).some(t => t.name === pendiente);
    } catch (e) { avisos.push('etiquetas previas: ' + e.message); }
  }
  if (quitar?.length) {
    try {
      const q = encodeURIComponent(quitar.join(','));
      await zoho(`Accounts/${ids.cuenta}/actions/remove_tags?tag_names=${q}`, {});
    } catch (e) { avisos.push('quitar etiquetas: ' + e.message); }
  }
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
    await nota('Accounts', ids.cuenta, titulo, texto);
  } catch (e) { avisos.push('nota: ' + e.message); }
  if (tarea && !yaPendiente) {
    try {
      ids.tarea = idDe(await zoho('Tasks', { data: [{ ...tarea, What_Id: { id: ids.cuenta }, $se_module: 'Accounts' }] }));
    } catch (e) { avisos.push('tarea: ' + e.message); }
  }
  return { ids, avisos };
}

/* --- La función ---------------------------------------------------------- */

export default async (req, context) => {
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

  if (form === FORM_LOCALIZACION || form === PROV.FORM) {
    const esProv = form === PROV.FORM;
    const loc = esProv ? proveedor(d, cuando) : localizacion(d, cuando);
    if (process.env.ZOHO_DRY_RUN === '1') {
      console.log(`DRY RUN · ${form}:`, JSON.stringify(loc, null, 2));
      return Response.json({ ok: true, dry_run: true, [esProv ? 'proveedor' : 'localizacion']: loc });
    }
    try {
      const { ids, avisos } = await crearCuenta(loc);
      console.log(`${esProv ? 'Proveedor' : 'Localización'} en Zoho:`, JSON.stringify(ids));
      if (avisos.length) { console.error('La cuenta está, pero:', avisos.join(' · ')); }
      return Response.json({ ok: true, modulo: 'Accounts', avisos });
    } catch (e) {
      /* Si la cuenta no entra, entra como lead con la ficha: perder una visita
         entera por organizarla mejor sería cambiar lo importante por lo cómodo. */
      console.error(`No se pudo crear la cuenta (${form}); entra como lead:`, e.message);
      try {
        const r = { Last_Name: (d.contacto_persona || d.nombre || (esProv ? 'Proveedor' : 'Localización')).trim(),
                    Company: (d.nombre || (esProv ? 'Proveedor' : 'Localización')).trim(),
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
  /* La valoración de un evento no es un lead: quien la manda ya es cliente, y
     un upsert por correo le abriría una ficha nueva. Se queda en Netlify, con
     sus fotos, y llega por el aviso de correo del formulario. */
  if (form === 'valoracion') {
    console.log(`Valoración de «${(d.evento || '').toString().slice(0, 120)}»: ${d.nota ?? '—'}/10, permiso ${d.permiso || 'no'}. No va a Zoho.`);
    return Response.json({ ok: true, modulo: null });
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
    const respuesta = RESP.FORMULARIOS.includes(form) ? await responder(form, d, cuando, null) : null;
    return Response.json({ ok: true, dry_run: true, lead: op ? null : registro, oportunidad: op, nota: b?.nota || null, respuesta });
  }

  /* Primero la oportunidad, si toca. Si Zoho la rechaza —una etapa que no
     existe, un token sin permiso—, el briefing entra como lead: perder la
     petición por organizarla mejor sería cambiar lo importante por lo cómodo. */
  let modulo = 'Leads', id, contacto;
  if (op) {
    try {
      const ids = await crearOportunidad(op);
      modulo = 'Deals'; id = ids.trato; contacto = ids.contacto;
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

  await anotarEnPortal(form, d, modulo, id);

  /* El borrador, en una nota de la oportunidad o del lead. Si falla, la ficha
     ya está dentro y el enlace en el registro de la función: se avisa y se sigue. */
  const seguimiento = b && id ? await abrirSeguimiento(b, d, id, process.env.URL || 'https://eventspenedes.com') : null;
  if (seguimiento) { console.log(`Seguimiento del cliente: ${seguimiento}`); }

  let fallo = null;
  if (b && id) {
    try {
      await nota(modulo, id, 'Borrador de propuesta', (b.nota.trim() + (seguimiento
        ? `\n\nSeguimiento para el cliente (sin entrar, sin precios): ${seguimiento}` : '')).trim());
    } catch (e) {
      console.error(`La ficha está en Zoho (${modulo}), pero no la nota del borrador:`, e.message);
      fallo = e.message;
    }
  }

  /* La respuesta preparada, después de contestar a Netlify: escribirla con
     Claude lleva unos segundos y el aviso del formulario no tiene por qué
     esperarlos. Sin `waitUntil` (en las pruebas) se espera aquí. */
  const trabajo = id && RESP.FORMULARIOS.includes(form) ? responder(form, d, cuando, { modulo, id, contacto }, seguimiento) : null;
  if (trabajo && context?.waitUntil) { context.waitUntil(trabajo); }
  const r = trabajo && !context?.waitUntil ? await trabajo : null;
  return Response.json({ ok: true, modulo, ...(fallo ? { nota: false, error: fallo } : {}), ...(r ? { respuesta: r.modo } : {}) });
};
