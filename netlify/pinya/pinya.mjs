/* =============================================================================
   TeamTowers · la petición de Fent Pinya, del formulario a Zoho

   teamtowers.eu/presupuesto es un formulario de Netlify del sitio de
   TeamTowers. Su aviso (Forms → Notifications → HTTP POST request) llega a la
   misma función de leads que los formularios de Events Penedès: el CRM es uno
   y el cliente de Zoho también. Aquí solo vive lo que es de Fent Pinya:

   · `origenDe()`   de dónde llega: Events Penedès, agencia, buscador o directa.
   · `tramoDe()`    el tramo de la tarifa por personas.
   · `oportunidad()` cuenta + contacto + oportunidad, con la marca TeamTowers,
                    el importe del tramo y las etiquetas del origen.
   · `borrador()`   el correo de la propuesta, escrito con la tarifa, en el
                    idioma de quien pide. No se envía: lo revisa y lo manda
                    Álvaro desde el enlace de Gmail de la nota.

   La tarifa NO está en este repositorio, que es público: vive en la variable
   TARIFA_FENT_PINYA de Netlify, en JSON, y la fuente es
   Teamtowers-estrategia/oferta/fent-pinya.md (privado). Sin la variable, la
   oportunidad entra sin importe y el borrador sin precio, con el aviso.

     TARIFA_FENT_PINYA = {"anio":2027,"iva":21,"tramos":[
       {"desde":10,"hasta":29,"precio":1900}, … ,{"desde":301,"hasta":null,"precio":null}]}
     (precio null = «a consultar»)

   Otras variables (todas opcionales):
     ZOHO_ETAPA_PINYA    etapa EXACTA de una petición nueva («Clasificación»)
     ZOHO_CAMPO_MARCA    el mismo campo «Marca» que usa Events Penedès
   ========================================================================== */

export const FORM = 'pinya';
export const MARCA = 'TeamTowers';
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUSCADORES = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|qwant|yandex|baidu|startpage|brave)\./i;

const v = (d, k, n = 300) => String(d?.[k] ?? '').trim().slice(0, n);

/* --- El origen -------------------------------------------------------------
   Lo que dice quien escribe («vengo de una agencia») manda sobre lo que dice
   el navegador. Después, la campaña (utm_source o ?ref) y, al final, la web de
   la que llegó. El navegador lo puede escribir cualquiera: solo sirve para
   saber de dónde vienen las peticiones, nunca para pagar una comisión. */
export function origenDe(d = {}) {
  const fuente = `${v(d, 'utm_source', 80)} ${v(d, 'ref', 80)}`.toLowerCase();
  const web = v(d, 'origen_web', 200).toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  const detalle = [v(d, 'utm_source', 80) && `utm_source=${v(d, 'utm_source', 80)}`,
    v(d, 'utm_medium', 80) && `utm_medium=${v(d, 'utm_medium', 80)}`,
    v(d, 'utm_campaign', 80) && `utm_campaign=${v(d, 'utm_campaign', 80)}`,
    v(d, 'ref', 80) && `ref=${v(d, 'ref', 80)}`,
    web && `llegó desde ${web}`].filter(Boolean).join(' · ');
  let origen = 'Directa';
  if (/eventspenedes/.test(fuente) || /(^|\.)eventspenedes\.com$/.test(web)) { origen = 'Events Penedès'; }
  else if (v(d, 'a_traves_de') === 'agencia') { origen = 'Agencia'; }
  else if (/google|bing|cpc|ads/.test(`${fuente} ${v(d, 'utm_medium', 80).toLowerCase()}`) || BUSCADORES.test(web)) { origen = 'Buscador'; }
  /* Una agencia que llega desde Events Penedès sigue siendo de Events Penedès:
     es el canal que la trajo. Que es agencia queda en la ficha. */
  return { origen, detalle: detalle || 'sin datos del navegador' };
}

