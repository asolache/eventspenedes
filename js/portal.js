/* =============================================================================
   Events Penedès — el portal de partners (/acceso)

   Un partner entra con GitHub o con su correo y ve lo suyo: su enlace, su
   ficha (la publicada y lo que tiene pendiente), sus fotos, su acuerdo, los
   leads que nos ha traído y cuánto se ve su página. Todo lo que cambia queda
   pendiente hasta que un administrador lo valida.

   Un partner contesta además las reservas que le pedimos (confirma, propone
   otra cosa o no puede), firma o rechaza versiones del acuerdo y nos escribe;
   cada paso pasa a Zoho. Un administrador lo ve todo de cada partner (ver
   js/portal-admin.js).

   Los permisos no viven aquí: la base de datos solo devuelve y acepta lo que
   a cada uno le toca. Esta página solo lo enseña.
   ========================================================================== */
import { sb, datosActuales, proponer } from './portal-cliente.js';
import { poner, h, fecha, ok, intentar, decir, vistaPrevia } from './portal-ui.js';
import { lineaDeTiempo, formComentario, tarjetaReserva, historialAcuerdos, formAcuerdo, herramientas } from './portal-relacion.js';
import { panelAdmin } from './portal-admin.js';
import { app, tarjeta, kpis, chip, vistasExtra } from './portal-app.js';
import { planes, nombrePlan, vistaPlan, asistenteDescripcion, tarjetasPlanes } from './portal-planes.js';

const raiz = document.getElementById('portal');
const $ = s => raiz.querySelector(s);
const TIPOS = { localizacion: 'Espacio', proveedor: 'Actuación o servicio' };
const FICHA = { localizacion: '/alta-localizacion', proveedor: '/alta-proveedor' };
const ESTADOS_LEAD = { nuevo: 'Nuevo' };
const ESTADOS_PARTNER = { invitado: 'Invitado', activo: 'Activo', pausado: 'Pausado' };
const MAX_FOTO = 8 * 1024 * 1024;

/* --- Entrar ---------------------------------------------------------------- */

const volver = () => location.origin + '/acceso';

$('[data-accion="github"]').addEventListener('click', intentar(async () => {
  ok(await sb.auth.signInWithOAuth({ provider: 'github', options: { redirectTo: volver() } }));
}));

$('[data-form="entrar"]').addEventListener('submit', intentar(async ev => {
  ev.preventDefault();
  const f = ev.target;
  const correo = f.correo.value.trim().toLowerCase();
  const clave = f.clave.value;
  if (ev.submitter && ev.submitter.dataset.modo === 'alta') {
    ok(await sb.auth.signUp({ email: correo, password: clave, options: { emailRedirectTo: volver() } }));
    decir('Te hemos enviado un correo para confirmar la cuenta. Ábrelo y vuelve aquí.', 'ok');
    return;
  }
  ok(await sb.auth.signInWithPassword({ email: correo, password: clave }));
}));

$('[data-accion="olvido"]').addEventListener('click', intentar(async () => {
  const correo = $('#p-correo').value.trim().toLowerCase();
  if (!correo) { decir('Escribe tu correo arriba y vuelve a pulsar.', 'error'); return; }
  ok(await sb.auth.resetPasswordForEmail(correo, { redirectTo: volver() }));
  decir('Si el correo está dado de alta, te llega un enlace para poner una contraseña nueva.', 'ok');
}));

$('[data-form="nueva-clave"]').addEventListener('submit', intentar(async ev => {
  ev.preventDefault();
  ok(await sb.auth.updateUser({ password: ev.target.clave.value }));
  ev.target.hidden = true;
  decir('Contraseña cambiada.', 'ok');
}));

sb.auth.onAuthStateChange((evento, sesion) => {
  if (evento === 'PASSWORD_RECOVERY') { $('[data-form="nueva-clave"]').hidden = false; }
  pintar(sesion);
});

/* --- Pintar ---------------------------------------------------------------- */

