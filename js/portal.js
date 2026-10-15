/* =============================================================================
   Events Penedès — el portal de partners (/acceso)

   Un partner entra con GitHub o con su correo y ve lo suyo: su enlace, su
   ficha (la publicada y lo que tiene pendiente), sus fotos, su acuerdo, los
   leads que nos ha traído y cuánto se ve su página. Todo lo que cambia queda
   pendiente hasta que un administrador lo valida.

   Un administrador ve además todos los partners, invita, valida cambios y
   acuerdos y ve lo que cuestan las importaciones de catálogos.

   Los permisos no viven aquí: la base de datos solo devuelve y acepta lo que
   a cada uno le toca. Esta página solo lo enseña.
   ========================================================================== */
import { sb, datosActuales, proponer } from './portal-cliente.js';

const raiz = document.getElementById('portal');
const $ = s => raiz.querySelector(s);
const estado = $('[data-estado]');
const TIPOS = { localizacion: 'Espacio', proveedor: 'Proveedor' };
const FICHA = { localizacion: '/alta-localizacion', proveedor: '/alta-proveedor' };
const ESTADOS_LEAD = { nuevo: 'Nuevo' };
const MAX_FOTO = 8 * 1024 * 1024;

function decir(texto, tipo) {
  estado.textContent = texto;
  estado.setAttribute('data-tipo', tipo || 'info');
  estado.hidden = !texto;
}

/* Un nodo sin innerHTML: lo que escribe un partner nunca se interpreta */
function h(tag, attrs, ...hijos) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) { continue; }
    if (k.startsWith('on')) { el.addEventListener(k.slice(2), v); } else { el.setAttribute(k, v === true ? '' : v); }
  }
  for (const c of hijos.flat()) { if (c !== null && c !== undefined && c !== false) { el.append(c.nodeType ? c : String(c)); } }
  return el;
}

const fecha = f => (f ? new Date(f).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const ok = ({ error, data }) => { if (error) { throw new Error(error.message); } return data; };
const intentar = fn => async (...a) => {
  try { await fn(...a); } catch (e) { decir(e.message, 'error'); }
};

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
    if (esAdmin) { await panelAdmin(admin, partners); }
  })().catch(e => decir(e.message, 'error')).finally(() => { pintando = null; });
}

/* --- El panel de un partner -------------------------------------------------- */

async function panelPartner(p) {
  const caja = h('article', { class: 'portal__partner card' });
  const recargar = async () => { caja.replaceWith(await panelPartner(p)); };

  const [actual, acuerdos, leads, impresiones] = await Promise.all([
    datosActuales(p.id),
    sb.from('acuerdos').select('*').eq('partner_id', p.id).order('version', { ascending: false }).then(ok),
    sb.from('leads').select('tipo_evento,personas,fecha_evento,estado,creado_en').eq('partner_id', p.id).order('creado_en', { ascending: false }).limit(50).then(ok),
    sb.from('impresiones').select('dia,vistas,clics').eq('partner_id', p.id)
      .gte('dia', new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).then(ok),
  ]);

  const enlace = `https://eventspenedes.com/r/${p.codigo}`;
  const vistas = impresiones.reduce((s, x) => s + x.vistas, 0);
  const clics = impresiones.reduce((s, x) => s + x.clics, 0);
  caja.append(
    h('h2', {}, p.nombre),
    h('p', { class: 'eyebrow' }, `${TIPOS[p.tipo]} · ${p.estado}`),
    h('dl', { class: 'portal__cifras' },
      h('div', {}, h('dt', {}, 'Visitas a tu página (30 días)'), h('dd', {}, String(vistas))),
      h('div', {}, h('dt', {}, 'Clics en «Organizar un evento aquí»'), h('dd', {}, String(clics))),
      h('div', {}, h('dt', {}, 'Leads que nos has traído'), h('dd', {}, String(leads.length)))),
    h('h3', {}, 'Tu enlace'),
    h('p', {}, 'Compártelo: quien escriba después de entrar por él queda apuntado como tuyo.'),
    h('p', { class: 'portal__enlace' }, h('code', {}, enlace), ' ',
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => navigator.clipboard.writeText(enlace).then(() => decir('Enlace copiado.', 'ok')) }, 'Copiar')),
    h('p', {}, h('a', { href: `/partners/${p.codigo}` }, 'Tu página pública'),
      ' (solo se ve si la ficha está aprobada y has autorizado publicarla).'),
  );

  /* La ficha */
  const datos = actual.pendiente || actual.publicada || {};
  caja.append(
    h('h3', {}, 'Tu ficha'),
    h('p', {}, actual.version ? `Publicada: versión ${actual.version}, del ${fecha(actual.fecha)}.` : 'Aún no hay ninguna versión aprobada.',
      actual.pendiente ? ' Tienes cambios pendientes de validar.' : ''),
    h('p', {}, h('button', { class: 'btn btn--primary', type: 'button', onclick: () => abrirFicha(p, actual) }, 'Editar mi ficha'),
      ' ', h('span', { class: 'form__note' }, 'Puedes empezar importando tu web o tu catálogo en PDF.')),
  );

  /* Las fotos */
  caja.append(h('h3', {}, 'Tus fotos'));
  const fotos = Array.isArray(datos.imagenes) ? datos.imagenes : [];
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
  caja.append(galeria,
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

  /* El acuerdo */
  caja.append(h('h3', {}, 'Tu acuerdo'), listaAcuerdos(acuerdos, false, recargar),
    formAcuerdo(p, acuerdos, recargar));

  /* Los leads */
  caja.append(h('h3', {}, 'Lo que te hemos traído'));
  caja.append(leads.length
    ? h('table', { class: 'portal__tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Llegó'), h('th', {}, 'Evento'), h('th', {}, 'Personas'), h('th', {}, 'Fecha'), h('th', {}, 'Estado'))),
      h('tbody', {}, leads.map(l => h('tr', {}, h('td', {}, fecha(l.creado_en)), h('td', {}, l.tipo_evento || '—'),
        h('td', {}, l.personas ?? '—'), h('td', {}, l.fecha_evento ? fecha(l.fecha_evento) : '—'), h('td', {}, ESTADOS_LEAD[l.estado] || l.estado)))))
    : h('p', {}, 'Todavía ninguno. Cada cliente que nos escriba después de entrar por tu enlace saldrá aquí.'));
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

