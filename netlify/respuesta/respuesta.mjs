/* =============================================================================
   Events Penedès · la respuesta a quien nos escribe, preparada y sin enviar

   Cada petición que llega por la web (propuesta, contacto, alta de agencia y
   «Entra en la red») sale de aquí con su correo de respuesta escrito: asunto y
   texto en el idioma de la web que usó, con lo que pidió y el siguiente paso.
   La función de leads lo deja en una nota de su registro de Zoho, con tres
   enlaces (abrirlo en Gmail ya escrito, lo mismo con el programa de correo y
   agendar la llamada en Google Calendar) y una tarea para responder hoy.

   Nunca se envía solo: lo lee, lo retoca y lo envía una persona.

   Con ANTHROPIC_API_KEY lo escribe Claude; sin ella, o si falla, sale de una
   plantilla fija que dice lo mismo con menos gracia. Claude solo ve lo que se
   pidió (sin correo ni teléfono) y lo que dice este fichero: no conoce
   tarifas, comisiones ni nada interno, así que no lo puede contar. Aun así se
   revisa: un importe o un enlace que no es nuestro quedan avisados en la nota.
   ========================================================================== */
import { mensaje, textoDe, MODELO } from '../ia/claude.mjs';

export const AGENDA = 'https://calendar.app.google/124c4fJD7QDJTq2q9';
export const FORMULARIOS = ['propuesta', 'contacto', 'agencia', 'red'];
export const TITULO_NOTA = 'Respuesta preparada · sin enviar';