let pintando = null;
async function pintar(sesion) {
  $('[data-vista="fuera"]').hidden = Boolean(sesion);
  $('[data-vista="dentro"]').hidden = !sesion;
  document.body.classList.toggle('en-app', Boolean(sesion));
  if (!sesion) { return; }
  if (pintando) { return; }
  pintando = (async () => {
    const [partners, esAdmin] = await Promise.all([
      sb.from('partners').select('id,codigo,nombre,tipo,estado,plan,tester').order('nombre').then(ok),
      sb.rpc('es_admin').then(ok),
    ]);
    const cont = $('[data-partners]');
    cont.textContent = '';
    const salir = h('button', { class: 'btn btn--ghost', type: 'button', onclick: intentar(async () => { await sb.auth.signOut(); }) }, 'Salir');
    if (!esAdmin && !partners.length) {
      cont.append(h('div', { class: 'app-vacio' },
        h('p', {}, `Has entrado como ${sesion.user.email || 'usuario'}, pero tu cuenta aún no está unida a ningún espacio o proveedor.`),
        h('p', {}, 'Si te hemos invitado con otro correo, entra con ese. Si no, ', h('a', { href: '/red.html#alta' }, 'preséntate'), ' y te damos acceso.'),
        h('p', {}, salir)));
    }
    if (!esAdmin && partners.length) {
      let actual = partners.find(x => `#${x.codigo}` === location.hash.split('/')[0]) || partners[0];
      const montar = async () => {
        const otro = partners.length > 1 ? h('select', { 'aria-label': 'Cambiar de partner', onchange: ev => {
          actual = partners.find(x => x.id === ev.target.value);
          montar().catch(e => decir(e.message, 'error'));
        } }, partners.map(x => h('option', { value: x.id, selected: x.id === actual.id ? true : null }, x.nombre))) : null;
        cont.replaceChildren(await panelPartner(actual, { sesion, acciones: [otro, salir] }));
      };
      await montar();
    }
    const admin = $('[data-admin]');
    admin.hidden = !esAdmin;
    if (esAdmin) { await panelAdmin(admin, null, { sesion, salir }); }
  })().catch(e => decir(e.message, 'error')).finally(() => { pintando = null; });
}

/* --- El panel de un partner, como app ---------------------------------------- */

