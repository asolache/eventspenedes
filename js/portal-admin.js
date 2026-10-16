/* =============================================================================
   Events Penedès — la administración del portal de partners (/acceso)

   Arriba, lo que espera: reservas sin contestar o con respuesta por mirar,
   cambios de ficha y acuerdos por firmar. Debajo, todos los partners; cada uno
   abre su ficha completa: lo que hay en Zoho, quién entra, su ficha, su
   acuerdo con el historial, sus reservas, sus leads, cuánto se ve y toda la
   conversación, notas internas incluidas.
   ========================================================================== */
import { sb, datosActuales } from './portal-cliente.js';
import { app, tarjeta, kpis, chip, vistasExtra } from './portal-app.js';
import { planes, nombrePlan, tarjetasPlanes, asistenteDescripcion } from './portal-planes.js';
import { poner, h, fecha, fechaHora, euros, ok, intentar, decir, campo, boton, api, aZoho, vistaPrevia } from './portal-ui.js';
import { lineaDeTiempo, formComentario, tarjetaReserva, formReserva, historialAcuerdos, formAcuerdo, herramientas, ESTADO_RESERVA } from './portal-relacion.js';

const TIPOS = { localizacion: 'Espacio', proveedor: 'Actuación o servicio' };
const ESTADOS = { invitado: 'Invitado', activo: 'Activo', pausado: 'Pausado' };
const TONO_ESTADO = { invitado: 'aviso', activo: 'ok', pausado: 'error' };
const hace = dias => new Date(Date.now() - dias * 864e5).toISOString();

/* Las etiquetas de los campos de ficha, generadas de su esquema (js/campos.js).
   Se cargan solo aquí: el partner no las necesita. */
let etiquetas = null;
const cargarEtiquetas = async () => (etiquetas ||= await import('./campos.js'));
function campoLegible(tipo, k) {
  const c = etiquetas?.CAMPOS?.[tipo]?.[k];
  if (k === 'imagenes') { return h('span', { class: 'app-campo' }, h('strong', {}, 'Fotos'), h('code', {}, k)); }
  return h('span', { class: 'app-campo' }, h('strong', {}, c ? c[0] : k), c ? h('small', {}, c[1]) : null, h('code', {}, k));
}
function valorLegible(tipo, k, v) {
  if (v === undefined || v === null || v === '') { return '—'; }
  if (Array.isArray(v)) { return `${v.length} elemento${v.length === 1 ? '' : 's'}`; }
  const c = etiquetas?.CAMPOS?.[tipo]?.[k];
  if (!c) { return String(v); }
  const [, , t, op] = c;
  if (t === 'check' || t === 'sino') { return v === 'si' || v === true ? 'Sí' : v === 'no' ? 'No' : String(v); }
  if (t === 'select' && op !== undefined) { return etiquetas.OPCIONES[op]?.[v] || String(v); }
  if (t === 'eur') { return `${v} €`; }
  return String(v);
}

