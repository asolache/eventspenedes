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

const raiz = document.getElementById('portal');
const $ = s => raiz.querySelector(s);
const TIPOS = { localizacion: 'Espacio', proveedor: 'Proveedor' };
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

$('[data-accion="salir"]').addEventListener('click', intentar(async () => { await sb.auth.signOut(); }));

sb.auth.onAuthStateChange((evento, sesion) => {
  if (evento === 'PASSWORD_RECOVERY') { $('[data-form="nueva-clave"]').hidden = false; }
  pintar(sesion);
});

/* --- Pintar ---------------------------------------------------------------- */

let pintando = null;
async function pintar(sesion) {
  $('[data-vista="fuera"]').hidden = Boolean(sesion);
  $('[data-vista="dentro"]').hidden = !sesion;
  if (!sesion) { return; }
  if (pintando) { return; }
  pintando = (async () => {
    $('[data-quien]').textContent = sesion.user.email || 'Sesión iniciada';
    const [partners, esAdmin] = await Promise.all([
      sb.from('partners').select('id,codigo,nombre,tipo,estado').order('nombre').then(ok),
      sb.rpc('es_admin').then(ok),
    ]);
    const cont = $('[data-partners]');
    cont.textContent = '';
    if (!esAdmin && !partners.length) {
      cont.append(h('p', {}, 'Tu cuenta aún no está unida a ningún espacio o proveedor. Si te hemos invitado con otro correo, entra con ese. Si no, ',
        h('a', { href: '/red.html#alta' }, 'preséntate'), ' y te damos acceso.'));
    }
    if (!esAdmin) { for (const p of partners) { cont.append(await panelPartner(p)); } }
    const admin = $('[data-admin]');
    admin.hidden = !esAdmin;
    if (esAdmin) { await panelAdmin(admin); }
  })().catch(e => decir(e.message, 'error')).finally(() => { pintando = null; });
}

/* --- El panel de un partner -------------------------------------------------- */

