/* =============================================================================
   Events Penedès — «Tu día» y «Tu semana en la red» (portada de /acceso)

   Álvaro, 14/11/2026: que la herramienta sea adictiva y ayude a cada partner a
   desarrollar su negocio en la red. Vuelven cada día porque la portada les
   dice qué les ha traído la red y qué tienen que hacer para cobrarlo.

   · Tu día: una sola lista de lo que toca hoy, por capas (regla del 22/10):
       0 · en curso      → los eventos confirmados que se acercan,
       1 · por responder → reservas, mensajes y acuerdo que esperan al partner,
       2 · para crecer   → una sola mejora de la ficha, la de hoy.
   · Tu semana: los recuentos de valor_plan de los últimos 7 días frente a los
     7 anteriores, y lo que tarda en contestar las reservas. Si la mediana es
     de 4 horas o menos, el sello «Respondes rápido».

   Sin precios ni comisiones: solo recuentos y fechas. Funciones puras, sin
   DOM ni Supabase, para probarlas en node (tools/test-dia.mjs); portal.js las
   pinta.
   ========================================================================== */

const DIA = 864e5;
export const RAPIDO_HORAS = 4;
export const CAPAS = ['En curso', 'Por responder', 'Para crecer'];

/* Días enteros de una fecha (aaaa-mm-dd) a otra */
export const entre = (de, a) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA);

const ddmm = f => { const [, m, d] = f.split('-'); return `${Number(d)}/${Number(m)}`; };

export function cuantoFalta(hoy, fecha) {
  const n = entre(hoy, fecha);
  if (n === 0) { return 'Es hoy'; }
  if (n === 1) { return 'Es mañana'; }
  return `Faltan ${n} días · ${ddmm(fecha)}`;
}

export function vence(hoy, fecha) {
  if (!fecha) { return { texto: null, tono: null }; }
  const n = entre(hoy, fecha);
  if (n < 0) { return { texto: `Tenía que estar el ${ddmm(fecha)}`, tono: 'error' }; }
  if (n === 0) { return { texto: 'Contesta hoy', tono: 'error' }; }
  if (n === 1) { return { texto: 'Contesta antes de mañana', tono: 'aviso' }; }
  return { texto: `Contesta antes del ${ddmm(fecha)}`, tono: null };
}

/* El último mensaje nuestro (no interno) al que el partner aún no ha contestado */
export function mensajeSinContestar(mensajes, yo) {
  const charla = (mensajes || []).filter(m => m.tipo === 'comentario' && !m.interno)
    .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)));
  const ultimo = charla[charla.length - 1];
  return ultimo && ultimo.autor !== yo ? ultimo : null;
}

/* La lista de hoy. `mejoras` son las tareas de la ficha que ya calcula el
   portal ([texto, vista]); de ellas solo sale una, la primera. */