/* --- La tarifa ------------------------------------------------------------- */
export function tarifa(texto = process.env.TARIFA_FENT_PINYA) {
  if (!texto) { return null; }
  try {
    const t = JSON.parse(texto);
    if (!Array.isArray(t.tramos) || !t.tramos.length) { return null; }
    return { anio: t.anio || null, iva: Number.isFinite(t.iva) ? t.iva : 21, tramos: t.tramos };
  } catch { return null; }
}

export function tramoDe(pax, t) {
  if (!t || !(pax > 0)) { return null; }
  return t.tramos.find(x => pax >= x.desde && (x.hasta == null || pax <= x.hasta)) || null;
}

const euros = (n, locale) => `${n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

/* --- El borrador de la propuesta ------------------------------------------- */
const T = {
  es: {
    locale: 'es-ES',
    asunto: e => `Fent Pinya${e ? ` para ${e}` : ''}: vuestra propuesta`,
    hola: n => (n ? `Hola, ${n}:` : 'Hola:'),
    gracias: 'Gracias por escribirnos. Esta es la propuesta para vuestro taller Fent Pinya.',
    que: (pax, fecha, lugar) => `Para ${pax} personas${fecha ? `, el ${fecha}` : ''}${lugar ? `, en ${lugar}` : ''}.`,
    incluye: 'Unas dos horas en las que el equipo levanta un castell de verdad. Incluye dinamizador, monitores castellers, músicos en directo, fajas y seguro de responsabilidad civil. Solo necesitáis un espacio diáfano de unos 10×10 m.',
    precio: (base, iva, total, anio, tramo) => `Precio (${anio ? `tarifa ${anio}, ` : ''}tramo de ${tramo} personas): ${base} + IVA (${iva} %) = ${total}.`,
    consulta: 'El precio para un grupo de este tamaño lo preparamos a medida: te lo envío en cuanto confirmemos los detalles.',
    siguiente: 'Si os encaja, contéstame a este correo con la fecha y el lugar y os la reservamos.',
    adios: 'Un abrazo,',
  },
  ca: {
    locale: 'ca-ES',
    asunto: e => `Fent Pinya${e ? ` per a ${e}` : ''}: la vostra proposta`,
    hola: n => (n ? `Hola, ${n}:` : 'Hola:'),
    gracias: 'Gràcies per escriure\'ns. Aquesta és la proposta per al vostre taller Fent Pinya.',
    que: (pax, fecha, lugar) => `Per a ${pax} persones${fecha ? `, el ${fecha}` : ''}${lugar ? `, a ${lugar}` : ''}.`,
    incluye: 'Unes dues hores en què l\'equip aixeca un castell de debò. Inclou dinamitzador, monitors castellers, músics en directe, faixes i assegurança de responsabilitat civil. Només us cal un espai diàfan d\'uns 10×10 m.',
    precio: (base, iva, total, anio, tramo) => `Preu (${anio ? `tarifa ${anio}, ` : ''}tram de ${tramo} persones): ${base} + IVA (${iva} %) = ${total}.`,
    consulta: 'El preu per a un grup d\'aquesta mida el preparem a mida: te l\'envio tan bon punt confirmem els detalls.',
    siguiente: 'Si us encaixa, respon-me aquest correu amb la data i el lloc i us la reservem.',
    adios: 'Una abraçada,',
  },
  en: {
    locale: 'en-GB',
    asunto: e => `Fent Pinya${e ? ` for ${e}` : ''}: your proposal`,
    hola: n => (n ? `Hi ${n},` : 'Hello,'),
    gracias: 'Thank you for writing to us. Here is the proposal for your Fent Pinya workshop.',
    que: (pax, fecha, lugar) => `For ${pax} people${fecha ? `, on ${fecha}` : ''}${lugar ? `, in ${lugar}` : ''}.`,
    incluye: 'About two hours in which the team builds a real human tower. It includes a facilitator, casteller monitors, live musicians, sashes and liability insurance. You only need a clear space of about 10×10 m.',
    precio: (base, iva, total, anio, tramo) => `Price (${anio ? `${anio} rates, ` : ''}${tramo} people): ${base} + VAT (${iva} %) = ${total}.`,
    consulta: 'For a group of this size we prepare the price to measure: I will send it as soon as we confirm the details.',
    siguiente: 'If it works for you, reply to this email with the date and place and we will book it.',
    adios: 'Best regards,',
  },
};
const FIRMA = 'Álvaro Solache\nTeamTowers · teamtowers.eu';

export function borrador(d = {}, t = tarifa()) {
  const idioma = T[v(d, 'idioma', 2)] ? v(d, 'idioma', 2) : 'es';
  const x = T[idioma];
  const pax = Number.parseInt(v(d, 'personas', 10), 10);
  const nombre = v(d, 'nombre', 120).split(/\s+/)[0] || '';
  const empresa = v(d, 'empresa', 120);
  const fecha = FECHA.test(v(d, 'fecha', 10))
    ? new Date(`${v(d, 'fecha', 10)}T12:00:00Z`).toLocaleDateString(x.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : '';
  const tramo = tramoDe(pax, t);
  const avisos = [];
  let importe = null, lineaPrecio = x.consulta;
  if (!t) { avisos.push('Falta la variable TARIFA_FENT_PINYA en Netlify: el borrador va sin precio.'); }
  else if (!(pax > 0)) { avisos.push('No dice cuántas personas: falta el tramo y el precio.'); }
  else if (!tramo) { avisos.push(`${pax} personas no cae en ningún tramo de la tarifa: precio a consultar (¿Mini Towers?).`); }
  else if (tramo.precio == null) { avisos.push(`Tramo de ${tramo.desde} personas o más: precio a consultar.`); }
  else {
    importe = tramo.precio;
    const total = Math.round(tramo.precio * (1 + t.iva / 100) * 100) / 100;
    const rango = tramo.hasta == null ? `${tramo.desde}+` : `${tramo.desde}–${tramo.hasta}`;
    lineaPrecio = x.precio(euros(tramo.precio, x.locale), t.iva, euros(total, x.locale), t.anio, rango);
  }
  const anioFecha = FECHA.test(v(d, 'fecha', 10)) ? Number(v(d, 'fecha', 10).slice(0, 4)) : null;
  if (t?.anio && anioFecha && anioFecha !== Number(t.anio)) {
    avisos.push(`El taller es en ${anioFecha} y la tarifa es de ${t.anio}: revisa el precio.`);
  }
  if (v(d, 'a_traves_de') === 'agencia') {
    avisos.push('Es una agencia: el precio es el directo. Falta decidir la tarifa neta o la comisión de agencia (backlog de TeamTowers, bloque 4).');
  }
  avisos.push('Faltan las condiciones de reserva, cancelación, desplazamiento y lluvia (backlog de TeamTowers, bloque 4): añádelas si hacen falta.');
  if (v(d, 'mensaje', 10)) { avisos.push('Ha escrito un mensaje: contéstalo en el correo, que es lo que vende.'); }

  const cuerpo = [x.hola(nombre), x.gracias,
    [pax > 0 ? x.que(pax, fecha, v(d, 'lugar', 120)) : '', x.incluye].filter(Boolean).join(' '),
    lineaPrecio, x.siguiente, `${x.adios}\n${FIRMA}`].join('\n\n');
  const asunto = x.asunto(empresa);
  const correo = CORREO.test(v(d, 'correo', 200)) ? v(d, 'correo', 200) : '';
  const e = encodeURIComponent;
  return {
    idioma, importe, tramo, avisos, asunto, cuerpo, correo,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${e(correo)}&su=${e(asunto)}&body=${e(cuerpo)}`,
  };
}