/* --- Acuerdos --------------------------------------------------------------- */

const ESTADO_ACUERDO = { propuesto: 'Propuesto', vigente: 'Vigente', sustituido: 'Sustituido', rechazado: 'Rechazado' };

function listaAcuerdos(acuerdos, admin, recargar, nombres = {}) {
  if (!acuerdos.length) { return h('p', {}, 'Aún no hay ningún acuerdo por escrito.'); }
  return h('ul', { class: 'portal__acuerdos' }, acuerdos.map(a => {
    const firmar = h('button', { class: 'btn btn--primary', type: 'button', onclick: intentar(async () => {
      const r = ok(await sb.rpc('firmar_acuerdo', { acuerdo: a.id }));
      decir(r === 'vigente' ? 'Acuerdo vigente.' : 'Firmado. Falta la otra parte.', 'ok');
      await recargar();
    }) }, admin ? 'Validar' : 'Aceptar');
    const yaFirmado = admin ? a.validado_por : a.aceptado_por;
    return h('li', {},
      h('strong', {}, `${nombres[a.partner_id] ? nombres[a.partner_id] + ' · ' : ''}Versión ${a.version} · ${ESTADO_ACUERDO[a.estado]}`),
      h('pre', { class: 'portal__condiciones' }, typeof a.condiciones?.texto === 'string' ? a.condiciones.texto : JSON.stringify(a.condiciones, null, 2)),
      h('p', { class: 'form__note' },
        `Aceptado por el partner: ${a.aceptado_en ? fecha(a.aceptado_en) : 'no'} · Validado por Events Penedès: ${a.validado_en ? fecha(a.validado_en) : 'no'}`),
      a.estado === 'propuesto' && !yaFirmado ? firmar : null,
      admin && a.estado === 'propuesto' ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: intentar(async () => {
        ok(await sb.rpc('rechazar_acuerdo', { acuerdo: a.id }));
        await recargar();
      }) }, 'Rechazar') : null);
  }));
}