export async function panelAdmin(caja, detalle = null, opciones = {}) {
  const recargar = (p = detalle) => panelAdmin(caja, p, opciones).catch(e => decir(e.message, 'error'));
  const [todos, , datosPlanes] = await Promise.all([
    sb.from('partners').select('id,codigo,nombre,tipo,estado,plan,plan_desde,tester,zoho_account_id,creado_en').order('nombre').then(ok),
    cargarEtiquetas().catch(() => null),
    planes().catch(() => null),
  ]);
  if (detalle) {
    const p = todos.find(x => x.id === detalle.id);
    if (p) { caja.replaceChildren(await fichaCompleta(p, recargar, { ...opciones, datosPlanes })); return; }
  }
  const nombres = Object.fromEntries(todos.map(p => [p.id, p.nombre]));
  const [cambios, acuerdos, reservas, importaciones, invitaciones, sinZoho, usoIa] = await Promise.all([
    sb.from('cambios_ficha').select('*').eq('estado', 'pendiente').order('creado_en').then(ok),
    sb.from('acuerdos').select('*').eq('estado', 'propuesto').order('creado_en').then(ok),
    sb.from('reservas').select('*').neq('estado', 'cancelada').gte('fecha', new Date().toISOString().slice(0, 10)).order('fecha').then(ok),
    sb.from('importaciones').select('creado_en,ficha,metodo,modelo,tokens_entrada,tokens_salida,coste_usd,fuente')
      .gte('creado_en', hace(30)).order('creado_en', { ascending: false }).then(ok),
    sb.from('invitaciones').select('partner_id,correo,aceptada_en').then(ok),
    sb.from('mensajes').select('id', { count: 'exact', head: true }).is('zoho_nota_id', null),
    sb.from('uso_ia').select('creado_en,operacion,coste_usd,partner_id').gte('creado_en', hace(30)).order('creado_en', { ascending: false }).then(ok).catch(() => []),
  ]);
  const verPartner = id => recargar({ id });
  const enlacePartner = id => h('button', { class: 'btn-link', type: 'button', onclick: () => verPartner(id) }, nombres[id] || '—');

  /* Inicio */
  const esperan = reservas.filter(r => r.estado === 'solicitada');
  const mirar = reservas.filter(r => ['alternativa', 'rechazada'].includes(r.estado));
  const totalIa = usoIa.reduce((s, x) => s + Number(x.coste_usd || 0), 0) + importaciones.reduce((s, x) => s + Number(x.coste_usd || 0), 0);
  const inicio = [
    kpis([
      ['Respuestas de partners por mirar', mirar.length, null, mirar.length ? 'oro' : null],
      ['Reservas sin confirmar', esperan.length],
      ['Cambios de ficha', cambios.length, null, cambios.length ? 'oro' : null],
      ['Acuerdos por firmar', acuerdos.length],
      ['Partners activos', todos.filter(p => p.estado === 'activo').length, `de ${todos.length}`],
      ['IA, 30 días', `${totalIa.toFixed(2)}`, 'USD'],
    ]),
    sinZoho.count ? tarjeta('Pendiente de pasar a Zoho',
      h('p', { class: 'app-fila' }, `${sinZoho.count} paso${sinZoho.count === 1 ? '' : 's'} de la conversación aún no está${sinZoho.count === 1 ? '' : 'n'} en Zoho.`,
        boton('Pasarlos ahora', async () => {
          const r = await api('/api/portal/sincronizar', { method: 'POST', body: {} });
          decir(r.aviso || `${r.sincronizados.filter(x => !x.error).length} pasados a Zoho.`, r.aviso ? 'error' : 'ok');
          await recargar();
        }))) : null,
    tarjeta('Lo que espera'),
  ];
  /* «Lo que espera»: cada cosa lleva a su vista */
  const espera = inicio[2];
  const lista = [[mirar.length, 'respuestas de partners por mirar', 'reservas'], [cambios.length, 'cambios de ficha por revisar', 'cambios'],
    [acuerdos.length, 'acuerdos por firmar', 'acuerdos'], [esperan.length, 'reservas esperando al partner', 'reservas']].filter(([n]) => n);
  espera.replaceChildren(h('h3', {}, 'Lo que espera'), lista.length
    ? h('ul', { class: 'app-tareas' }, lista.map(([n, t, v]) => h('li', {}, h('span', {}, `${n} ${t}`),
      h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => raiz.ir(v) }, 'Ir'))))
    : h('p', {}, 'Nada pendiente.'));

  /* Reservas */
  const tablaReservas = (titulo, filas) => tarjeta(`${titulo} (${filas.length})`, filas.length ? h('div', { class: 'app-desliza' }, h('table', { class: 'app-tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Fecha'), h('th', {}, 'Partner'), h('th', {}, 'Qué'), h('th', {}, 'Estado'), h('th', {}, 'Desde'))),
    h('tbody', {}, filas.map(r => h('tr', {}, h('td', {}, fecha(r.fecha)), h('td', {}, enlacePartner(r.partner_id)),
      h('td', {}, r.titulo), h('td', {}, ESTADO_RESERVA[r.estado]), h('td', {}, fechaHora(r.actualizada_en)))))))
    : h('p', { class: 'app-nota' }, 'Nada.'));
  const vReservas = [tablaReservas('Respuestas por mirar', mirar), tablaReservas('Esperando al partner', esperan)];

  /* Cambios de ficha, con el nombre de cada campo */
  const vCambios = cambios.length
    ? await Promise.all(cambios.map(c => tarjetaCambio(c, nombres, todos.find(p => p.id === c.partner_id)?.tipo, recargar)))
    : [h('p', { class: 'app-vacio' }, 'Ningún cambio por revisar.')];

  /* Acuerdos */
  const vAcuerdos = acuerdos.length ? [h('ul', { class: 'app-tareas' }, acuerdos.map(a => h('li', {},
    h('span', {}, enlacePartner(a.partner_id), ` · versión ${a.version}${a.resumen ? ` · ${a.resumen}` : ''}`),
    chip(a.aceptado_en ? 'Aceptado por el partner' : 'Falta el partner', a.aceptado_en ? 'ok' : 'aviso'))))]
    : [h('p', { class: 'app-vacio' }, 'Ningún acuerdo por firmar.')];

  /* Partners */
  const vPartners = [
    h('div', { class: 'app-card app-desliza' }, h('table', { class: 'app-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Nombre'), h('th', {}, 'Tipo'), h('th', {}, 'Estado'), h('th', {}, 'Plan'), h('th', {}, 'Invitados'), h('th', {}, 'Zoho'))),
      h('tbody', {}, todos.map(p => h('tr', {},
        h('td', {}, enlacePartner(p.id), h('br', {}), h('code', {}, p.codigo)), h('td', {}, TIPOS[p.tipo] || p.tipo),
        h('td', {}, chip(ESTADOS[p.estado] || p.estado, TONO_ESTADO[p.estado])),
        h('td', {}, datosPlanes ? nombrePlan(datosPlanes, p.plan || 'ficha') : p.plan, p.tester ? ' · tester' : ''),
        h('td', {}, invitaciones.filter(i => i.partner_id === p.id).map(i => `${i.correo}${i.aceptada_en ? ' ✓' : ''}`).join(', ') || '—'),
        h('td', {}, p.zoho_account_id ? '✓' : '—')))))),
    h('details', { class: 'app-card' }, h('summary', {}, 'Dar de alta un partner'), formAlta(recargar)),
  ];

  /* Planes del canal */
  const testers = todos.filter(p => p.tester).length;
  const vPlanes = datosPlanes ? [
    h('p', { class: 'app-nota' }, `Salen de data/planes.json. Testers: ${testers} de ${datosPlanes.oferta_testers?.plazas ?? '—'}. `
      + (datosPlanes.oferta_testers?.precio_mes === null ? 'Falta fijar el precio de la oferta de lanzamiento.' : '')),
    tarjetasPlanes(datosPlanes),
    tarjeta('Plan de cada partner', h('div', { class: 'app-desliza' }, h('table', { class: 'app-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Partner'), h('th', {}, 'Plan'), h('th', {}, 'Tester'), h('th', {}, 'Desde'))),
      h('tbody', {}, todos.map(p => {
        const sel = h('select', { 'aria-label': `Plan de ${p.nombre}` }, datosPlanes.planes.map(pl => h('option', { value: pl.id, selected: (p.plan || 'ficha') === pl.id ? true : null }, pl.nombre)));
        const tester = h('input', { type: 'checkbox', 'aria-label': `${p.nombre} es tester`, checked: p.tester ? true : null });
        const guardar = intentar(async () => {
          const cambio = { plan: sel.value, tester: tester.checked };
          if (sel.value !== (p.plan || 'ficha')) { cambio.plan_desde = new Date().toISOString().slice(0, 10); }
          ok(await sb.from('partners').update(cambio).eq('id', p.id));
          decir(`Plan de ${p.nombre}: ${nombrePlan(datosPlanes, sel.value)}${tester.checked ? ', tester' : ''}.`, 'ok');
          await recargar();
        });
        sel.addEventListener('change', guardar);
        tester.addEventListener('change', guardar);
        return h('tr', {}, h('td', {}, enlacePartner(p.id)), h('td', {}, sel), h('td', {}, tester), h('td', {}, p.plan_desde ? fecha(p.plan_desde) : '—'));
      }))))),
  ] : [h('p', { class: 'app-vacio' }, 'No se han podido leer los planes.')];

  /* IA y su coste */
  const conClaude = importaciones.filter(x => x.metodo === 'claude');
  const totalImp = importaciones.reduce((s, x) => s + Number(x.coste_usd || 0), 0);
  const porOperacion = {};
  for (const x of usoIa) { const o = (porOperacion[x.operacion] ||= { n: 0, usd: 0 }); o.n++; o.usd += Number(x.coste_usd || 0); }
  const vIa = [
    kpis([
      ['Importaciones de catálogos', importaciones.length, `${conClaude.length} con Claude`],
      ['Coste de importar', totalImp.toFixed(2), 'USD'],
      ['Otras llamadas a la IA', usoIa.length],
      ['Coste total, 30 días', totalIa.toFixed(2), 'USD', 'oro'],
    ]),
    usoIa.length ? tarjeta('Por operación', h('table', { class: 'app-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Operación'), h('th', {}, 'Veces'), h('th', {}, 'USD'))),
      h('tbody', {}, Object.entries(porOperacion).map(([o, x]) => h('tr', {}, h('td', {}, o), h('td', {}, String(x.n)), h('td', {}, x.usd.toFixed(4))))))) : null,
    importaciones.length ? tarjeta('Últimas importaciones', h('div', { class: 'app-desliza' }, h('table', { class: 'app-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Cuándo'), h('th', {}, 'Ficha'), h('th', {}, 'Fuente'), h('th', {}, 'Tokens'), h('th', {}, 'USD'))),
      h('tbody', {}, importaciones.slice(0, 30).map(x => h('tr', {}, h('td', {}, fecha(x.creado_en)), h('td', {}, x.ficha),
        h('td', {}, x.fuente || '—'), h('td', {}, `${x.tokens_entrada} + ${x.tokens_salida}`), h('td', {}, Number(x.coste_usd).toFixed(4)))))))) : null,
  ];

  const extra = await vistasExtra('admin', { sb, recargar, irAPartner: verPartner });
  const raiz = app({
    clave: 'admin', titulo: 'Administración', subtitulo: opciones.sesion?.user?.email || '',
    acciones: [opciones.salir],
    vistas: [
      { id: 'inicio', titulo: 'Inicio', icono: 'inicio', nodos: inicio },
      { id: 'reservas', titulo: 'Reservas', icono: 'reservas', n: mirar.length, nodos: vReservas },
      { id: 'cambios', titulo: 'Cambios de ficha', corto: 'Cambios', icono: 'cambios', n: cambios.length,
        intro: 'Cada campo con su nombre y su sección; debajo, su nombre en el sistema.', nodos: vCambios },
      { id: 'acuerdos', titulo: 'Acuerdos por firmar', corto: 'Acuerdos', icono: 'acuerdo', n: acuerdos.length, nodos: vAcuerdos },
      { id: 'partners', titulo: `Partners (${todos.length})`, corto: 'Partners', icono: 'partners', nodos: vPartners },
      ...extra,
      { id: 'planes', titulo: 'Planes del canal', corto: 'Planes', icono: 'plan', nodos: vPlanes },
      { id: 'ia', titulo: 'IA y su coste', corto: 'IA', icono: 'uso', intro: 'Lo que cuesta cada uso de Claude en los últimos 30 días.', nodos: vIa },
    ],
  });
  caja.replaceChildren(raiz);
}