const IDIOMAS = { es: 'castellano', ca: 'catalán', en: 'inglés' };
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/* Un correo con ? & , ; o espacios en un enlace mailto: puede colar destinatarios */
const CORREO = /^[^\s@?&#%/,;:<>"'()[\]\\]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

const sitio = () => (process.env.URL || 'https://eventspenedes.com').replace(/\/+$/, '');
const nuestros = () => [AGENDA, sitio(), 'https://eventspenedes.com', 'https://www.eventspenedes.com'];

/* Qué es cada formulario, para la tarea y para Claude */
const QUE = {
  propuesta: 'pide una propuesta para su evento',
  contacto: 'escribe por el formulario de contacto',
  agencia: 'se da de alta como agencia o DMC',
  red: 'quiere entrar en la red como espacio o proveedor',
};

/* El siguiente paso de cada formulario. Es lo único que el correo promete */
const SIGUIENTE = {
  propuesta: a => `ya estamos preparando su propuesta; para afinarla, una llamada de 20 minutos que reserva cuando le vaya bien en ${a.agenda}${a.seguimiento ? `. Y puede ver en todo momento cómo va su propuesta en ${a.seguimiento} (se actualiza sola con cada espacio que contesta): pon este enlace tal cual` : ''}`,
  contacto: a => `una llamada de 20 minutos para concretarlo, que reserva cuando le vaya bien en ${a.agenda}`,
  agencia: a => `le adjuntamos nuestro catálogo para agencias (lo adjunta Álvaro al enviar: nómbralo como adjunto, sin describir lo que trae) y le proponemos una llamada de 20 minutos para conocernos: ${a.agenda}`,
  red: a => `rellenar su ficha en ${a.ficha}, que puede empezar desde su web o sus tarifas en PDF; después le llamamos para conocernos`,
};

export const GUIA = ({ idioma, siguiente }) => `Preparas el primer correo de respuesta de Events Penedès a alguien que acaba de escribirnos desde la web. No lo envías tú: lo revisa y lo envía Álvaro Solache, que firma.

Events Penedès produce eventos de empresa en el Alt Penedès: masías, bodegas y almazaras, catas, gastronomía, castells y transporte, con un solo interlocutor de principio a fin.

Escribe en ${idioma}, de tú, cercano y profesional, sin fórmulas de plantilla. El texto, de menos de 130 palabras, en párrafos cortos, sin listas ni formato.

Qué lleva el correo, y nada más:
1. Las gracias y, en una frase, lo que nos ha pedido, con sus datos (qué evento, cuántas personas, cuándo) si los ha dado.
2. Si pregunta algo, la respuesta solo si está en estas líneas o en lo que ha escrito; si no, que lo concretamos en la llamada o en la propuesta.
3. El siguiente paso: ${siguiente}.
4. La despedida y la firma: Álvaro Solache · Events Penedès.

Nunca:
- precios, importes, presupuestos, descuentos ni comisiones, aunque los pida: van en la propuesta;
- confirmar que una fecha, un espacio o un proveedor están libres;
- nombrar espacios, proveedores, clientes, proyectos o personas que no haya nombrado quien escribe;
- prometer plazos o cosas que no estén en estas líneas;
- inventar datos que no estén en su mensaje.

Lo que pida y no se pueda contestar con esto va en «pendiente», en castellano, una línea por cosa, para que lo conteste Álvaro.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    asunto: { type: 'string' },
    cuerpo: { type: 'string' },
    pendiente: { type: 'array', items: { type: 'string' } },
  },
  required: ['asunto', 'cuerpo', 'pendiente'],
  additionalProperties: false,
};

/* --- La plantilla fija, por idioma ---------------------------------------- */

const PLANTILLA = {
  es: {
    locale: 'es-ES',
    hola: n => (n ? `Hola, ${n}:` : 'Hola:'),
    gracias: {
      propuesta: 'Gracias por contarnos tu evento. Ya estamos preparando la propuesta.',
      contacto: 'Gracias por escribirnos.',
      agencia: 'Gracias por darte de alta como agencia. Te adjunto nuestro catálogo para agencias.',
      red: 'Gracias por querer entrar en la red de Events Penedès.',
    },
    datos: p => `Tomamos nota: ${p.join(', ')}.`,
    personas: n => `${n} personas`,
    siguiente: {
      propuesta: a => `Para afinarla, ¿hablamos 20 minutos? Elige el momento que mejor te vaya: ${a.agenda}${a.seguimiento ? `\n\nAquí puedes ver en todo momento cómo va tu propuesta; se actualiza sola cada vez que un espacio nos contesta: ${a.seguimiento}` : ''}`,
      contacto: a => `Lo vemos mejor en una llamada de 20 minutos. Elige el momento que mejor te vaya: ${a.agenda}`,
      agencia: a => `Si te va bien, hablamos 20 minutos para conocernos: ${a.agenda}`,
      red: a => `El siguiente paso es vuestra ficha, que podéis empezar desde vuestra web o vuestras tarifas en PDF: ${a.ficha}\n\nDespués os llamamos para conocernos.`,
    },
    adios: 'Un saludo,',
    asunto: {
      propuesta: 'Tu evento en el Penedès', contacto: 'Tu mensaje a Events Penedès',
      agencia: 'Catálogo de Events Penedès para agencias', red: 'Entrar en la red de Events Penedès',
    },
    llamada: 'Llamada de 20 minutos con Events Penedès.',
  },
  ca: {
    locale: 'ca-ES',
    hola: n => (n ? `Hola, ${n},` : 'Hola,'),
    gracias: {
      propuesta: 'Gràcies per explicar-nos el teu esdeveniment. Ja estem preparant la proposta.',
      contacto: 'Gràcies per escriure’ns.',
      agencia: 'Gràcies per donar-te d’alta com a agència. T’adjunto el nostre catàleg per a agències.',
      red: 'Gràcies per voler entrar a la xarxa d’Events Penedès.',
    },
    datos: p => `En prenem nota: ${p.join(', ')}.`,
    personas: n => `${n} persones`,
    siguiente: {
      propuesta: a => `Per afinar-la, en parlem 20 minuts? Tria el moment que et vagi millor: ${a.agenda}${a.seguimiento ? `\n\nAquí pots veure en tot moment com va la teva proposta; s’actualitza sola cada vegada que un espai ens contesta: ${a.seguimiento}` : ''}`,
      contacto: a => `Ho veurem millor en una trucada de 20 minuts. Tria el moment que et vagi millor: ${a.agenda}`,
      agencia: a => `Si et va bé, en parlem 20 minuts per conèixer-nos: ${a.agenda}`,
      red: a => `El següent pas és la vostra fitxa, que podeu començar des del vostre web o les vostres tarifes en PDF: ${a.ficha}\n\nDesprés us truquem per conèixer-nos.`,
    },
    adios: 'Salutacions,',
    asunto: {
      propuesta: 'El teu esdeveniment al Penedès', contacto: 'El teu missatge a Events Penedès',
      agencia: 'Catàleg d’Events Penedès per a agències', red: 'Entrar a la xarxa d’Events Penedès',
    },
    llamada: 'Trucada de 20 minuts amb Events Penedès.',
  },
  en: {
    locale: 'en-GB',
    hola: n => (n ? `Hi ${n},` : 'Hello,'),
    gracias: {
      propuesta: 'Thank you for telling us about your event. We are already working on the proposal.',
      contacto: 'Thank you for getting in touch.',
      agencia: 'Thank you for registering as an agency. Please find attached our catalogue for agencies.',
      red: 'Thank you for wanting to join the Events Penedès network.',
    },
    datos: p => `We have noted: ${p.join(', ')}.`,
    personas: n => `${n} people`,
    siguiente: {
      propuesta: a => `To fine-tune it, shall we talk for 20 minutes? Pick the time that suits you best: ${a.agenda}${a.seguimiento ? `\n\nYou can follow your proposal here at any time; it updates itself each time a venue gets back to us: ${a.seguimiento}` : ''}`,
      contacto: a => `It will be easier on a 20-minute call. Pick the time that suits you best: ${a.agenda}`,
      agencia: a => `If it suits you, let’s talk for 20 minutes to get to know each other: ${a.agenda}`,
      red: a => `The next step is your profile, which you can start from your website or your price list in PDF: ${a.ficha}\n\nThen we will call you to get to know each other.`,
    },
    adios: 'Best regards,',
    asunto: {
      propuesta: 'Your event in the Penedès', contacto: 'Your message to Events Penedès',
      agencia: 'Events Penedès catalogue for agencies', red: 'Joining the Events Penedès network',
    },
    llamada: '20-minute call with Events Penedès.',
  },
};

const FIRMA = 'Álvaro Solache\nEvents Penedès · eventspenedes.com';

/* --- Lo que sale de la petición -------------------------------------------- */

/* El día de una fecha ISO en Madrid, AAAA-MM-DD */
export const diaMadrid = cuando =>
  new Date(Date.parse(cuando) || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });

function siguienteLaborable(cuando) {
  const d = new Date(`${diaMadrid(cuando)}T12:00:00Z`);
  do { d.setUTCDate(d.getUTCDate() + 1); } while ([0, 6].includes(d.getUTCDay()));
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/* Quién escribe, cómo se le saluda y adónde se le responde */
export function quienEs(d) {
  const persona = String(d.persona || d.nombre || '').trim();
  const empresa = String(d.empresa || '').trim();
  const correo = String(d.correo || '').trim();
  return {
    nombre: persona.split(/\s+/)[0] || '',
    correo: CORREO.test(correo) ? correo : '',
    correoMalo: Boolean(correo) && !CORREO.test(correo),
    quien: persona ? `${persona}${empresa ? ` (${empresa})` : ''}` : (empresa || correo || 'quien escribe'),
  };
}

function plantilla({ form, d, idioma, a, nombre }) {
  const t = PLANTILLA[idioma];
  const pax = Number.parseInt(d.pax || d.personas, 10);
  const datos = [];
  if (form === 'propuesta' || form === 'contacto') {
    if (pax > 0) { datos.push(t.personas(pax)); }
    if (FECHA.test(d.fecha || '')) {
      datos.push(new Date(`${d.fecha}T12:00:00Z`).toLocaleDateString(t.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }));
    }
  }
  const gracias = [t.gracias[form], datos.length ? t.datos(datos) : ''].filter(Boolean).join(' ');
  return {
    asunto: t.asunto[form],
    cuerpo: [t.hola(nombre), gracias, t.siguiente[form](a), `${t.adios}\n${FIRMA}`].join('\n\n'),
  };
}

/* Lo que no puede salir sin que lo mire alguien: un importe o un enlace que
   no es nuestro. Claude no tiene de dónde sacarlos, pero la plantilla de una
   persona tampoco debería llevarlos sin querer. */
const IMPORTE = /\d[\d.,]*\s?(?:€|eur\b|euros?\b)|€\s?\d/i;
const ENLACE = /https?:\/\/[^\s)>\]"']+/g;

export function revisar({ asunto, cuerpo }) {
  const avisos = [];
  const todo = `${asunto}\n${cuerpo}`;
  if (IMPORTE.test(todo)) { avisos.push('Lleva un importe: los precios van en la propuesta, no en este correo.'); }
  const ajenos = [...todo.matchAll(ENLACE)].map(m => m[0].replace(/[.,;:!?]+$/, ''))
    .filter(u => !nuestros().some(p => u === p || u.startsWith(`${p}/`) || u.startsWith(`${p}?`)));
  if (ajenos.length) { avisos.push(`Lleva enlaces que no son nuestros: ${[...new Set(ajenos)].join(' · ')}`); }
  return avisos;
}

/* Gmail con el correo escrito, el mismo con el programa de correo y la
   llamada en Google Calendar al siguiente día laborable a las 10:00 */
export function enlaces({ correo, asunto, cuerpo, quien, cuando, idioma }) {
  const e = encodeURIComponent;
  const dia = siguienteLaborable(cuando);
  const cal = { action: 'TEMPLATE', text: `Events Penedès · ${quien}`, details: PLANTILLA[idioma].llamada,
                dates: `${dia}T100000/${dia}T102000`, ctz: 'Europe/Madrid', ...(correo ? { add: correo } : {}) };
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${e(correo)}&su=${e(asunto)}&body=${e(cuerpo)}`,
    correo: `mailto:${correo}?subject=${e(asunto)}&body=${e(cuerpo)}`,
    calendario: `https://calendar.google.com/calendar/render?${Object.entries(cal).map(([k, v]) => `${k}=${e(v)}`).join('&')}`,
  };
}

