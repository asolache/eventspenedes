/* =============================================================================
   Events Penedès · el recordatorio de la víspera

   A cada persona interesada de un evento (cliente, espacio, proveedores) le
   llega unas 24 h antes un correo con lo mínimo: dónde, a qué hora, cuántos,
   lo propio de su papel, la previsión del tiempo y un botón «Recibido».

   Aquí está lo que no depende de la red, para poder probarlo:
     momentoEnvio      24 h antes, movido al horario laboral más cercano
     resumirPrevision  la previsión de Open-Meteo, en una frase
     correoRecordatorio  asunto, html y texto, en castellano, catalán o inglés
   y las dos consultas a Open-Meteo (gratis, sin clave): previsión y, si el
   lugar no trae coordenadas, su población.
   ========================================================================== */
import { esc, SITIO } from './pagina.mjs';

const TZ = 'Europe/Madrid';
const HORA = 3600e3;
export const TELEFONO = '629 867 715';

/* ---------- La hora de Madrid ---------- */

function partes(d) {
  const o = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d).map(p => [p.type, p.value]));
  return { fecha: `${o.year}-${o.month}-${o.day}`, h: Number(o.hour), mi: Number(o.minute), dow: o.weekday };
}

/* «2026-10-23» y «11:00», hora de Madrid → el instante */
export function deMadrid(fecha, hora = '09:00') {
  const quiero = Date.parse(`${fecha}T${hora}:00Z`);
  let t = quiero;
  for (let i = 0; i < 3; i++) {
    const p = partes(new Date(t));
    t += quiero - Date.parse(`${p.fecha}T${String(p.h).padStart(2, '0')}:${String(p.mi).padStart(2, '0')}:00Z`);
  }
  return new Date(t);
}

/* De lunes a viernes, de 9:00 a 18:00. Los festivos no se miran. */
export function laborable(d) {
  const p = partes(d);
  const min = p.h * 60 + p.mi;
  return !['Sat', 'Sun'].includes(p.dow) && min >= 540 && min <= 1080;
}

/* 24 h antes del inicio. Si cae fuera de horario, la hora en punto laborable
   más cercana: antes si empata, nunca pasada y nunca a menos de 12 h del
   evento. Si ya no hay ninguna, cuanto antes; con menos de 2 h, nada. */
export function momentoEnvio(inicio, ahora = new Date()) {
  const objetivo = Math.floor((inicio.getTime() - 24 * HORA) / HORA) * HORA;
  const tope = inicio.getTime() - 12 * HORA;
  for (let k = 0; k <= 96; k++) {
    for (const t of k ? [objetivo - k * HORA, objetivo + k * HORA] : [objetivo]) {
      if (t >= ahora.getTime() && t <= tope && laborable(new Date(t))) { return new Date(t); }
    }
  }
  return inicio.getTime() - ahora.getTime() > 2 * HORA ? new Date(ahora) : null;
}

/* ---------- El tiempo ---------- */

/* Códigos WMO de Open-Meteo, de menos a más importantes para un evento */
const CIELOS = [
  [[0], { es: 'despejado', ca: 'cel serè', en: 'clear skies' }],
  [[1, 2], { es: 'parcialmente nuboso', ca: 'parcialment ennuvolat', en: 'partly cloudy' }],
  [[3], { es: 'nublado', ca: 'ennuvolat', en: 'cloudy' }],
  [[45, 48], { es: 'con niebla', ca: 'amb boira', en: 'foggy' }],
  [[51, 53, 55, 56, 57], { es: 'con llovizna', ca: 'amb plugim', en: 'drizzle' }],
  [[61, 63, 65, 66, 67, 80, 81, 82], { es: 'con lluvia', ca: 'amb pluja', en: 'rain' }],
  [[71, 73, 75, 77, 85, 86], { es: 'con nieve', ca: 'amb neu', en: 'snow' }],
  [[95, 96, 99], { es: 'con tormenta', ca: 'amb tempesta', en: 'thunderstorms' }],
];
const rango = c => CIELOS.findIndex(([cs]) => cs.includes(c));

const FRASES = {
  es: { de: (a, b) => `de ${a} a ${b} °C`, seco: 'sin lluvia', poca: p => `poca probabilidad de lluvia (${p} %)`, lluvia: p => `probabilidad de lluvia del ${p} %`,
    brisa: 'algo de viento', viento: v => `viento de hasta ${v} km/h` },
  ca: { de: (a, b) => `de ${a} a ${b} °C`, seco: 'sense pluja', poca: p => `poca probabilitat de pluja (${p} %)`, lluvia: p => `probabilitat de pluja del ${p} %`,
    brisa: 'una mica de vent', viento: v => `vent de fins a ${v} km/h` },
  en: { de: (a, b) => `${a} to ${b} °C`, seco: 'no rain', poca: p => `a small chance of rain (${p} %)`, lluvia: p => `a ${p} % chance of rain`,
    brisa: 'a light breeze', viento: v => `wind up to ${v} km/h` },
};