export function tuDia({ hoy, reservas = [], mensajes = [], yo, porFirmar = 0, mejoras = [], horizonte = 14 }) {
  const filas = [];
  for (const r of reservas) {
    if (r.estado === 'confirmada' && r.fecha >= hoy && entre(hoy, r.fecha) <= horizonte) {
      const n = entre(hoy, r.fecha);
      filas.push({ capa: 0, orden: r.fecha, texto: r.titulo, vista: 'reservas', boton: 'Ver',
        detalle: [cuantoFalta(hoy, r.fecha), r.personas ? `${r.personas} personas` : null].filter(Boolean).join(' · '),
        tono: n <= 2 ? 'oro' : null });
    }
    if (r.estado === 'solicitada' && r.fecha >= hoy) {
      const v = vence(hoy, r.responder_antes);
      filas.push({ capa: 1, orden: r.responder_antes || r.fecha, texto: `Contestar: ${r.titulo}`, vista: 'reservas', boton: 'Contestar',
        detalle: [v.texto, `para el ${ddmm(r.fecha)}`].filter(Boolean).join(' · '), tono: v.tono || 'oro' });
    }
    if (r.estado === 'alternativa' && r.fecha >= hoy) {
      filas.push({ capa: 1, orden: r.fecha, texto: `Tu propuesta para «${r.titulo}»`, vista: 'reservas', boton: 'Ver',
        detalle: 'La estamos mirando: te contestamos aquí', tono: null, espera: true });
    }
  }
  const m = mensajeSinContestar(mensajes, yo);
  if (m) {
    filas.push({ capa: 1, orden: String(m.creado_en).slice(0, 10), texto: 'Te hemos escrito', vista: 'conversacion', boton: 'Leer y contestar',
      detalle: m.texto ? `«${m.texto.length > 90 ? `${m.texto.slice(0, 88)}…` : m.texto}»` : null, tono: null });
  }
  if (porFirmar) {
    filas.push({ capa: 1, orden: '9999', texto: 'Revisar la propuesta de acuerdo', vista: 'acuerdo', boton: 'Revisar', detalle: null, tono: 'aviso' });
  }
  const [mejora] = mejoras;
  if (mejora) {
    filas.push({ capa: 2, orden: '', texto: mejora[0], vista: mejora[1], boton: 'Hacerlo',
      detalle: mejoras.length > 1 ? `Mejora de hoy · ${mejoras.length === 2 ? 'queda 1' : `quedan ${mejoras.length - 1}`} más` : 'Mejora de hoy', tono: null });
  }
  return filas.sort((a, b) => a.capa - b.capa || String(a.orden).localeCompare(String(b.orden)));
}

/* Lo que tarda en contestar: de cada petición (o cambio) de reserva a su
   primera respuesta. Mediana en horas de las respuestas desde `desde`. */
const PIDE = new Set(['reserva_solicitada', 'reserva_modificada']);
const RESPONDE = new Set(['reserva_confirmada', 'reserva_alternativa', 'reserva_rechazada']);
export function tiempoRespuesta(mensajes = [], desde = null) {
  const abiertas = {};
  const horas = [];
  const orden = mensajes.filter(m => m.sobre === 'reserva' && m.ref)
    .sort((a, b) => String(a.creado_en).localeCompare(String(b.creado_en)));
  for (const m of orden) {
    if (PIDE.has(m.tipo)) { abiertas[m.ref] ??= m.creado_en; continue; }
    if (RESPONDE.has(m.tipo) && abiertas[m.ref]) {
      if (!desde || m.creado_en >= desde) { horas.push((Date.parse(m.creado_en) - Date.parse(abiertas[m.ref])) / 36e5); }
      delete abiertas[m.ref];
    }
  }
  if (!horas.length) { return { n: 0, mediana: null, rapido: false }; }
  const s = [...horas].sort((a, b) => a - b);
  const mediana = s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  return { n: s.length, mediana, rapido: mediana <= RAPIDO_HORAS };
}

export function duracion(h) {
  if (h === null || h === undefined) { return '—'; }
  if (h < 1) { return `${Math.max(1, Math.round(h * 60))} min`; }
  if (h < 48) { return `${Math.round(h)} h`; }
  return `${Math.round(h / 24)} días`;
}

/* Cómo va la semana frente a la anterior: [titulo, valor, nota, tono] para kpis().
   `v7` y `v14` son valor_plan(p, 7) y valor_plan(p, 14). */
export const SEMANA = [
  ['vistas', 'Visitas a tu página'],
  ['clientes', 'Clientes por tu enlace'],
  ['reservas', 'Reservas pedidas'],
  ['confirmadas', 'Reservas confirmadas'],
];
export function tuSemana(v7, v14) {
  if (!v7 || !v14) { return []; }
  return SEMANA.map(([k, titulo]) => {
    const ahora = Number(v7[k] || 0);
    const antes = Math.max(0, Number(v14[k] || 0) - ahora);
    const d = ahora - antes;
    const nota = d === 0 ? (ahora ? 'igual que la semana pasada' : 'esta semana') : `${d > 0 ? '▲' : '▼'} ${Math.abs(d)} frente a la semana pasada`;
    return [titulo, ahora, nota, d > 0 ? 'ok' : null];
  });
}
