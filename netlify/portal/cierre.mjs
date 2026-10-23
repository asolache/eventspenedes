/* =============================================================================
   Events Penedès · el cierre del evento

   El día laborable siguiente a cada evento, a cada persona interesada le
   llega un correo de gracias que le pide las fotos. Al cliente, además, le
   propone una llamada de repaso con el enlace de la agenda de Álvaro. Las
   fotos se suben en /fotos/<clave>, donde también se da (o no) el permiso
   para publicarlas; quien prefiera responder al correo con las fotos, lo
   autoriza en los términos que el propio correo dice.

   Aquí está lo que no depende de la red, para poder probarlo:
     momentoCierre   el día laborable siguiente, a las 10:00 de Madrid
     correoCierre    asunto, html y texto, en castellano, catalán o inglés
     autorizacion    el texto exacto que se acepta, con su versión
     notaZoho        la nota de cierre que se propone para el trato
   ========================================================================== */
import { esc, SITIO } from './pagina.mjs';
import { deMadrid, laborable, TELEFONO } from './recordatorio.mjs';

const HORA = 3600e3;
const DIA = 24 * HORA;
export const AGENDA = 'https://calendar.app.google/124c4fJD7QDJTq2q9';
export const DIAS_MAX = 7;           // pasada una semana, ya no se prepara el cierre

const masDias = (fecha, n) => new Date(Date.parse(`${fecha}T12:00:00Z`) + n * DIA).toISOString().slice(0, 10);

/* El primer día laborable después del evento, a las 10:00. Si ya pasó (la
   función no corrió a tiempo), cuanto antes; pasada una semana, nada. */
export function momentoCierre(fecha, ahora = new Date()) {
  if (ahora.getTime() > deMadrid(masDias(fecha, DIAS_MAX), '18:00').getTime()) { return null; }
  for (let k = 1; k <= DIAS_MAX; k++) {
    const t = deMadrid(masDias(fecha, k), '10:00');
    if (laborable(t)) { return t.getTime() >= ahora.getTime() ? t : new Date(ahora); }
  }
  return null;
}

/* ---------- La autorización ---------- */

export const VERSION_AUTORIZACION = '2026-10-23';

const AUT = {
  es: {
    intro: (e, t) => `Autorizo a Álvaro Solache (Events Penedès) a usar las fotos que envío de «${t}»${e ? `, en nombre de ${e},` : ''} solo para lo que marco aquí:`,
    web: 'Publicarlas en eventspenedes.com y en su blog.',
    redes: 'Publicarlas en sus redes sociales.',
    nombre: 'Decir el nombre de la empresa o entidad junto a las fotos.',
    personas: 'Las personas que se reconocen en las fotos están de acuerdo en que se publiquen.',
    nada: 'Si no marco nada, las fotos son solo para uso interno y no se publican.',
    retirar: 'Puedo retirar este permiso cuando quiera desde el mismo enlace o respondiendo al correo; desde entonces no se publicarán más y se quitarán las ya publicadas.',
  },
  ca: {
    intro: (e, t) => `Autoritzo l'Álvaro Solache (Events Penedès) a fer servir les fotos que envio de «${t}»${e ? `, en nom de ${e},` : ''} només per al que marco aquí:`,
    web: 'Publicar-les a eventspenedes.com i al seu blog.',
    redes: 'Publicar-les a les seves xarxes socials.',
    nombre: "Dir el nom de l'empresa o entitat al costat de les fotos.",
    personas: "Les persones que es reconeixen a les fotos estan d'acord que es publiquin.",
    nada: 'Si no marco res, les fotos són només per a ús intern i no es publiquen.',
    retirar: "Puc retirar aquest permís quan vulgui des del mateix enllaç o responent el correu; des d'aleshores no se'n publicaran més i es trauran les que ja s'hagin publicat.",
  },
  en: {
    intro: (e, t) => `I authorise Álvaro Solache (Events Penedès) to use the photos I send from «${t}»${e ? `, on behalf of ${e},` : ''} only for what I tick here:`,
    web: 'Publish them on eventspenedes.com and its blog.',
    redes: 'Publish them on its social media.',
    nombre: 'Name the company or organisation next to the photos.',
    personas: 'The people who can be recognised in the photos agree to them being published.',
    nada: 'If I tick nothing, the photos are for internal use only and will not be published.',
    retirar: 'I can withdraw this permission at any time from the same link or by replying to the email; from then on no more will be published and those already published will be removed.',
  },
};
export const ALCANCES = ['web', 'redes', 'nombre'];
export const textosAutorizacion = idioma => AUT[idioma] || AUT.es;