function formAcuerdo(p, acuerdos, recargar) {
  const texto = h('textarea', { rows: 4, maxlength: 4000, required: true });
  return h('form', { class: 'form', onsubmit: intentar(async ev => {
    ev.preventDefault();
    const version = Math.max(0, ...acuerdos.filter(a => a.partner_id === p.id).map(a => a.version)) + 1;
    const { data: u } = await sb.auth.getUser();
    ok(await sb.from('acuerdos').insert({ partner_id: p.id, version, condiciones: { texto: texto.value.trim() }, propuesto_por: u.user.id }));
    decir('Propuesta enviada. Está vigente cuando la firman las dos partes.', 'ok');
    await recargar();
  }) },
  h('p', { class: 'field' }, h('label', {}, 'Proponer condiciones nuevas', texto)),
  h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Proponer')));
}

/* --- Administración ----------------------------------------------------------- */

async function panelAdmin(caja, partners) {
  caja.textContent = '';
  const recargar = () => panelAdmin(caja, partners.length ? partners : []).catch(e => decir(e.message, 'error'));
  const todos = await sb.from('partners').select('id,codigo,nombre,tipo,estado,zoho_account_id').order('nombre').then(ok);
  const nombres = Object.fromEntries(todos.map(p => [p.id, p.nombre]));
  const [cambios, acuerdos, importaciones, invitaciones] = await Promise.all([
    sb.from('cambios_ficha').select('*').eq('estado', 'pendiente').order('creado_en').then(ok),
    sb.from('acuerdos').select('*').eq('estado', 'propuesto').order('creado_en').then(ok),
    sb.from('importaciones').select('creado_en,ficha,metodo,modelo,tokens_entrada,tokens_salida,coste_usd,fuente')
      .gte('creado_en', new Date(Date.now() - 30 * 864e5).toISOString()).order('creado_en', { ascending: false }).then(ok),
    sb.from('invitaciones').select('partner_id,correo,aceptada_en').then(ok),
  ]);

  caja.append(h('h2', {}, 'Administración'));

  /* Cambios pendientes */
  caja.append(h('h3', {}, `Cambios pendientes (${cambios.length})`));
  for (const c of cambios) {
    const pub = await sb.from('fichas').select('datos').eq('partner_id', c.partner_id).maybeSingle().then(ok);
    const antes = pub?.datos || {};
    const claves = [...new Set([...Object.keys(antes), ...Object.keys(c.datos)])]
      .filter(k => JSON.stringify(antes[k] ?? null) !== JSON.stringify(c.datos[k] ?? null));
    const nota = h('input', { type: 'text', placeholder: 'Nota para el partner (opcional)' });
    const revisar = aprobar => intentar(async () => {
      ok(await sb.rpc('revisar_cambio', { cambio: c.id, aprobar, nota: nota.value.trim() || null }));
      decir(aprobar ? 'Aprobado y publicado.' : 'Rechazado.', 'ok');
      await recargar();
    });
    const fotosNuevas = (c.datos.imagenes || []).filter(r => !(antes.imagenes || []).includes(r));
    const miniaturas = h('ul', { class: 'portal__fotos' });
    for (const r of fotosNuevas) {
      const { data } = await sb.storage.from('fotos').createSignedUrl(r, 3600);
      if (data) { miniaturas.append(h('li', {}, h('img', { src: data.signedUrl, alt: '' }))); }
    }
    caja.append(h('div', { class: 'card portal__cambio' },
      h('p', {}, h('strong', {}, nombres[c.partner_id] || c.partner_id), ` · ${fecha(c.creado_en)} · ${claves.length} campo${claves.length === 1 ? '' : 's'}`),
      h('table', { class: 'portal__tabla' }, h('tbody', {}, claves.slice(0, 80).map(k => h('tr', {},
        h('th', {}, k), h('td', {}, String(antes[k] ?? '—')), h('td', {}, String(c.datos[k] ?? '—')))))),
      fotosNuevas.length ? h('p', {}, 'Fotos nuevas:') : null, fotosNuevas.length ? miniaturas : null,
      h('p', {}, nota),
      h('p', {}, h('button', { class: 'btn btn--primary', type: 'button', onclick: revisar(true) }, 'Aprobar y publicar'), ' ',
        h('button', { class: 'btn btn--ghost', type: 'button', onclick: revisar(false) }, 'Rechazar'))));
  }

  /* Acuerdos propuestos */
  caja.append(h('h3', {}, `Acuerdos por firmar (${acuerdos.length})`), listaAcuerdos(acuerdos, true, recargar, nombres));

  /* Partners e invitaciones */
  caja.append(h('h3', {}, `Partners (${todos.length})`));
  caja.append(h('table', { class: 'portal__tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Nombre'), h('th', {}, 'Código'), h('th', {}, 'Tipo'), h('th', {}, 'Estado'), h('th', {}, 'Invitados'), h('th', {}, ''))),
    h('tbody', {}, todos.map(p => {
      const correo = h('input', { type: 'email', placeholder: 'correo@…', 'aria-label': `Invitar a ${p.nombre}` });
      const acuerdo = h('textarea', { rows: 2, placeholder: 'Condiciones' });
      return h('tr', {},
        h('td', {}, h('a', { href: `/partners/${p.codigo}` }, p.nombre)), h('td', {}, h('code', {}, p.codigo)),
        h('td', {}, TIPOS[p.tipo]), h('td', {}, p.estado),
        h('td', {}, invitaciones.filter(i => i.partner_id === p.id).map(i => `${i.correo}${i.aceptada_en ? ' ✓' : ''}`).join(', ') || '—'),
        h('td', {},
          h('form', { onsubmit: intentar(async ev => {
            ev.preventDefault();
            ok(await sb.from('invitaciones').insert({ partner_id: p.id, correo: correo.value.trim().toLowerCase() }));
            decir(`Invitación apuntada. Mándale el enlace eventspenedes.com/acceso: al entrar con ${correo.value.trim()} queda dentro.`, 'ok');
            await recargar();
          }) }, correo, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Invitar')),
          h('form', { onsubmit: intentar(async ev => {
            ev.preventDefault();
            const { data: u } = await sb.auth.getUser();
            const version = Math.max(0, ...(await sb.from('acuerdos').select('version').eq('partner_id', p.id).then(ok)).map(a => a.version)) + 1;
            ok(await sb.from('acuerdos').insert({ partner_id: p.id, version, condiciones: { texto: acuerdo.value.trim() }, propuesto_por: u.user.id }));
            decir('Acuerdo propuesto: el partner lo ve y lo acepta desde su panel.', 'ok');
            await recargar();
          }) }, acuerdo, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Proponer acuerdo'))));
    }))));

  const codigo = h('input', { name: 'codigo', required: true, pattern: '[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?', placeholder: 'cal-soler' });
  const nombre = h('input', { name: 'nombre', required: true, placeholder: 'Cal Soler' });
  const tipo = h('select', { name: 'tipo' }, h('option', { value: 'localizacion' }, 'Espacio'), h('option', { value: 'proveedor' }, 'Proveedor'));
  const zoho = h('input', { name: 'zoho', placeholder: 'Id de la cuenta en Zoho (opcional)' });
  caja.append(h('form', { class: 'form portal__alta', onsubmit: intentar(async ev => {
    ev.preventDefault();
    ok(await sb.from('partners').insert({ codigo: codigo.value.trim(), nombre: nombre.value.trim(), tipo: tipo.value, zoho_account_id: zoho.value.trim() || null }));
    decir('Partner creado. Ahora invítale con su correo.', 'ok');
    await recargar();
  }) },
  h('p', { class: 'field' }, h('label', {}, 'Código del enlace', codigo)),
  h('p', { class: 'field' }, h('label', {}, 'Nombre', nombre)),
  h('p', { class: 'field' }, h('label', {}, 'Tipo', tipo)),
  h('p', { class: 'field' }, h('label', {}, 'Zoho', zoho)),
  h('p', {}, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Dar de alta'))));

  /* Lo que cuestan las importaciones */
  const total = importaciones.reduce((s, x) => s + Number(x.coste_usd || 0), 0);
  const conClaude = importaciones.filter(x => x.metodo === 'claude');
  caja.append(h('h3', {}, 'Importaciones de catálogos (30 días)'),
    h('p', {}, `${importaciones.length} importaciones, ${conClaude.length} con Claude. Coste: ${total.toFixed(2)} USD`
      + (conClaude.length ? `, ${(total / conClaude.length).toFixed(3)} USD de media por lectura con Claude.` : '.')),
    importaciones.length ? h('table', { class: 'portal__tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Cuándo'), h('th', {}, 'Ficha'), h('th', {}, 'Fuente'), h('th', {}, 'Tokens'), h('th', {}, 'USD'))),
      h('tbody', {}, importaciones.slice(0, 30).map(x => h('tr', {}, h('td', {}, fecha(x.creado_en)), h('td', {}, x.ficha),
        h('td', {}, x.fuente || '—'), h('td', {}, `${x.tokens_entrada} + ${x.tokens_salida}`), h('td', {}, Number(x.coste_usd).toFixed(4)))))) : null);
}

/* --- Arranque ------------------------------------------------------------------ */

sb.auth.getSession().then(({ data }) => pintar(data.session));
