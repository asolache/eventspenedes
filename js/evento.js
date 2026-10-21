/* =============================================================================
   Events Penedès — la página del cliente (/evento)

   El cliente entra con un enlace a su correo y ve su evento: el programa con
   sus horas, el lugar, lo que aún nos falta de él y una caja para pedirnos lo
   que necesite. Lo que pide nos llega a nosotros (peticiones_cliente) y le
   contestamos aquí: nunca habla directamente con un espacio o un proveedor.

   No hay precios, costes, proveedores ni notas internas: la base de datos solo
   tiene la versión para el cliente (tools/evento-cliente.mjs) y solo la
   devuelve a quien está invitado a ese evento.
   ========================================================================== */
import { sb } from './portal-cliente.js';
import { h, ok, intentar, decir, fecha, fechaHora } from './portal-ui.js';
import { app, tarjeta, kpis, chip } from './portal-app.js';

const raiz = document.getElementById('portal');
const $ = s => raiz.querySelector(s);
const ESTADOS = { propuesta: ['Propuesta', 'aviso'], confirmado: ['Confirmado', 'ok'], hecho: ['Hecho', null], cancelado: ['Cancelado', 'error'] };
const PETICION = { nueva: ['Enviada', 'aviso'], vista: ['La estamos mirando', 'oro'], respondida: ['Contestada', 'ok'] };
const MAX = 2000;

$('[data-form="enlace"]').addEventListener('submit', intentar(async ev => {
  ev.preventDefault();
  const correo = ev.target.correo.value.trim().toLowerCase();
  ok(await sb.auth.signInWithOtp({ email: correo, options: { emailRedirectTo: `${location.origin}/evento` } }));
  decir('Te hemos enviado el enlace. Ábrelo en este dispositivo y vuelves aquí ya dentro.', 'ok');
}));

/* Fuera del aviso: dentro, una consulta espera al candado de sesión de supabase-js (ver portal.js) */
sb.auth.onAuthStateChange((_, sesion) => { setTimeout(() => { pintar(sesion).catch(e => decir(e.message, 'error')); }, 0); });

let pintando = null;
async function pintar(sesion) {
  $('[data-vista="fuera"]').hidden = Boolean(sesion);
  $('[data-vista="dentro"]').hidden = !sesion;
  document.body.classList.toggle('en-app', Boolean(sesion));
  if (!sesion || pintando) { return; }
  pintando = (async () => {
    const eventos = ok(await sb.from('eventos_cliente').select('*').order('fecha'));
    const cont = $('[data-eventos]');
    const salir = h('button', { class: 'btn btn--ghost', type: 'button', onclick: intentar(() => sb.auth.signOut()) }, 'Salir');
    if (!eventos.length) {
      cont.replaceChildren(h('div', { class: 'app-vacio' },
        h('p', {}, `Has entrado como ${sesion.user.email || 'usuario'}, pero aún no tenemos ningún evento a tu nombre.`),
        h('p', {}, 'Si hablamos del evento con otro correo, entra con ese. Si no, ', h('a', { href: '/propuesta.html' }, 'pídenos una propuesta'), '.'),
        h('p', {}, salir)));
      return;
    }
    const hoy = new Date().toISOString().slice(0, 10);
    let actual = eventos.find(e => `#${e.id}` === location.hash.split('/')[0])
      || eventos.find(e => (e.fecha || '') >= hoy) || eventos[eventos.length - 1];
    const montar = async () => {
      const otro = eventos.length > 1 ? h('select', { 'aria-label': 'Cambiar de evento', onchange: ev => {
        actual = eventos.find(e => e.id === ev.target.value);
        montar().catch(e => decir(e.message, 'error'));
      } }, eventos.map(e => h('option', { value: e.id, selected: e.id === actual.id ? true : null }, `${fecha(e.fecha)} · ${e.titulo}`))) : null;
      cont.replaceChildren(await panelEvento(actual, { sesion, acciones: [otro, salir], recargar: montar }));
    };
    await montar();
  })().finally(() => { pintando = null; });
  await pintando;
}