export function notaBorrador(b) {
  return ['Borrador montado solo con la tarifa. No se ha enviado nada: revísalo y envíalo tú.',
    ...(b.avisos.length ? ['', 'Antes de enviarlo:', ...b.avisos.map(a => `· ${a}`)] : []),
    '', `Abrir en Gmail, ya escrito: ${b.gmail}`,
    '', `Para: ${b.correo || '— (sin correo válido)'}`, `Asunto: ${b.asunto}`, '', b.cuerpo].join('\n');
}

/* --- La ficha y la oportunidad -------------------------------------------- */
const IDIOMA_TALLER = { es: 'Castellano', ca: 'Catalán', en: 'Inglés', fr: 'Francés', otro: 'Otro' };

export function ficha(d = {}, cuando, o = origenDe(d)) {
  const l = [`Petición de Fent Pinya · teamtowers.eu/presupuesto · ${cuando}`,
    `Origen: ${o.origen} (${o.detalle})`,
    `Idioma de la web: ${v(d, 'idioma', 2) || '—'}`, ''];
  const campos = [['personas', 'Personas'], ['fecha', 'Fecha'], ['lugar', 'Lugar'],
    ['idioma_taller', 'Idioma del taller'], ['a_traves_de', 'Pide'], ['cliente_final', 'Cliente final'],
    ['mensaje', 'Mensaje']];
  for (const [k, e] of campos) {
    let x = v(d, k, 3000);
    if (k === 'idioma_taller') { x = IDIOMA_TALLER[x] || x; }
    if (k === 'a_traves_de') { x = { empresa: 'Para su empresa', agencia: 'Una agencia, para un cliente' }[x] || x; }
    if (x) { l.push(`${e}: ${x}`); }
  }
  if (v(d, 'privacidad')) { l.push('', `Aviso de privacidad aceptado el ${cuando}.`); }
  return l.join('\n');
}