async function tarjetaCambio(c, nombres, tipo, recargar) {
  await cargarEtiquetas().catch(() => null);
  const pub = await sb.from('fichas').select('datos').eq('partner_id', c.partner_id).maybeSingle().then(ok);
  const antes = pub?.datos || {};
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(c.datos)])]
    .filter(k => JSON.stringify(antes[k] ?? null) !== JSON.stringify(c.datos[k] ?? null));
  const nota = h('input', { type: 'text', placeholder: 'Nota para el partner (opcional)' });
  const revisar = aprobar => async () => {
    ok(await sb.rpc('revisar_cambio', { cambio: c.id, aprobar, nota: nota.value.trim() || null }));
    await aZoho();
    decir(aprobar ? 'Aprobado y publicado.' : 'Rechazado.', 'ok');
    await recargar();
  };
  const fotosNuevas = (c.datos.imagenes || []).filter(r => !(antes.imagenes || []).includes(r));
  const miniaturas = h('ul', { class: 'portal__fotos' });
  for (const r of fotosNuevas) {
    const { data } = await sb.storage.from('fotos').createSignedUrl(r, 3600);
    if (data) { miniaturas.append(h('li', {}, h('img', { src: data.signedUrl, alt: '' }))); }
  }
  return h('div', { class: 'app-card portal__cambio' },
    h('p', { class: 'app-fila' }, h('strong', {}, nombres[c.partner_id] || c.partner_id), chip(`${claves.length} campo${claves.length === 1 ? '' : 's'}`), h('span', { class: 'app-nota' }, fecha(c.creado_en))),
    h('div', { class: 'app-desliza' }, h('table', { class: 'app-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Campo'), h('th', {}, 'Antes'), h('th', {}, 'Ahora'))),
      h('tbody', {}, claves.slice(0, 80).map(k => h('tr', {},
        h('th', { scope: 'row' }, campoLegible(tipo, k)),
        h('td', { class: 'app-antes' }, valorLegible(tipo, k, antes[k])),
        h('td', { class: 'app-ahora' }, valorLegible(tipo, k, c.datos[k]))))))),
    fotosNuevas.length ? h('p', {}, 'Fotos nuevas:') : null, fotosNuevas.length ? miniaturas : null,
    h('p', {}, nota),
    h('p', { class: 'portal__botones' }, boton('Aprobar y publicar', revisar(true), 'primary'), boton('Rechazar', revisar(false))));
}