/* Las horas del evento (desde el inicio, `horas` seguidas) de la respuesta de
   Open-Meteo, en una frase. `aviso`: lluvia probable o viento fuerte. */
export function resumirPrevision(json, fecha, desde = '09:00', horas = 4, idioma = 'es') {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time)) { return null; }
  const ini = Number(String(desde).slice(0, 2));
  const idx = h.time.map((t, i) => [t, i]).filter(([t]) => t.startsWith(fecha) && Number(t.slice(11, 13)) >= ini && Number(t.slice(11, 13)) < ini + horas).map(([, i]) => i);
  if (!idx.length) { return null; }
  const col = k => idx.map(i => h[k]?.[i]).filter(Number.isFinite);
  const temps = col('temperature_2m');
  const prob = Math.max(0, ...col('precipitation_probability'));
  const viento = Math.round(Math.max(0, ...col('wind_speed_10m')));
  const peor = col('weather_code').reduce((a, c) => (rango(c) > rango(a) ? c : a), 0);
  const f = FRASES[idioma] || FRASES.es;
  const cielo = (CIELOS[Math.max(0, rango(peor))][1])[idioma] || CIELOS[Math.max(0, rango(peor))][1].es;
  const trozos = [cielo];
  if (temps.length) { trozos.push(f.de(Math.round(Math.min(...temps)), Math.round(Math.max(...temps)))); }
  trozos.push(prob < 20 ? f.seco : prob < 50 ? f.poca(prob) : f.lluvia(prob));
  if (viento >= 30) { trozos.push(f.viento(viento)); } else if (viento >= 15) { trozos.push(f.brisa); }
  return { texto: `${trozos.join(', ')}.`, aviso: prob >= 50 || viento >= 40, prob, viento };
}

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
export async function prevision({ lat, lon, fecha, desde, horas, idioma }, { fetch = globalThis.fetch } = {}) {
  const q = new URLSearchParams({ latitude: lat, longitude: lon, timezone: TZ, start_date: fecha, end_date: fecha,
    hourly: 'temperature_2m,precipitation_probability,weather_code,wind_speed_10m' });
  const r = await fetch(`${OPEN_METEO}?${q}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) { return null; }
  return resumirPrevision(await r.json(), fecha, desde, horas, idioma);
}

/* El lugar sin coordenadas: su población, en España */
export async function coordenadas(lugar, { fetch = globalThis.fetch } = {}) {
  if (Number.isFinite(lugar?.lat) && Number.isFinite(lugar?.lon)) { return { lat: lugar.lat, lon: lugar.lon }; }
  if (!lugar?.poblacion) { return null; }
  const q = new URLSearchParams({ name: lugar.poblacion, count: '1', language: 'es', country_code: 'ES' });
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`, { signal: AbortSignal.timeout(8000) });
  const g = r.ok ? (await r.json())?.results?.[0] : null;
  return g ? { lat: g.latitude, lon: g.longitude } : null;
}

/* ---------- El correo ---------- */

const mayus = s => s.charAt(0).toUpperCase() + s.slice(1);

const T = {
  es: {
    manana: 'mañana', locale: 'es-ES', hola: n => `Hola ${n}:`,
    intro: { cliente: d => `${mayus(d)} nos vemos. Te dejo el resumen para que lo tengáis todo a mano:`, otro: (d, e) => `Te recuerdo que ${d} tenemos «${e}»:` },
    donde: 'Dónde', hora: 'Hora', grupo: 'Grupo', personas: n => `${n} personas`, mapa: 'mapa',
    tiempo: 'El tiempo', previsto: 'Previsión de hoy para', cubierto: 'Si llueve, ¿tenemos a punto el espacio cubierto?',
    llama: `Cualquier imprevisto, llámame al ${TELEFONO}.`, rebut: 'Me ha llegado', pide: 'Dale al botón para confirmar que te ha llegado: así sabemos que todo está atado.',
    adios: '¡Hasta mañana!', asunto: (d, t) => `${d}: ${t}`,
  },
  ca: {
    manana: 'demà', locale: 'ca-ES', hola: n => `Hola ${n},`,
    intro: { cliente: d => `${mayus(d)} ens veiem. Et deixo el resum perquè ho tingueu tot a mà:`, otro: (d, e) => `Et recordo que ${d} tenim «${e}»:` },
    donde: 'On', hora: 'Hora', grupo: 'Grup', personas: n => `${n} persones`, mapa: 'mapa',
    tiempo: 'El temps', previsto: "Previsió d'avui per a", cubierto: "Si plou, tenim a punt l'espai cobert?",
    llama: `Qualsevol imprevist, truca'm al ${TELEFONO}.`, rebut: "M'ha arribat", pide: "Fes clic al botó per confirmar que t'ha arribat: així sabem que tot està lligat.",
    adios: 'Fins demà!', asunto: (d, t) => `${d}: ${t}`,
  },
  en: {
    manana: 'tomorrow', locale: 'en-GB', hola: n => `Hi ${n},`,
    intro: { cliente: d => `See you ${d}. Here is a summary so you have everything at hand:`, otro: (d, e) => `A reminder: «${e}» is ${d}.` },
    donde: 'Where', hora: 'Time', grupo: 'Group', personas: n => `${n} people`, mapa: 'map',
    tiempo: 'Weather', previsto: "Today's forecast for", cubierto: 'If it rains, is the covered area ready?',
    llama: `If anything comes up, call me on ${TELEFONO}.`, rebut: 'Got it', pide: 'Click the button to confirm you got this, so we know everything is set.',
    adios: 'See you tomorrow!', asunto: (d, t) => `${d}: ${t}`,
  },
};