/* --- La respuesta ---------------------------------------------------------
   `peticion` es lo que se pidió, una línea por dato y sin correo ni teléfono:
   es lo único que Claude lee de quien escribe. */
export async function preparar({ form, d = {}, cuando, peticion = '', seguimiento = null, apiKey, model, fetch = globalThis.fetch } = {}) {
  const idioma = Object.hasOwn(IDIOMAS, d.idioma) ? d.idioma : 'es';
  const { nombre, correo, correoMalo, quien } = quienEs(d);
  const ficha = d.perfil === 'localizacion' ? '/alta-localizacion' : '/alta-proveedor';
  const a = { agenda: AGENDA, ficha: `${sitio()}${ficha}`, seguimiento };
  const avisos = [];
  let texto = null, modo = 'plantilla', uso = null, pendiente = [];

  if (apiKey) {
    try {
      const r = await mensaje({
        model: model || MODELO,
        max_tokens: 2000,
        system: GUIA({ idioma: IDIOMAS[idioma], siguiente: SIGUIENTE[form](a) }),
        output_config: { effort: 'low', format: { type: 'json_schema', schema: ESQUEMA } },
        messages: [{ role: 'user', content: `Quien escribe ${QUE[form]}.\nIdioma de la web que usó: ${IDIOMAS[idioma]}\n\n${peticion}`.trim() }],
      }, { apiKey, fetch, espera: 25000 });
      const salida = JSON.parse(textoDe(r.respuesta));
      if (!String(salida.asunto || '').trim() || !String(salida.cuerpo || '').trim()) { throw new Error('respuesta vacía'); }
      texto = { asunto: String(salida.asunto).trim(), cuerpo: String(salida.cuerpo).trim() };
      pendiente = (Array.isArray(salida.pendiente) ? salida.pendiente : []).map(String).filter(x => x.trim());
      uso = r.uso;
      modo = 'claude';
    } catch (e) {
      avisos.push(`Claude no la ha podido escribir (${e.message}): sale de la plantilla fija.`);
    }
  }
  if (!texto) {
    texto = plantilla({ form, d, idioma, a, nombre });
    const m = String(d.mensaje || '').trim();
    if (m) { pendiente.push(`Contestar lo que escribe: «${m.slice(0, 300)}${m.length > 300 ? '…' : ''}»`); }
  }
  avisos.push(...revisar(texto));
  if (seguimiento && !texto.cuerpo.includes(seguimiento)) { avisos.push(`No lleva el enlace de seguimiento del cliente: añádelo, ${seguimiento}`); }
  if (form === 'agencia') {
    avisos.push(`Adjunta el catálogo para agencias en PDF${process.env.CATALOGO_AGENCIAS_URL ? `: ${process.env.CATALOGO_AGENCIAS_URL}` : ''}.`);
  }
  if (correoMalo) { avisos.push('El correo que dejó no parece válido: no va en los enlaces.'); }
  else if (!correo) { avisos.push('No dejó correo: falta a quién enviarlo.'); }

  return { form, idioma, modo, ...texto, pendiente, avisos, uso, correo, quien,
           enlaces: enlaces({ correo, ...texto, quien, cuando, idioma }) };
}

