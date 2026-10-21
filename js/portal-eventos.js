/* =============================================================================
   Events Penedès — los eventos de clientes, en la administración (/acceso)

   Lo que cada cliente ve en /evento y lo que nos pide. Desde aquí se invita a
   un correo a ver su evento y se contestan sus peticiones: la respuesta le
   sale en su página. El evento se carga con tools/evento-cliente.mjs.
   ========================================================================== */
import { sb } from './portal-cliente.js';
import { h, ok, decir, fecha, fechaHora, boton, campo } from './portal-ui.js';
import { extras, chip, tarjeta } from './portal-app.js';

const PETICION = { nueva: ['Nueva', 'aviso'], vista: ['Vista', 'oro'], respondida: ['Contestada', 'ok'] };

async function vistaAdmin({ recargar }) {
  const [eventos, invitados, peticiones] = await Promise.all([
    sb.from('eventos_cliente').select('id,titulo,fecha,estado,datos').order('fecha').then(ok),
    sb.from('evento_invitados').select('evento_id,correo,user_id').then(ok),
    sb.from('peticiones_cliente').select('*').order('creado_en', { ascending: false }).then(ok),
  ]);
  const nuevas = peticiones.filter(p => p.estado !== 'respondida');

  const tarjetaPeticion = p => {
    const [t, tono] = PETICION[p.estado] || [p.estado, null];
    const ev = eventos.find(e => e.id === p.evento_id);
    const resp = h('textarea', { rows: 3, maxlength: 2000, placeholder: 'Lo que le contestamos: sale en su página' });
    const guardar = async estado => {
      const cambio = estado === 'respondida'
        ? { estado, respuesta: resp.value.trim(), respondida_en: new Date().toISOString() }
        : { estado };
      if (estado === 'respondida' && !cambio.respuesta) { decir('Escribe la respuesta antes de contestar.', 'error'); return; }
      ok(await sb.from('peticiones_cliente').update(cambio).eq('id', p.id));
      decir(estado === 'respondida' ? 'Contestada: el cliente ya la ve.' : 'Marcada como vista.', 'ok');
      await recargar();
    };
    return h('div', { class: 'app-card' },
      h('p', { class: 'app-fila' }, chip(t, tono), h('strong', {}, ev ? `${fecha(ev.fecha)} · ${ev.titulo}` : p.evento_id),
        h('span', { class: 'app-nota' }, fechaHora(p.creado_en))),
      h('p', {}, p.texto),
      p.respuesta
        ? h('blockquote', {}, h('p', {}, p.respuesta))
        : h('div', {}, campo('Respuesta', resp),
          h('p', { class: 'app-fila' }, boton('Contestar', () => guardar('respondida'), 'primary'),
            p.estado === 'nueva' ? boton('Marcar como vista', () => guardar('vista')) : null)));
  };

  const tarjetaEvento = ev => {
    const suyos = invitados.filter(i => i.evento_id === ev.id);
    const correo = h('input', { type: 'email', autocomplete: 'off', placeholder: 'correo@empresa.com' });
    const invitar = async () => {
      const c = correo.value.trim().toLowerCase();
      if (!c.includes('@')) { decir('Escribe un correo.', 'error'); return; }
      ok(await sb.from('evento_invitados').insert({ evento_id: ev.id, correo: c }));
      decir('Invitado. Entra en /evento con ese correo y ve su evento.', 'ok');
      await recargar();
    };
    const faltan = Array.isArray(ev.datos?.faltan) ? ev.datos.faltan.length : 0;
    return tarjeta(`${fecha(ev.fecha)} · ${ev.titulo}`,
      h('p', { class: 'app-fila' }, chip(ev.estado), faltan ? h('span', { class: 'app-nota' }, `${faltan} cosas por saber del cliente`) : null),
      suyos.length
        ? h('ul', {}, suyos.map(i => h('li', {}, i.correo, ' ', i.user_id ? chip('ha entrado', 'ok') : chip('aún no ha entrado'))))
        : h('p', { class: 'app-nota' }, 'Nadie invitado todavía.'),
      campo('Invitar a verlo', correo, 'No le enviamos nada: se lo dices tú y entra en eventspenedes.com/evento con este correo.'),
      h('p', { class: 'app-fila' }, boton('Invitar', invitar),
        h('a', { class: 'btn btn--ghost', href: `/evento#${ev.id}`, target: '_blank', rel: 'noopener' }, 'Verlo como el cliente')));
  };

  return {
    n: nuevas.length,
    intro: 'Lo que cada cliente ve en su página privada y lo que nos pide desde ella. Nada llega a los partners.',
    nodos: [
      h('h3', {}, 'Lo que piden'),
      nuevas.length ? nuevas.map(tarjetaPeticion) : h('p', { class: 'app-vacio' }, 'Nada por contestar.'),
      h('h3', {}, 'Eventos'),
      eventos.length ? h('div', { class: 'app-rejilla' }, eventos.map(tarjetaEvento))
        : h('p', { class: 'app-vacio' }, 'Ninguno todavía. Se cargan con node tools/evento-cliente.mjs eventos/<id>.json.'),
      peticiones.length > nuevas.length ? h('details', {}, h('summary', {}, `Ya contestadas (${peticiones.length - nuevas.length})`),
        peticiones.filter(p => p.estado === 'respondida').map(tarjetaPeticion)) : null,
    ],
  };
}

extras.admin.push(async ctx => {
  try { return { id: 'clientes-eventos', titulo: 'Eventos de clientes', corto: 'Clientes', icono: 'clientes', ...(await vistaAdmin(ctx)) }; } catch (e) {
    return { id: 'clientes-eventos', titulo: 'Eventos de clientes', icono: 'clientes', n: 0, nodos: [h('p', { class: 'app-vacio' }, `No se ha podido cargar: ${e.message}`)] };
  }
});

export { vistaAdmin };