/* «mañana» si sale la víspera; si no, el día con su nombre */
export function cuando(fechaEvento, envio, idioma = 'es') {
  const t = T[idioma] || T.es;
  const vispera = partes(new Date(deMadrid(fechaEvento, '12:00').getTime() - 24 * HORA)).fecha;
  if (partes(envio).fecha === vispera) { return t.manana; }
  return new Date(`${fechaEvento}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ });
}

/* evento: { titulo, fecha, hora, lugar: {nombre, direccion, poblacion}, pax }
   interesado: { nombre, rol, idioma, notas[] } · tiempo: resumirPrevision() */
export function correoRecordatorio({ evento, interesado, tiempo, clave, envio }) {
  const idioma = T[interesado.idioma] ? interesado.idioma : 'es';
  const t = T[idioma];
  const d = cuando(evento.fecha, envio, idioma);
  const enlace = `${SITIO}/rebut/${clave}`;
  const l = evento.lugar || {};
  const sitio = [l.nombre, l.direccion || l.poblacion].filter(Boolean).join(', ');
  const mapa = sitio ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sitio)}` : null;
  const puntos = [
    sitio && [t.donde, sitio, mapa],
    evento.hora && [t.hora, evento.hora],
    Number.isFinite(evento.pax) && [t.grupo, t.personas(evento.pax)],
    ...(interesado.notas || []).map(n => [null, n]),
  ].filter(Boolean);
  const extra = tiempo?.aviso && interesado.rol === 'espacio' ? ` ${t.cubierto}` : '';
  const frase = tiempo ? `${t.previsto} ${l.poblacion || l.nombre || ''}: ${tiempo.texto}${extra}`.replace(' :', ':') : null;
  const intro = (interesado.rol === 'cliente' ? t.intro.cliente : t.intro.otro)(d, evento.titulo);

  const texto = [t.hola(interesado.nombre), '', intro, '',
    ...puntos.map(([k, v, u]) => `- ${k ? `${k}: ` : ''}${v}${u ? `\n  ${u}` : ''}`), '',
    ...(frase ? [frase, ''] : []),
    t.pide, enlace, '', t.llama, '', t.adios, '', 'Álvaro Solache', `Events Penedès · ${TELEFONO}`, SITIO].join('\n');

  const html = `<!doctype html><html lang="${idioma}"><body style="margin:0;padding:0;background:#f6f3ee" bgcolor="#f6f3ee">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f6f3ee"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;font-family:Georgia,serif;color:#2b2622;font-size:16px;line-height:1.55" bgcolor="#ffffff">
<tr><td style="padding:20px 28px;border-bottom:3px solid #8a2b2b"><span style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#8a2b2b">Events Penedès</span><br><strong style="font-size:20px">${esc(mayus(d))} · ${esc(evento.titulo)}</strong></td></tr>
<tr><td style="padding:24px 28px">
<p>${esc(t.hola(interesado.nombre))}</p><p>${esc(intro)}</p>
<ul style="padding-left:20px">${puntos.map(([k, v, u]) => `<li style="margin-bottom:6px">${k ? `<strong>${esc(k)}:</strong> ` : ''}${esc(v)}${u ? ` · <a href="${esc(u)}" style="color:#8a2b2b">${t.mapa}</a>` : ''}</li>`).join('')}</ul>
${frase ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td bgcolor="#eef3f7" style="padding:12px 16px;border-left:3px solid #4a6d8c">${esc(frase)}</td></tr></table>` : ''}
<p>${esc(t.pide)}</p>
<p><a href="${enlace}" style="display:inline-block;padding:10px 22px;border:2px solid #8a2b2b;color:#8a2b2b;text-decoration:none;font-weight:bold;border-radius:4px">${esc(t.rebut)}</a></p>
<p>${esc(t.llama)}</p><p>${esc(t.adios)}</p>
<p style="margin-top:24px">Álvaro Solache<br>Events Penedès · ${TELEFONO}<br><a href="${SITIO}" style="color:#8a2b2b">eventspenedes.com</a></p>
</td></tr></table></td></tr></table></body></html>`;

  return { asunto: t.asunto(mayus(d), evento.titulo), html, texto };
}