/* El texto que queda guardado: lo que vio, con lo que marcó */
export function autorizacion({ idioma = 'es', titulo, enNombreDe, alcance = [], personas = false }) {
  const a = textosAutorizacion(idioma);
  const marca = b => (b ? '[x]' : '[ ]');
  const lineas = [a.intro(enNombreDe, titulo), ...ALCANCES.map(k => `${marca(alcance.includes(k))} ${a[k]}`),
    `${marca(personas)} ${a.personas}`, a.nada, a.retirar];
  return { version: VERSION_AUTORIZACION, texto: lineas.join('\n') };
}

/* ---------- El correo ---------- */

const T = {
  es: {
    locale: 'es-ES', hola: n => `Hola ${n}:`,
    asunto: t => `Gracias por «${t}»`,
    gracias: {
      cliente: (t, d) => `Muchas gracias por confiar en Events Penedès para «${t}» del ${d}. Ha sido un placer prepararlo con vosotros.`,
      otro: (t, d) => `Muchas gracias por vuestro trabajo en «${t}» del ${d}. Sin vosotros no habría sido posible.`,
    },
    repaso: 'Nos gustaría saber cómo lo vivisteis y qué podemos mejorar. Si te va bien, elige un momento para una llamada o videollamada corta:',
    agenda: 'Elegir un momento',
    mejora: 'Si hay algo que creas que podemos mejorar para la próxima vez, responde a este correo.',
    fotos: 'Si tenéis fotos de la jornada, nos encantaría verlas. Puedes subirlas aquí y, en el mismo sitio, decidir si podemos publicarlas en la web y en el blog:',
    subir: 'Subir fotos',
    responder: 'También puedes responder a este correo con las fotos adjuntas. En ese caso entenderemos que nos autorizas a publicarlas en eventspenedes.com y en nuestro blog, y que las personas que salen en ellas están de acuerdo. Puedes retirar el permiso cuando quieras, respondiendo a este correo o desde el mismo enlace.',
    adios: 'Un abrazo,',
  },
  ca: {
    locale: 'ca-ES', hola: n => `Hola ${n},`,
    asunto: t => `Gràcies per «${t}»`,
    gracias: {
      cliente: (t, d) => `Moltes gràcies per confiar en Events Penedès per a «${t}» del ${d}. Ha estat un plaer preparar-ho amb vosaltres.`,
      otro: (t, d) => `Moltes gràcies per la vostra feina a «${t}» del ${d}. Sense vosaltres no hauria estat possible.`,
    },
    repaso: 'Ens agradaria saber com ho vau viure i què podem millorar. Si et va bé, tria un moment per a una trucada o videotrucada curta:',
    agenda: 'Triar un moment',
    mejora: 'Si hi ha res que creguis que podem millorar per a la propera vegada, respon aquest correu.',
    fotos: 'Si teniu fotos de la jornada, ens encantaria veure-les. Les pots pujar aquí i, allà mateix, decidir si les podem publicar a la web i al blog:',
    subir: 'Pujar fotos',
    responder: "També pots respondre aquest correu amb les fotos adjuntes. En aquest cas entendrem que ens autoritzes a publicar-les a eventspenedes.com i al nostre blog, i que les persones que hi surten hi estan d'acord. Pots retirar el permís quan vulguis, responent aquest correu o des del mateix enllaç.",
    adios: 'Una abraçada,',
  },
  en: {
    locale: 'en-GB', hola: n => `Hi ${n},`,
    asunto: t => `Thank you for «${t}»`,
    gracias: {
      cliente: (t, d) => `Thank you very much for trusting Events Penedès with «${t}» on ${d}. It was a pleasure to put it together with you.`,
      otro: (t, d) => `Thank you very much for your work at «${t}» on ${d}. It would not have been possible without you.`,
    },
    repaso: 'We would love to hear how it went for you and what we can improve. If it suits you, pick a time for a short call or video call:',
    agenda: 'Pick a time',
    mejora: 'If there is anything you think we could do better next time, just reply to this email.',
    fotos: 'If you have photos from the day, we would love to see them. You can upload them here and, in the same place, decide whether we may publish them on the website and blog:',
    subir: 'Upload photos',
    responder: 'You can also reply to this email with the photos attached. In that case we will understand that you authorise us to publish them on eventspenedes.com and our blog, and that the people in them agree. You can withdraw permission at any time by replying to this email or from the same link.',
    adios: 'Best wishes,',
  },
};