/* --- Lo que queda en Zoho -------------------------------------------------- */

export function notaTexto(r) {
  const usd = r.uso?.usd;
  const l = [r.modo === 'claude'
    ? `Escrita por Claude (${r.uso?.modelo || 'modelo desconocido'}${usd == null ? '' : `, ${usd} USD`}), en ${IDIOMAS[r.idioma]}.`
    : `Escrita con la plantilla fija, en ${IDIOMAS[r.idioma]}.`,
  'No se ha enviado nada: revísala y envíala tú.'];
  if (r.avisos.length) { l.push('', 'Antes de enviar:', ...r.avisos.map(x => `· ${x}`)); }
  if (r.pendiente.length) { l.push('', 'Lo que deja para ti:', ...r.pendiente.map(x => `· ${x}`)); }
  l.push('', `Abrir en Gmail, ya escrita: ${r.enlaces.gmail}`,
    `Con tu programa de correo: ${r.enlaces.correo}`,
    `Agendar la llamada en Google Calendar: ${r.enlaces.calendario}`,
    '', `Para: ${r.correo || '—'}`, `Asunto: ${r.asunto}`, '', r.cuerpo);
  return l.join('\n');
}

export function tarea(r, cuando) {
  return {
    Subject: `Responder a ${r.quien}: ${QUE[r.form]}`.slice(0, 200),
    Due_Date: diaMadrid(cuando),
    Priority: 'High',
    Description: [`La respuesta está escrita en la nota «${TITULO_NOTA}»: ábrela en Gmail desde allí, retócala y envíala. No se ha enviado nada.`,
      ...r.avisos.map(x => `· ${x}`), ...r.pendiente.map(x => `· Pendiente: ${x}`)].join('\n'),
  };
}
