/* =============================================================================
   Events Penedès — «Crea tu cerebro»: el lugar del partner en la red

   Un tast: la IA acompaña al partner a dibujar su parte del mapa de valor de
   la red (qué rol cumple en un evento, qué aporta, qué recibe y para quién) y
   le hace las preguntas que lo afinan. Contesta en la caja, vuelve a pedirle
   y el mapa evoluciona. Lo publicado no cambia hasta que lo aprobamos.

   Lo mismo sirve en administración, que además lo aprueba y lo publica.
   El rol y las listas salen en su página pública: nada de precios,
   comisiones ni proyectos internos (la IA tampoco los ve).
   ========================================================================== */
import { sb } from './portal-cliente.js';
import { h, ok, intentar, decir, campo, boton, api, vistaPrevia } from './portal-ui.js';
import { tarjeta, chip, icono } from './portal-app.js';

export const ROLES_RED = ['Quien acoge', 'Quien sirve en el evento', 'Quien dinamiza la actividad', 'Quien produce y coordina', 'Quien lo revende'];
const LISTAS = [['aporta', 'Lo que aporta al evento'], ['recibe', 'Lo que recibe de la red'], ['para', 'Para quién']];

export function asistenteRed(p, { admin = false, recargar }) {
  const red = p.red || {};
  const base = red.nueva || red;
  const rol = h('select', { name: 'rol' }, h('option', { value: '' }, 'Sin elegir'),
    ROLES_RED.map(r => h('option', { value: r, selected: base.rol === r ? true : null }, r)));
  const areas = Object.fromEntries(LISTAS.map(([k]) => [k, h('textarea', { name: k, rows: 3, placeholder: 'Una cosa por línea' }, (base[k] || []).join('\n'))]));
  const nota = h('textarea', { rows: 3, placeholder: admin ? 'Lo que sepas de este partner que no esté en su ficha' : 'Cuéntale con tus palabras qué hacéis, para quién y qué os lleváis de cada evento. También puedes contestar aquí a sus preguntas.' });
  const preguntas = h('ul', { class: 'app-nota', hidden: true });
  const coste = h('p', { class: 'app-ia__coste', hidden: true });
  const leer = () => ({ rol: rol.value, ...Object.fromEntries(LISTAS.map(([k]) => [k, areas[k].value.split('\n').map(x => x.trim()).filter(Boolean)])) });

  const caja = h('div', { class: 'app-card app-ia' });
  const pedir = boton(base.rol || base.aporta?.length ? 'Que la IA lo mejore' : 'Que la IA lo proponga', async () => {
    caja.setAttribute('aria-busy', 'true');
    try {
      const r = await api('/api/portal/ia', { method: 'POST', body: { partner: p.id, accion: 'red', red: leer(), nota: nota.value } });
      rol.value = r.red.rol || rol.value;
      for (const [k] of LISTAS) { if (r.red[k]?.length) { areas[k].value = r.red[k].join('\n'); } }
      preguntas.replaceChildren(h('li', { class: 'app-nota' }, 'Para afinarlo, cuéntale:'), ...(r.preguntas || []).map(x => h('li', {}, x)));
      preguntas.hidden = !r.preguntas?.length;
      nota.value = '';
      coste.textContent = admin && r.coste_usd !== null && r.coste_usd !== undefined ? `Coste: ${Number(r.coste_usd).toFixed(3)} USD` : '';
      coste.hidden = !coste.textContent;
    } finally { caja.removeAttribute('aria-busy'); }
  }, 'ghost');

  const guardar = estado => intentar(async () => {
    ok(await sb.from('partners').update({ red: { estado, ...leer() } }).eq('id', p.id));
    decir(estado === 'aprobada' ? 'Aprobado: sale en su página en unos minutos.' : 'Guardado como propuesta. No se publica.', 'ok');
    await recargar();
  });
  const enviar = intentar(async () => {
    await api('/api/portal/ia', { method: 'POST', body: { partner: p.id, accion: 'red-enviar', red: leer() } });
    decir('Enviado. Lo revisamos y te avisamos cuando salga en tu página.', 'ok');
    await recargar();
  });

  const estado = red.estado === 'aprobada' ? chip('Publicado en tu página', 'ok') : red.estado ? chip('Propuesta sin publicar', 'aviso') : chip('Aún sin dibujar');
  caja.append(
    h('div', { class: 'app-ia__cab' }, icono('ia'), h('h3', {}, admin ? 'Su lugar en la red' : 'Tu lugar en la red')),
    h('p', { class: 'app-fila' }, estado, red.nueva ? chip(admin ? 'El partner ha mandado una versión nueva' : 'Tu versión nueva está en revisión', 'aviso') : null),
    h('form', { class: 'form', onsubmit: ev => ev.preventDefault() },
      campo('Tu rol en un evento', rol), ...LISTAS.map(([k, l]) => campo(l, areas[k])),
      campo(admin ? 'Contexto para la IA (opcional)' : 'Cuéntale a la IA (opcional)', nota), preguntas, coste,
      h('p', { class: 'app-fila' }, pedir,
        admin ? h('button', { class: 'btn btn--primary', type: 'button', onclick: guardar('aprobada') }, 'Aprobar y publicar') : h('button', { class: 'btn btn--primary', type: 'button', onclick: enviar }, 'Enviárnoslo para revisar'),
        admin ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: guardar('propuesta') }, 'Guardar como propuesta') : null,
        boton('Ver cómo queda', () => vistaPrevia(p.codigo)))),
    h('p', { class: 'app-nota' }, 'Sale en la página pública: sin precios, comisiones ni datos de contacto. La IA solo ve lo publicable de la ficha.'));
  return caja;
}

/* La vista del partner: un tast de «Crea tu cerebro» */
export const vistaCerebro = (p, { recargar }) => [
  tarjeta(null, h('p', {}, 'Cada partner es un nodo de la red: entrega algo a cada evento y recibe algo de él. Dibujarlo con la IA te ayuda a contar lo que aportas y a que te encuentre quien te necesita. Es un primer tast de tu cerebro de red: cada vez que le cuentes algo, lo afina.')),
  asistenteRed(p, { recargar }),
];