async function panelPartner(p, { sesion, acciones }) {
  let raiz = null;
  const recargar = async () => { raiz.replaceWith(await panelPartner(p, { sesion, acciones })); };
  const desde30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const [actual, ficha, acuerdos, leads, impresiones, reservas, mensajes, miembros, { data: u }, datosPlanes] = await Promise.all([
    datosActuales(p.id),
    sb.from('fichas').select('datos,version').eq('partner_id', p.id).maybeSingle().then(ok),
    sb.from('acuerdos').select('*').eq('partner_id', p.id).order('version', { ascending: false }).then(ok),
    sb.from('leads').select('tipo_evento,personas,fecha_evento,estado,creado_en').eq('partner_id', p.id).order('creado_en', { ascending: false }).limit(50).then(ok),
    sb.from('impresiones').select('dia,vistas,clics').eq('partner_id', p.id).gte('dia', desde30).then(ok),
    sb.from('reservas').select('*').eq('partner_id', p.id).order('fecha').then(ok),
    sb.from('mensajes').select('*').eq('partner_id', p.id).order('creado_en').limit(300).then(ok),
    sb.from('miembros').select('user_id').eq('partner_id', p.id).then(ok),
    sb.auth.getUser(),
    planes().catch(() => null),
  ]);
  const yo = u.user.id;
  const nombres = Object.fromEntries(miembros.map(m => [m.user_id, 'Tu equipo']));
  const ctx = { admin: false, partner: p, acuerdos, mensajes, recargar, yo, nombres, partnerId: p.id };

  const enlace = `https://eventspenedes.com/r/${p.codigo}`;
  const vistas = impresiones.reduce((s, x) => s + x.vistas, 0);
  const clics = impresiones.reduce((s, x) => s + x.clics, 0);
  const hoy = new Date().toISOString().slice(0, 10);
  const porContestar = reservas.filter(r => r.estado === 'solicitada');
  const proximas = reservas.filter(r => r.estado !== 'cancelada' && r.fecha >= hoy);
  const confirmadas = reservas.filter(r => r.estado === 'confirmada');
  const hechos = confirmadas.filter(r => r.fecha < hoy);
  const porFirmar = acuerdos.filter(a => a.estado === 'propuesto' && !a.aceptado_por);
  const vigente = acuerdos.find(a => a.estado === 'vigente');
  const datos = actual.pendiente || actual.publicada || {};
  const fotos = Array.isArray(datos.imagenes) ? datos.imagenes : [];
  const ir = (vista, texto = 'Ir') => h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => raiz.ir(vista) }, texto);
  const publicada = actual.publicada?.autoriza === 'si' && p.estado === 'activo';

  /* Inicio: lo que le toca hacer y cómo va */
  const tareas = [
    porContestar.length ? [`Contestar ${porContestar.length} reserva${porContestar.length > 1 ? 's' : ''}`, 'reservas'] : null,
    porFirmar.length ? ['Revisar la propuesta de acuerdo', 'acuerdo'] : null,
    !actual.version && !actual.pendiente ? ['Completar tu ficha', 'ficha'] : null,
    !datos.descripcion ? ['Escribir tu presentación (la IA te ayuda)', 'ficha'] : null,
    !fotos.length ? ['Subir fotos que podamos publicar', 'ficha'] : null,
    datos.autoriza !== 'si' && (actual.version || actual.pendiente) ? ['Autorizar en tu ficha que publiquemos tu página', 'ficha'] : null,
    !vigente && !porFirmar.length ? ['Proponer las condiciones del acuerdo', 'acuerdo'] : null,
  ].filter(Boolean);
  const inicio = [
    kpis([
      ['Visitas a tu página', vistas, '30 días'],
      ['Clientes por tu enlace', leads.length],
      ['Reservas por contestar', porContestar.length, null, porContestar.length ? 'oro' : null],
      ['Eventos hechos', hechos.length],
    ]),
    h('div', { class: 'app-rejilla' },
      tarjeta('Ahora te toca', tareas.length
        ? h('ul', { class: 'app-tareas' }, tareas.map(([t, v]) => h('li', {}, h('span', {}, t), ir(v))))
        : h('p', {}, 'Nada pendiente. Te avisamos cuando haya una reserva o un cambio que revisar.'),
      actual.pendiente ? h('p', { class: 'app-nota' }, 'Tienes cambios de ficha esperando nuestra revisión.') : null),
      tarjeta('Tu enlace y tu página',
        h('p', {}, 'Compártelo: quien escriba después de entrar por él queda apuntado como tuyo.'),
        h('p', { class: 'app-fila' }, h('code', {}, enlace),
          h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => navigator.clipboard.writeText(enlace).then(() => decir('Enlace copiado.', 'ok')) }, 'Copiar')),
        publicada
          ? h('p', {}, h('a', { href: `/partners/${p.codigo}` }, 'Ver tu página pública'))
          : h('p', { class: 'app-fila' }, h('span', { class: 'app-nota' }, 'Tu página sale cuando aprobamos tu ficha y autorizas publicarla.'),
            h('button', { class: 'btn btn--ghost', type: 'button', onclick: intentar(() => vistaPrevia(p.codigo)) }, 'Ver cómo quedará'))),
      datosPlanes ? h('div', { class: 'app-card' }, h('h3', {}, 'Tu plan'),
        h('p', {}, h('strong', {}, nombrePlan(datosPlanes, p.plan || 'ficha')), ' ', p.tester ? chip('tester', 'oro') : null),
        h('p', { class: 'app-nota' }, 'Con la página o la web propia tienes estadísticas, respuestas preparadas y tu web.'),
        ir('plan', 'Ver los planes')) : null),
  ];

  /* Reservas */
  const pasadas = reservas.filter(r => !proximas.includes(r));
  const vReservas = [
    proximas.length
      ? h('div', { class: 'portal__reservas' }, proximas.map(r => tarjetaReserva(r, ctx)))
      : h('p', { class: 'app-vacio' }, 'Cuando te pidamos una reserva para un evento, sale aquí para que la confirmes, propongas otra cosa o nos digas que no podéis.'),
    pasadas.length ? h('details', {}, h('summary', {}, `Reservas pasadas o canceladas (${pasadas.length})`),
      h('div', { class: 'portal__reservas' }, pasadas.map(r => tarjetaReserva(r, ctx)))) : null,
  ];

  /* Flujo de valor */
  const embudo = [
    ['Visitas a tu página', vistas, 'últimos 30 días'],
    ['Clics en «Organizar un evento aquí»', clics, 'últimos 30 días'],
    ['Clientes que nos has traído', leads.length, 'por tu enlace'],
    ['Reservas pedidas', reservas.length, 'en total'],
    ['Reservas confirmadas', confirmadas.length, 'en total'],
    ['Eventos hechos', hechos.length, 'en total'],
  ];
  const vFlujo = [
    h('ol', { class: 'portal__embudo' }, embudo.map(([t, n, nota]) =>
      h('li', {}, h('span', { class: 'portal__embudo-n' }, String(n)), h('span', {}, t), h('span', { class: 'form__note' }, nota)))),
    h('div', { class: 'app-rejilla' },
      tarjeta('Lo que aportas',
        h('ul', { class: 'portal__herramientas' }, [
          [Boolean(actual.version), 'Ficha aprobada', actual.version ? `versión ${actual.version}` : 'aún no'],
          [fotos.length > 0, 'Fotos', `${fotos.length}`],
          [datos.autoriza === 'si', 'Página autorizada para publicar', datos.autoriza === 'si' ? 'sí' : 'aún no'],
          [porContestar.length === 0, 'Reservas contestadas', porContestar.length ? `${porContestar.length} por contestar` : 'al día'],
        ].map(([hecho, que, como]) => h('li', { 'data-hecho': hecho ? 'si' : 'no' },
          h('span', { 'aria-hidden': 'true' }, hecho ? '✓ ' : '○ '), h('strong', {}, que), ' · ', como)))),
      tarjeta('Lo que te damos', herramientas({ partner: p, ficha, acuerdos, reservas: reservas.length, leads: leads.length, vistas }))),
  ];

  /* Ficha, fotos e IA */
  const galeria = h('ul', { class: 'portal__fotos' });
  for (const ruta of fotos) {
    const { data } = await sb.storage.from('fotos').createSignedUrl(ruta, 3600);
    galeria.append(h('li', {}, data ? h('img', { src: data.signedUrl, alt: '' }) : h('span', {}, ruta),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: intentar(async () => {
        await proponer(p.id, { ...datos, imagenes: fotos.filter(x => x !== ruta) });
        decir('Foto quitada. Queda pendiente de validar.', 'ok');
        await recargar();
      }) }, 'Quitar')));
  }
  const subir = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp', multiple: true });
  subir.addEventListener('change', intentar(async () => {
    const nuevas = [];
    for (const f of subir.files) {
      if (f.size > MAX_FOTO) { throw new Error(`«${f.name}» pesa más de 8 MB.`); }
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[f.type];
      if (!ext) { throw new Error(`«${f.name}» no es JPG, PNG ni WebP.`); }
      const ruta = `${p.id}/${crypto.randomUUID()}.${ext}`;
      ok(await sb.storage.from('fotos').upload(ruta, f, { contentType: f.type }));
      nuevas.push(ruta);
    }
    if (!nuevas.length) { return; }
    await proponer(p.id, { ...datos, imagenes: [...fotos, ...nuevas] });
    decir(`${nuevas.length} foto${nuevas.length > 1 ? 's' : ''} subida${nuevas.length > 1 ? 's' : ''}. Queda pendiente de validar.`, 'ok');
    await recargar();
  }));
  const vFicha = [
    tarjeta(null,
      h('p', { class: 'app-fila' },
        actual.version ? chip(`Publicada · versión ${actual.version}`, 'ok') : chip('Sin versión aprobada', 'aviso'),
        actual.pendiente ? chip('Cambios pendientes de validar', 'aviso') : null,
        datos.autoriza === 'si' ? chip('Autorizas publicarla', 'ok') : chip('Sin autorizar la publicación')),
      h('p', { class: 'app-fila' },
        h('button', { class: 'btn btn--primary', type: 'button', onclick: () => abrirFicha(p, actual) }, 'Editar mi ficha'),
        (actual.pendiente || actual.publicada)
          ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: intentar(() => vistaPrevia(p.codigo)) }, 'Ver cómo queda en la web')
          : null),
      h('p', { class: 'app-nota' }, 'Puedes empezar importando tu web o tu catálogo en PDF desde «Editar mi ficha».')),
    (actual.pendiente || actual.publicada) ? asistenteDescripcion(p, datos, { recargar }) : null,
    tarjeta('Tus fotos', galeria.childElementCount ? galeria : h('p', { class: 'app-nota' }, 'Aún no hay fotos.'),
      h('p', {}, h('label', {}, 'Añadir fotos (JPG, PNG o WebP, hasta 8 MB): ', subir)),
      h('p', { class: 'app-nota' }, 'Sube solo fotos que podáis publicar. Las revisamos antes de que salgan en la web.')),
  ];

  /* Acuerdo, clientes y conversación */
  const vAcuerdo = [historialAcuerdos(acuerdos, ctx),
    h('details', {}, h('summary', {}, 'Proponer cambios en el acuerdo'), formAcuerdo({ partnerId: p.id, acuerdos, recargar, admin: false }))];
  const vClientes = [leads.length
    ? h('table', { class: 'app-tabla portal__tabla--tarjetas' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Llegó'), h('th', {}, 'Evento'), h('th', {}, 'Personas'), h('th', {}, 'Fecha'), h('th', {}, 'Estado'))),
      h('tbody', {}, leads.map(l => h('tr', {}, h('td', { 'data-c': 'Llegó' }, fecha(l.creado_en)), h('td', { 'data-c': 'Evento' }, l.tipo_evento || '—'),
        h('td', { 'data-c': 'Personas' }, l.personas ?? '—'), h('td', { 'data-c': 'Fecha' }, l.fecha_evento ? fecha(l.fecha_evento) : '—'),
        h('td', { 'data-c': 'Estado' }, ESTADOS_LEAD[l.estado] || l.estado)))))
    : h('p', { class: 'app-vacio' }, 'Todavía ninguno. Cada cliente que nos escriba después de entrar por tu enlace saldrá aquí.')];
  const vConversacion = [
    tarjeta(null, formComentario({ partnerId: p.id, admin: false, recargar, etiqueta: 'Escríbenos lo que necesites' })),
    lineaDeTiempo([...mensajes].reverse(), ctx),
  ];

  const extra = await vistasExtra('partner', { partner: p, sb, recargar });
  raiz = app({
    clave: p.codigo,
    titulo: p.nombre,
    subtitulo: `${TIPOS[p.tipo]} · ${ESTADOS_PARTNER[p.estado] || p.estado} · ${sesion.user.email || ''}`,
    marca: 'Events Penedès',
    acciones,
    vistas: [
      { id: 'inicio', titulo: 'Inicio', icono: 'inicio', n: tareas.length, nodos: inicio },
      { id: 'reservas', titulo: 'Reservas', icono: 'reservas', n: porContestar.length,
        intro: 'Te las pedimos nosotros: confirma, propón otra cosa o dinos que no podéis.', nodos: vReservas },
      { id: 'ficha', titulo: 'Ficha, fotos e IA', corto: 'Ficha', icono: 'ficha', nodos: vFicha },
      { id: 'flujo', titulo: 'Tu flujo de valor', corto: 'Flujo', icono: 'flujo',
        intro: 'De quien ve tu página al evento hecho. Cada cifra sale de lo que pasa en el portal.', nodos: vFlujo },
      ...extra,
      { id: 'plan', titulo: 'Tu plan', corto: 'Plan', icono: 'plan', nodos: datosPlanes ? await vistaPlan(p, { recargar }) : [h('p', { class: 'app-vacio' }, 'Los planes no se han podido cargar.')] },
      { id: 'acuerdo', titulo: 'Tu acuerdo', corto: 'Acuerdo', icono: 'acuerdo', n: porFirmar.length,
        intro: 'Cada versión dice de cuál viene y qué cambia. Vale cuando la firmamos las dos partes.', nodos: vAcuerdo },
      { id: 'clientes', titulo: 'Los clientes que nos has traído', corto: 'Clientes', icono: 'clientes', nodos: vClientes },
      { id: 'conversacion', titulo: 'Nuestra conversación', corto: 'Mensajes', icono: 'conversacion', nodos: vConversacion },
    ],
  });
  return raiz;
}

/* La ficha se edita en su formulario de siempre, con lo último que hay */
function abrirFicha(p, actual) {
  const clave = `ep-ficha-${p.tipo}`;
  const partida = p.tipo === 'localizacion' ? 'ep-ficha-partida' : `${clave}-partida`;
  const { imagenes, ...datos } = actual.pendiente || actual.publicada || {};
  try {
    localStorage.setItem(clave, JSON.stringify(datos));
    localStorage.setItem(partida, JSON.stringify(actual.publicada || {}));
    sessionStorage.setItem('ep-portal', JSON.stringify({ partner: p.id, tipo: p.tipo }));
  } catch (e) { /* sin almacenamiento: abre la ficha vacía */ }
  location.href = FICHA[p.tipo];
}

/* --- Arranque ------------------------------------------------------------------ */

/* Los planes, también para quien aún no ha entrado: salen de data/planes.json */
planes().then(datos => {
  const caja = $('[data-planes-lista]');
  if (caja) { caja.replaceChildren(tarjetasPlanes(datos), h('p', { class: 'form__note' }, datos.oferta_testers?.texto || '')); }
}).catch(() => { $('[data-planes]')?.remove(); });

sb.auth.getSession().then(({ data }) => pintar(data.session));