/* «miércoles, 4 de noviembre de 2026» */
const diaLargo = f => (f ? new Date(`${f}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'Fecha por cerrar');
const faltanDias = f => (f ? Math.round((new Date(`${f}T12:00:00`) - new Date()) / 864e5) : null);

export async function panelEvento(ev, { sesion, acciones, recargar }) {
  const peticiones = ok(await sb.from('peticiones_cliente').select('id,texto,estado,respuesta,creado_en,respondida_en')
    .eq('evento_id', ev.id).order('creado_en', { ascending: false }));
  const d = ev.datos || {};
  const programa = Array.isArray(d.programa) ? d.programa : [];
  const faltan = Array.isArray(d.faltan) ? d.faltan : [];
  const [estado, tono] = ESTADOS[ev.estado] || [ev.estado, null];
  const dias = faltanDias(ev.fecha);
  const lugar = d.lugar ? [d.lugar.nombre, d.lugar.poblacion].filter(Boolean).join(' · ') : 'Por cerrar';
  let vistaApp = null;

  /* La caja «Pide»: lo que escriba nos llega; puede venir de «Lo que nos falta» */
  const caja = h('textarea', { rows: 4, maxlength: MAX, required: true, placeholder: 'Por ejemplo: seremos 5 más, ¿podemos empezar a las 10?' });
  const pedir = h('form', { class: 'form', onsubmit: intentar(async e => {
    e.preventDefault();
    const texto = caja.value.trim();
    if (!texto) { return; }
    ok(await sb.from('peticiones_cliente').insert({ evento_id: ev.id, texto }));
    decir('Enviado. Te contestamos aquí mismo.', 'ok');
    await recargar();
  }) },
  h('p', { class: 'field' }, h('label', {}, '¿Qué necesitas?', caja)),
  h('p', { class: 'portal__botones' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Pídenoslo')),
  h('p', { class: 'form__note' }, 'Nos llega a nosotros, lo hablamos con quien haga falta y te contestamos aquí.'));
  const responder = txt => () => {
    caja.value = `Sobre «${txt}»: `;
    vistaApp.ir('pide');
    caja.focus();
  };

  const vPrograma = [
    kpis([
      ['Cuándo', ev.fecha ? fecha(ev.fecha) : 'Por cerrar', dias !== null && dias >= 0 ? `faltan ${dias} días` : null, 'oro'],
      ['Dónde', lugar],
      ['Personas', Number.isFinite(d.pax) ? d.pax : 'Por confirmar'],
    ]),
    tarjeta(diaLargo(ev.fecha),
      programa.length ? h('ol', { class: 'evento-programa' }, programa.map(p => h('li', {},
        h('p', { class: 'evento-programa__hora' }, p.hora ? `${p.hora}${p.fin ? `–${p.fin}` : ''}` : 'Hora por cerrar'),
        h('div', {}, h('h4', {}, p.titulo), p.describe ? h('p', {}, p.describe) : null))))
        : h('p', { class: 'app-vacio' }, 'Estamos cerrando el programa: sale aquí en cuanto lo tengamos.'),
      h('p', { class: 'app-fila' }, chip(estado, tono), faltan.length ? h('span', { class: 'app-nota' }, `${faltan.length} cosas por saber de vosotros`) : null)),
  ];

  const vFaltan = faltan.length
    ? [h('ul', { class: 'app-tareas' }, faltan.map(f => h('li', {}, h('span', {}, f.texto),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: responder(f.texto) }, 'Contestar'))))]
    : [h('p', { class: 'app-vacio' }, 'Lo tenemos todo. Si cambia algo, pídenoslo.')];

  const vPide = [
    tarjeta(null, pedir),
    peticiones.length ? h('ol', { class: 'evento-peticiones' }, peticiones.map(p => {
      const [txt, t] = PETICION[p.estado] || [p.estado, null];
      return h('li', { class: 'app-card' },
        h('p', { class: 'app-fila' }, chip(txt, t), h('span', { class: 'app-nota' }, fechaHora(p.creado_en))),
        h('p', {}, p.texto),
        p.respuesta ? h('blockquote', {}, h('p', {}, p.respuesta), h('p', { class: 'app-nota' }, `Events Penedès · ${fechaHora(p.respondida_en)}`)) : null);
    })) : null,
  ];

  /* Las propuestas que estamos pidiendo, mientras el evento está en propuesta */
  const propuestas = Array.isArray(d.propuestas) ? d.propuestas : [];
  const vPropuestas = propuestas.map(p => tarjeta(p.titulo,
    p.foto ? h('img', { src: p.foto, alt: p.alt || '', loading: 'lazy' }) : null,
    p.estado === 'lista' && p.texto ? h('p', {}, p.texto) : null,
    h('p', { class: 'app-fila' }, p.estado === 'lista' ? chip('Propuesta lista', 'ok') : chip('En curso', 'aviso'),
      h('span', { class: 'app-nota' }, p.estado === 'lista' ? 'Te la enviamos por correo con el precio.' : 'Estamos esperando su propuesta formal.'))));

  const sinContestar = peticiones.filter(p => p.estado !== 'respondida').length;
  vistaApp = app({
    clave: ev.id,
    titulo: ev.titulo,
    subtitulo: `${diaLargo(ev.fecha)} · ${sesion.user.email || ''}`,
    acciones,
    buscar: 'Buscar en tu evento…',
    vistas: [
      ...(propuestas.length ? [{ id: 'propuestas', titulo: 'Las propuestas', corto: 'Propuestas', icono: 'ficha',
        n: propuestas.filter(p => p.estado === 'lista').length,
        intro: 'Una por espacio. Cada una sale como lista en cuanto el espacio nos la confirma.', nodos: vPropuestas }] : []),
      { id: 'programa', titulo: 'El programa', corto: 'Programa', icono: 'reservas', nodos: vPrograma },
      { id: 'faltan', titulo: 'Lo que nos falta de vosotros', corto: 'Nos falta', icono: 'ficha', n: faltan.length,
        intro: 'Con esto cerramos el día. Contesta lo que sepas: lo demás lo vamos viendo.', nodos: vFaltan },
      { id: 'pide', titulo: 'Pide', icono: 'conversacion', n: sinContestar,
        intro: 'Un cambio, una pregunta o algo que se nos haya pasado.', nodos: vPide },
    ],
  });
  return vistaApp;
}