function formAlta(recargar) {
  const codigo = h('input', { name: 'codigo', required: true, pattern: '[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?', placeholder: 'cal-soler' });
  const nombre = h('input', { name: 'nombre', required: true, placeholder: 'Cal Soler' });
  const tipo = h('select', { name: 'tipo' }, h('option', { value: 'localizacion' }, 'Espacio'), h('option', { value: 'proveedor' }, 'Actuación o servicio'));
  const zoho = h('input', { name: 'zoho', inputmode: 'numeric', placeholder: 'Id de la cuenta en Zoho (opcional)' });
  return h('form', { class: 'form portal__alta', onsubmit: intentar(async ev => {
    ev.preventDefault();
    const p = ok(await sb.from('partners').insert({ codigo: codigo.value.trim(), nombre: nombre.value.trim(), tipo: tipo.value, zoho_account_id: zoho.value.trim() || null }).select('id').single());
    decir('Partner creado. Ahora invítale con su correo.', 'ok');
    await recargar({ id: p.id });
  }) },
  campo('Código del enlace', codigo), campo('Nombre', nombre), campo('Tipo', tipo), campo('Cuenta en Zoho', zoho),
  h('p', {}, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Dar de alta')));
}

/* --- La ficha completa de un partner, como app ------------------------------- */

async function fichaCompleta(p, recargar, { sesion, salir, datosPlanes }) {
  const yoMismo = () => recargar(p);
  const [ficha, cambios, acuerdos, reservas, leads, impresiones, mensajes, miembros, invitaciones, admins, { data: u }, actual] = await Promise.all([
    sb.from('fichas').select('datos,version,actualizada_en').eq('partner_id', p.id).maybeSingle().then(ok),
    sb.from('cambios_ficha').select('id,estado,creado_en,revisado_en,nota_revision').eq('partner_id', p.id).order('creado_en', { ascending: false }).limit(30).then(ok),
    sb.from('acuerdos').select('*').eq('partner_id', p.id).order('version', { ascending: false }).then(ok),
    sb.from('reservas').select('*').eq('partner_id', p.id).order('fecha', { ascending: false }).then(ok),
    sb.from('leads').select('*').eq('partner_id', p.id).order('creado_en', { ascending: false }).limit(100).then(ok),
    sb.from('impresiones').select('dia,vistas,clics').eq('partner_id', p.id).gte('dia', hace(90).slice(0, 10)).then(ok),
    sb.from('mensajes').select('*').eq('partner_id', p.id).order('creado_en').limit(500).then(ok),
    sb.rpc('miembros_de', { p: p.id }).then(ok),
    sb.from('invitaciones').select('*').eq('partner_id', p.id).then(ok),
    sb.from('admins').select('user_id').then(ok),
    sb.auth.getUser(),
    datosActuales(p.id),
  ]);
  const yo = u.user.id;
  const nombres = { ...Object.fromEntries(miembros.map(m => [m.user_id, m.correo])), ...Object.fromEntries(admins.map(a => [a.user_id, 'Events Penedès'])) };
  const ctx = { admin: true, partner: p, acuerdos, mensajes, recargar: yoMismo, yo, nombres, partnerId: p.id };
  const suma = (dias, k) => impresiones.filter(x => x.dia >= hace(dias).slice(0, 10)).reduce((s, x) => s + x[k], 0);
  const vigente = acuerdos.find(a => a.estado === 'vigente');
  const porEstado = e => reservas.filter(r => r.estado === e).length;
  const datos = actual.pendiente || actual.publicada || {};

  /* Resumen: cifras, estado, plan y Zoho */
  const estado = h('select', {}, Object.entries(ESTADOS).map(([k, v]) => h('option', { value: k, selected: p.estado === k ? true : null }, v)));
  const zohoId = h('input', { inputmode: 'numeric', value: p.zoho_account_id || '', placeholder: 'Id de la cuenta' });
  const zoho = h('div', { class: 'portal__zoho' }, h('p', { class: 'form__note' }, 'Cargando…'));
  cargarZoho(zoho, p, zohoId);
  const resumen = [
    kpis([
      ['Visitas 30 / 90 días', `${suma(30, 'vistas')} / ${suma(90, 'vistas')}`],
      ['Clics 30 / 90 días', `${suma(30, 'clics')} / ${suma(90, 'clics')}`],
      ['Leads que nos ha traído', leads.length],
      ['Reservas confirmadas', porEstado('confirmada'), `${porEstado('solicitada') + porEstado('alternativa')} por confirmar`],
      ['Acuerdo', vigente ? `v${vigente.version}` : '—'],
      ['Plan', datosPlanes ? nombrePlan(datosPlanes, p.plan || 'ficha') : (p.plan || 'ficha'), p.tester ? 'tester' : null, 'oro'],
    ]),
    h('div', { class: 'app-rejilla' },
      tarjeta('Estado y Zoho', h('form', { class: 'form portal__rejilla', onsubmit: intentar(async ev => {
        ev.preventDefault();
        ok(await sb.from('partners').update({ estado: estado.value, zoho_account_id: zohoId.value.trim() || null }).eq('id', p.id));
        decir('Guardado.', 'ok');
        await yoMismo();
      }) }, campo('Estado', estado, 'Pausado: su página deja de verse.'), campo('Cuenta en Zoho', zohoId),
      h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Guardar')))),
      tarjeta('Lo que tiene con nosotros', herramientas({ partner: p, ficha, acuerdos, reservas: reservas.length, leads: leads.length, vistas: suma(30, 'vistas') }))),
  ];

  /* Ficha: lo publicado, lo pendiente con el nombre de cada campo, y la IA */
  const pendientes = await sb.from('cambios_ficha').select('*').eq('partner_id', p.id).eq('estado', 'pendiente').then(ok);
  const vFicha = [
    tarjeta(null,
      h('p', { class: 'app-fila' },
        ficha ? chip(`Publicada · versión ${ficha.version} · ${fecha(ficha.actualizada_en)}`, 'ok') : chip('Sin ficha aprobada', 'aviso'),
        chip(ficha?.datos?.autoriza === 'si' ? 'Web autorizada' : 'Web sin autorizar', ficha?.datos?.autoriza === 'si' ? 'ok' : null)),
      h('p', { class: 'app-fila' }, h('a', { class: 'btn btn--ghost', href: `/partners/${p.codigo}` }, 'Su página'),
        boton('Vista previa', () => vistaPrevia(p.codigo)))),
    ...(await Promise.all(pendientes.map(c => tarjetaCambio(c, { [p.id]: p.nombre }, p.tipo, yoMismo)))),
    (actual.pendiente || actual.publicada) ? asistenteDescripcion(p, datos, { recargar: yoMismo, admin: true }) : null,
    cambios.length ? tarjeta('Historial de cambios', h('div', { class: 'app-desliza' }, h('table', { class: 'app-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Propuesto'), h('th', {}, 'Estado'), h('th', {}, 'Revisado'), h('th', {}, 'Nota'))),
      h('tbody', {}, cambios.map(c => h('tr', {}, h('td', {}, fecha(c.creado_en)), h('td', {}, c.estado), h('td', {}, fecha(c.revisado_en)), h('td', {}, c.nota_revision || '—'))))))) : null,
  ];

  /* Equipo */
  const correo = h('input', { type: 'email', required: true, placeholder: 'correo@…' });
  const vEquipo = [
    miembros.length ? h('div', { class: 'app-card app-desliza' }, h('table', { class: 'app-tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Correo'), h('th', {}, 'Rol'), h('th', {}, 'Desde'), h('th', {}, 'Último acceso'))),
      h('tbody', {}, miembros.map(m => h('tr', {}, h('td', {}, m.correo), h('td', {}, m.rol), h('td', {}, fecha(m.desde)), h('td', {}, fechaHora(m.ultimo_acceso)))))))
      : h('p', { class: 'app-vacio' }, 'Nadie ha entrado aún.'),
    invitaciones.filter(i => !i.aceptada_en).length ? h('p', { class: 'app-nota' }, `Invitados sin entrar: ${invitaciones.filter(i => !i.aceptada_en).map(i => i.correo).join(', ')}`) : null,
    tarjeta('Invitar a alguien', h('form', { class: 'form portal__rejilla', onsubmit: intentar(async ev => {
      ev.preventDefault();
      ok(await sb.from('invitaciones').insert({ partner_id: p.id, correo: correo.value.trim().toLowerCase() }));
      decir(`Invitación apuntada. Mándale el enlace eventspenedes.com/acceso: al entrar con ${correo.value.trim()} queda dentro.`, 'ok');
      await yoMismo();
    }) }, campo('Correo', correo), h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Invitar')))),
  ];

  const vLeads = [leads.length ? h('div', { class: 'app-card app-desliza' }, h('table', { class: 'app-tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Llegó'), h('th', {}, 'Evento'), h('th', {}, 'Personas'), h('th', {}, 'Fecha'), h('th', {}, 'Zoho'))),
    h('tbody', {}, leads.map(l => h('tr', {}, h('td', {}, fecha(l.creado_en)), h('td', {}, l.tipo_evento || '—'), h('td', {}, l.personas ?? '—'),
      h('td', {}, fecha(l.fecha_evento)), h('td', {}, l.zoho_id ? `${l.zoho_modulo} ${l.zoho_id}` : '—'))))))
    : h('p', { class: 'app-vacio' }, 'Ninguno.')];

  const extra = await vistasExtra('admin-partner', { partner: p, sb, recargar: yoMismo });
  return app({
    clave: `admin-${p.codigo}`, titulo: p.nombre,
    subtitulo: `${TIPOS[p.tipo] || p.tipo} · ${ESTADOS[p.estado] || p.estado} · código ${p.codigo} · desde el ${fecha(p.creado_en)}`,
    marca: 'Administración',
    acciones: [boton('← Todos', () => recargar(null)), salir],
    vistas: [
      { id: 'resumen', titulo: 'Resumen', icono: 'inicio', nodos: resumen },
      { id: 'zoho', titulo: 'En Zoho', corto: 'Zoho', icono: 'partners', nodos: [h('div', { class: 'app-card' }, zoho)] },
      { id: 'ficha', titulo: 'Ficha, cambios e IA', corto: 'Ficha', icono: 'ficha', n: pendientes.length, nodos: vFicha },
      { id: 'reservas', titulo: `Reservas (${reservas.length})`, corto: 'Reservas', icono: 'reservas', nodos: [
        h('details', { class: 'app-card' }, h('summary', {}, 'Pedir una reserva'), formReserva({ partner: p, acuerdos, recargar: yoMismo })),
        reservas.length ? h('div', { class: 'portal__reservas' }, reservas.map(r => tarjetaReserva(r, ctx))) : h('p', { class: 'app-vacio' }, 'Ninguna todavía.')] },
      { id: 'acuerdo', titulo: 'Acuerdo y versiones', corto: 'Acuerdo', icono: 'acuerdo', nodos: [historialAcuerdos(acuerdos, ctx),
        h('details', { class: 'app-card' }, h('summary', {}, vigente ? 'Proponer una versión nueva' : 'Proponer el primer acuerdo'),
          formAcuerdo({ partnerId: p.id, acuerdos, recargar: yoMismo, admin: true }))] },
      { id: 'equipo', titulo: 'Quién entra', corto: 'Equipo', icono: 'clientes', nodos: vEquipo },
      { id: 'leads', titulo: `Leads (${leads.length})`, corto: 'Leads', icono: 'flujo', nodos: vLeads },
      ...extra,
      { id: 'conversacion', titulo: 'Conversación y notas', corto: 'Mensajes', icono: 'conversacion', nodos: [
        tarjeta(null, formComentario({ partnerId: p.id, admin: true, recargar: yoMismo, etiqueta: 'Escribir al partner o dejar una nota interna' })),
        lineaDeTiempo([...mensajes].reverse(), ctx)] },
    ],
  });
}