async function panelPartner(p) {
  const caja = h('article', { class: 'portal__partner card' });
  const recargar = async () => { caja.replaceWith(await panelPartner(p)); };
  const desde30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const [actual, ficha, acuerdos, leads, impresiones, reservas, mensajes, miembros, { data: u }] = await Promise.all([
    datosActuales(p.id),
    sb.from('fichas').select('datos,version').eq('partner_id', p.id).maybeSingle().then(ok),
    sb.from('acuerdos').select('*').eq('partner_id', p.id).order('version', { ascending: false }).then(ok),
    sb.from('leads').select('tipo_evento,personas,fecha_evento,estado,creado_en').eq('partner_id', p.id).order('creado_en', { ascending: false }).limit(50).then(ok),
    sb.from('impresiones').select('dia,vistas,clics').eq('partner_id', p.id).gte('dia', desde30).then(ok),
    sb.from('reservas').select('*').eq('partner_id', p.id).order('fecha').then(ok),
    sb.from('mensajes').select('*').eq('partner_id', p.id).order('creado_en').limit(300).then(ok),
    sb.from('miembros').select('user_id').eq('partner_id', p.id).then(ok),
    sb.auth.getUser(),
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
  const id = s => `${p.codigo}-${s}`;
  const ir = s => h('a', { href: `#${id(s)}` }, 'Ir');

  poner(caja,
    h('header', { class: 'portal__cab' },
      h('h2', {}, p.nombre),
      h('p', { class: 'portal__chips' }, h('span', { class: 'portal__chip' }, TIPOS[p.tipo]),
        h('span', { class: 'portal__chip', 'data-estado': p.estado }, ESTADOS_PARTNER[p.estado] || p.estado))),
    h('nav', { class: 'portal__nav', 'aria-label': `Secciones de ${p.nombre}` },
      [['pendiente', 'Pendiente'], ['reservas', 'Reservas'], ['flujo', 'Flujo de valor'], ['ficha', 'Ficha y fotos'],
        ['acuerdo', 'Acuerdo'], ['clientes', 'Clientes'], ['conversacion', 'Conversación']]
        .map(([s, t]) => h('a', { href: `#${id(s)}` }, t))),
  );

  /* Lo que le toca hacer ahora, en una lista corta */
  const tareas = [
    porContestar.length ? [`Contestar ${porContestar.length} reserva${porContestar.length > 1 ? 's' : ''}`, 'reservas'] : null,
    porFirmar.length ? ['Revisar la propuesta de acuerdo', 'acuerdo'] : null,
    !actual.version && !actual.pendiente ? ['Completar tu ficha', 'ficha'] : null,
    !fotos.length ? ['Subir fotos que podamos publicar', 'ficha'] : null,
    datos.autoriza !== 'si' && (actual.version || actual.pendiente) ? ['Autorizar en tu ficha que publiquemos tu página', 'ficha'] : null,
    !vigente && !porFirmar.length ? ['Proponer las condiciones del acuerdo', 'acuerdo'] : null,
  ].filter(Boolean);
  poner(caja, h('section', { class: 'portal__bloque', id: id('pendiente') },
    h('h3', {}, 'Ahora te toca'),
    tareas.length
      ? h('ul', { class: 'portal__tareas' }, tareas.map(([t, s]) => h('li', {}, h('span', {}, t), ir(s))))
      : h('p', {}, 'Nada pendiente. Te avisamos cuando haya una reserva o un cambio que revisar.'),
    actual.pendiente ? h('p', { class: 'form__note' }, 'Tienes cambios de ficha esperando nuestra revisión.') : null));

  /* Las reservas, lo primero: es lo que tiene prisa */
  const secReservas = h('section', { class: 'portal__bloque', id: id('reservas') }, h('h3', {}, 'Reservas'));
  poner(secReservas, proximas.length
    ? h('div', { class: 'portal__reservas' }, proximas.map(r => tarjetaReserva(r, ctx)))
    : h('p', {}, 'Cuando te pidamos una reserva para un evento, sale aquí para que la confirmes, propongas otra cosa o nos digas que no podéis.'));
  const pasadas = reservas.filter(r => !proximas.includes(r));
  if (pasadas.length) {
    poner(secReservas, h('details', {}, h('summary', {}, `Reservas pasadas o canceladas (${pasadas.length})`),
      h('div', { class: 'portal__reservas' }, pasadas.map(r => tarjetaReserva(r, ctx)))));
  }
  poner(caja, secReservas);

  /* El flujo de valor: de quien ve su página al evento hecho, y qué se intercambia */
  const embudo = [
    ['Visitas a tu página', vistas, 'últimos 30 días'],
    ['Clics en «Organizar un evento aquí»', clics, 'últimos 30 días'],
    ['Clientes que nos has traído', leads.length, 'por tu enlace'],
    ['Reservas pedidas', reservas.length, 'en total'],
    ['Reservas confirmadas', confirmadas.length, 'en total'],
    ['Eventos hechos', hechos.length, 'en total'],
  ];
  poner(caja, h('section', { class: 'portal__bloque', id: id('flujo') },
    h('h3', {}, 'Tu flujo de valor'),
    h('p', { class: 'form__note' }, 'De quien ve tu página al evento hecho. Cada cifra sale de lo que pasa en el portal.'),
    h('ol', { class: 'portal__embudo' }, embudo.map(([t, n, nota]) =>
      h('li', {}, h('span', { class: 'portal__embudo-n' }, String(n)), h('span', {}, t), h('span', { class: 'form__note' }, nota)))),
    h('div', { class: 'portal__intercambio' },
      h('div', {}, h('h4', {}, 'Lo que aportas'),
        h('ul', { class: 'portal__herramientas' }, [
          [Boolean(actual.version), 'Ficha aprobada', actual.version ? `versión ${actual.version}` : 'aún no'],
          [fotos.length > 0, 'Fotos', `${fotos.length}`],
          [datos.autoriza === 'si', 'Página autorizada para publicar', datos.autoriza === 'si' ? 'sí' : 'aún no'],
          [porContestar.length === 0, 'Reservas contestadas', porContestar.length ? `${porContestar.length} por contestar` : 'al día'],
        ].map(([hecho, que, como]) => h('li', { 'data-hecho': hecho ? 'si' : 'no' },
          h('span', { 'aria-hidden': 'true' }, hecho ? '✓ ' : '○ '), h('strong', {}, que), ' · ', como)))),
      h('div', {}, h('h4', {}, 'Lo que te damos'),
        herramientas({ partner: p, ficha, acuerdos, reservas: reservas.length, leads: leads.length, vistas }))),
    h('h4', {}, 'Tu enlace'),
    h('p', {}, 'Compártelo: quien escriba después de entrar por él queda apuntado como tuyo.'),
    h('p', { class: 'portal__enlace' }, h('code', {}, enlace), ' ',
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => navigator.clipboard.writeText(enlace).then(() => decir('Enlace copiado.', 'ok')) }, 'Copiar')),
    h('p', {}, h('a', { href: `/partners/${p.codigo}` }, 'Tu página pública'),
      ' (solo se ve si la ficha está aprobada y has autorizado publicarla).')));

  /* La ficha y las fotos */
  const secFicha = h('section', { class: 'portal__bloque', id: id('ficha') });
  poner(caja, secFicha);
  poner(secFicha,
    h('h3', {}, 'Tu ficha y tus fotos'),
    h('p', {}, actual.version ? `Publicada: versión ${actual.version}, del ${fecha(actual.fecha)}.` : 'Aún no hay ninguna versión aprobada.',
      actual.pendiente ? ' Tienes cambios pendientes de validar.' : ''),
    h('p', {}, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => abrirFicha(p, actual) }, 'Editar mi ficha'),
      ' ', (actual.pendiente || actual.publicada)
        ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: intentar(() => vistaPrevia(p.codigo)) }, 'Ver cómo queda en la web')
        : null,
      ' ', h('span', { class: 'form__note' }, 'Puedes empezar importando tu web o tu catálogo en PDF.')),
  );

  /* Las fotos */
  poner(secFicha, h('h4', {}, 'Tus fotos'));
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
  poner(secFicha, galeria,
    h('p', {}, h('label', {}, 'Añadir fotos (JPG, PNG o WebP, hasta 8 MB): ', subir)),
    h('p', { class: 'form__note' }, 'Sube solo fotos que podáis publicar. Las revisamos antes de que salgan en la web.'));
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

  /* El acuerdo, con su historial */
  poner(caja, h('section', { class: 'portal__bloque', id: id('acuerdo') }, h('h3', {}, 'Tu acuerdo'),
    h('p', { class: 'form__note' }, 'Cada versión dice de cuál viene y qué cambia. Vale cuando la firmamos las dos partes; la anterior queda guardada.'),
    historialAcuerdos(acuerdos, ctx),
    h('details', {}, h('summary', {}, 'Proponer cambios en el acuerdo'), formAcuerdo({ partnerId: p.id, acuerdos, recargar, admin: false }))));

  /* Los leads */
  poner(caja, h('section', { class: 'portal__bloque', id: id('clientes') }, h('h3', {}, 'Los clientes que nos has traído'), leads.length
    ? h('table', { class: 'portal__tabla portal__tabla--tarjetas' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Llegó'), h('th', {}, 'Evento'), h('th', {}, 'Personas'), h('th', {}, 'Fecha'), h('th', {}, 'Estado'))),
      h('tbody', {}, leads.map(l => h('tr', {}, h('td', { 'data-c': 'Llegó' }, fecha(l.creado_en)), h('td', { 'data-c': 'Evento' }, l.tipo_evento || '—'),
        h('td', { 'data-c': 'Personas' }, l.personas ?? '—'), h('td', { 'data-c': 'Fecha' }, l.fecha_evento ? fecha(l.fecha_evento) : '—'),
        h('td', { 'data-c': 'Estado' }, ESTADOS_LEAD[l.estado] || l.estado)))))
    : h('p', {}, 'Todavía ninguno. Cada cliente que nos escriba después de entrar por tu enlace saldrá aquí.')));

  /* La conversación entera */
  poner(caja, h('section', { class: 'portal__bloque', id: id('conversacion') }, h('h3', {}, 'Nuestra conversación'),
    h('details', {}, h('summary', {}, `Todo lo que ha pasado (${mensajes.length})`), lineaDeTiempo([...mensajes].reverse(), ctx)),
    formComentario({ partnerId: p.id, admin: false, recargar, etiqueta: 'Escríbenos lo que necesites' })));
  return caja;
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

sb.auth.getSession().then(({ data }) => pintar(data.session));