/* evento: { titulo, fecha } · interesado: { nombre, rol, idioma } */
export function correoCierre({ evento, interesado, clave }) {
  const idioma = T[interesado.idioma] ? interesado.idioma : 'es';
  const t = T[idioma];
  const dia = new Date(`${evento.fecha}T12:00:00Z`).toLocaleDateString(t.locale, { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const cliente = interesado.rol === 'cliente';
  const enlace = `${SITIO}/fotos/${clave}`;
  const gracias = (cliente ? t.gracias.cliente : t.gracias.otro)(evento.titulo, dia);

  const texto = [t.hola(interesado.nombre), '', gracias, '',
    ...(cliente ? [t.repaso, AGENDA, ''] : [t.mejora, '']),
    t.fotos, enlace, '', t.responder, '', t.adios, '', 'Álvaro Solache', `Events Penedès · ${TELEFONO}`, SITIO].join('\n');

  const boton = (href, txt) => `<p><a href="${href}" style="display:inline-block;padding:10px 22px;border:2px solid #8a2b2b;color:#8a2b2b;text-decoration:none;font-weight:bold;border-radius:4px">${esc(txt)}</a></p>`;
  const html = `<!doctype html><html lang="${idioma}"><body style="margin:0;padding:0;background:#f6f3ee" bgcolor="#f6f3ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6f3ee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:Georgia,serif;color:#2b2622;font-size:16px;line-height:1.55" bgcolor="#ffffff">
<tr><td style="padding:20px 28px;border-bottom:3px solid #8a2b2b"><span style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a2b2b">Events Penedès</span><br><strong style="font-size:20px">${esc(t.asunto(evento.titulo))}</strong></td></tr>
<tr><td style="padding:24px 28px">
<p>${esc(t.hola(interesado.nombre))}</p><p>${esc(gracias)}</p>
${cliente ? `<p>${esc(t.repaso)}</p>${boton(AGENDA, t.agenda)}` : `<p>${esc(t.mejora)}</p>`}
<p>${esc(t.fotos)}</p>${boton(enlace, t.subir)}
<p style="font-size:14px;color:#5a524b">${esc(t.responder)}</p>
<p>${esc(t.adios)}</p>
<p style="margin-top:24px">Álvaro Solache<br>Events Penedès · ${TELEFONO}<br><a href="${SITIO}" style="color:#8a2b2b">eventspenedes.com</a></p>
</td></tr></table></td></tr></table></body></html>`;

  return { asunto: t.asunto(evento.titulo), html, texto };
}

/* ---------- Lo interno: la nota para el trato de Zoho ---------- */

export function notaZoho({ evento, preparados }) {
  const quien = preparados.map(p => `${p.nombre} (${p.rol})`).join(', ');
  return [`Cierre de «${evento.titulo}» (${evento.fecha}).`,
    `Agradecimiento y petición de fotos con autorización preparados para: ${quien || 'nadie'}.`,
    'Falta: valoración de Álvaro sobre el resultado y cobrar el 25 % pendiente de la factura (ya emitida por el 100 %).'].join('\n');
}