export function oportunidad(d = {}, cuando = new Date().toISOString(), t = tarifa()) {
  const o = origenDe(d);
  const b = borrador(d, t);
  const persona = v(d, 'nombre', 120);
  const empresa = v(d, 'empresa', 200);
  const correo = b.correo;
  const telefono = v(d, 'telefono', 30) || undefined;
  const pax = Number.parseInt(v(d, 'personas', 10), 10);
  const cuenta = empresa ? { Account_Name: empresa, Phone: telefono } : null;
  const contacto = correo ? { Last_Name: persona || empresa || correo, Email: correo, Phone: telefono } : null;
  const fechaOk = FECHA.test(v(d, 'fecha', 10));
  /* El nombre, como los que Álvaro escribe a mano: «Fent Pinya 39 pax Warak Consulting 11/12/2026» */
  const dia = fechaOk ? v(d, 'fecha', 10).split('-').reverse().join('/') : 'sin fecha';
  const trato = {
    Deal_Name: `Fent Pinya ${pax > 0 ? `${pax} pax ` : ''}${empresa || persona || correo || 'sin nombre'} ${dia}`.slice(0, 120),
    Stage: process.env.ZOHO_ETAPA_PINYA || process.env.ZOHO_ETAPA_PROPUESTA || 'Clasificación',
    Closing_Date: fechaOk ? v(d, 'fecha', 10) : new Date(Date.parse(cuando) + 30 * 864e5).toISOString().slice(0, 10),
    Description: ficha(d, cuando, o).slice(0, 2000),
    ...(b.importe != null ? { Amount: b.importe } : {}),
  };
  if (process.env.ZOHO_CAMPO_MARCA) {
    trato[process.env.ZOHO_CAMPO_MARCA] = MARCA;
    if (cuenta) { cuenta[process.env.ZOHO_CAMPO_MARCA] = MARCA; }
  }
  const etiquetas = ['Fent Pinya', `Origen ${o.origen}`];
  const tarea = {
    Subject: `Enviar la propuesta de Fent Pinya a ${persona || empresa || correo || 'quien pidió'}`.slice(0, 200),
    Due_Date: new Date(Date.parse(cuando) || Date.now()).toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }),
    Priority: 'High',
    Description: ['El borrador está en la nota «Borrador de propuesta · sin enviar»: ábrelo en Gmail desde allí, retócalo y envíalo.',
      'Cuando lo envíes, pasa la oportunidad a «Cotización de propuesta/precio»: a los cinco días sin respuesta salta el aviso.',
      ...b.avisos.map(a => `· ${a}`)].join('\n'),
  };
  return { cuenta, contacto, trato, etiquetas, tarea, borrador: b, origen: o };
}

export const TITULO_NOTA = 'Borrador de propuesta · sin enviar';