async function cargarZoho(cont, p, zohoId) {
  const pintar = (...n) => { cont.textContent = ''; poner(cont, ...n); };
  const buscador = () => {
    const q = h('input', { value: p.nombre, 'aria-label': 'Buscar en Zoho' });
    const res = h('ul', { class: 'portal__lista' });
    return h('div', {}, h('p', {}, 'Este partner no está unido a su cuenta de Zoho. Búscala:'),
      h('p', { class: 'portal__botones' }, q, boton('Buscar', async () => {
        const { cuentas } = await api(`/api/portal/zoho?buscar=${encodeURIComponent(q.value.trim())}`);
        res.textContent = '';
        res.append(...(cuentas.length ? cuentas.map(c => h('li', {}, `${c.nombre}${c.poblacion ? ` · ${c.poblacion}` : ''} `,
          boton('Usar esta', async () => { zohoId.value = c.id; decir('Pulsa «Guardar» arriba para unirla.', 'info'); }))) : [h('li', {}, 'Ninguna.')]));
      })), res);
  };
  if (!p.zoho_account_id) { pintar(buscador()); return; }
  try {
    const { cuenta } = await api(`/api/portal/zoho?partner=${p.id}`);
    if (!cuenta) { pintar(h('p', {}, 'No encuentro esa cuenta en Zoho.'), buscador()); return; }
    pintar(
      h('p', {}, h('a', { href: cuenta.enlace, target: '_blank', rel: 'noopener' }, cuenta.nombre), ' · ',
        [cuenta.tipo, cuenta.poblacion, cuenta.responsable && `responsable: ${cuenta.responsable}`].filter(Boolean).join(' · ')),
      cuenta.etiquetas.length ? h('p', { class: 'form__note' }, `Etiquetas: ${cuenta.etiquetas.join(', ')}`) : null,
      h('p', { class: 'form__note' }, [cuenta.telefono, cuenta.web].filter(Boolean).join(' · ')),
      h('h4', {}, `Tratos (${cuenta.tratos.length})`),
      cuenta.tratos.length ? h('table', { class: 'portal__tabla' }, h('tbody', {}, cuenta.tratos.map(t => h('tr', {},
        h('td', {}, h('a', { href: t.enlace, target: '_blank', rel: 'noopener' }, t.nombre)), h('td', {}, t.etapa || '—'), h('td', {}, fecha(t.cierre)), h('td', {}, euros(t.importe)),
        h('td', {}, h('code', {}, t.id)))))) : h('p', { class: 'form__note' }, 'Ninguno.'),
      h('h4', {}, `Tareas abiertas (${cuenta.tareas.length})`),
      cuenta.tareas.length ? h('ul', { class: 'portal__lista' }, cuenta.tareas.map(t => h('li', {}, `${t.asunto} · ${fecha(t.vence)} · ${t.estado || ''}`))) : h('p', { class: 'form__note' }, 'Ninguna.'),
      h('h4', {}, 'Últimas notas'),
      cuenta.notas.length ? h('ul', { class: 'portal__lista' }, cuenta.notas.map(n => h('li', {}, h('strong', {}, n.titulo || 'Nota'), ` · ${fecha(n.creada)}`, h('br', {}), n.texto))) : h('p', { class: 'form__note' }, 'Ninguna.'),
      cuenta.avisos.length ? h('p', { class: 'form__note' }, `Zoho no dio todo: ${cuenta.avisos.join(' · ')}`) : null);
  } catch (e) {
    pintar(h('p', { class: 'form__note' }, `Zoho no responde ahora (${e.message}). Lo del portal está todo abajo.`));
  }
}
