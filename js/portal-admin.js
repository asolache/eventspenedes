/* =============================================================================
   Events Penedès — la administración del portal de partners (/acceso)

   Arriba, lo que espera: reservas sin contestar o con respuesta por mirar,
   cambios de ficha y acuerdos por firmar. Debajo, todos los partners; cada uno
   abre su ficha completa: lo que hay en Zoho, quién entra, su ficha, su
   acuerdo con el historial, sus reservas, sus leads, cuánto se ve y toda la
   conversación, notas internas incluidas.
   ========================================================================== */
import { sb } from './portal-cliente.js';
import { poner, h, fecha, fechaHora, euros, ok, intentar, decir, campo, boton, api, aZoho, vistaPrevia } from './portal-ui.js';
import { lineaDeTiempo, formComentario, tarjetaReserva, formReserva, historialAcuerdos, formAcuerdo, herramientas, ESTADO_RESERVA } from './portal-relacion.js';

const TIPOS = { localizacion: 'Espacio', proveedor: 'Proveedor' };
const ESTADOS = { invitado: 'Invitado', activo: 'Activo', pausado: 'Pausado' };
const hace = dias => new Date(Date.now() - dias * 864e5).toISOString();

export async function panelAdmin(caja, detalle = null) {
  caja.textContent = '';
  const recargar = (p = detalle) => panelAdmin(caja, p).catch(e => decir(e.message, 'error'));
  const todos = await sb.from('partners').select('id,codigo,nombre,tipo,estado,zoho_account_id,creado_en').order('nombre').then(ok);
  if (detalle) {
    const p = todos.find(x => x.id === detalle.id);
    if (p) { return fichaCompleta(caja, p, recargar); }
  }
  const nombres = Object.fromEntries(todos.map(p => [p.id, p.nombre]));
  const [cambios, acuerdos, reservas, importaciones, invitaciones, sinZoho] = await Promise.all([
    sb.from('cambios_ficha').select('*').eq('estado', 'pendiente').order('creado_en').then(ok),
    sb.from('acuerdos').select('*').eq('estado', 'propuesto').order('creado_en').then(ok),
    sb.from('reservas').select('*').neq('estado', 'cancelada').gte('fecha', new Date().toISOString().slice(0, 10)).order('fecha').then(ok),
    sb.from('importaciones').select('creado_en,ficha,metodo,modelo,tokens_entrada,tokens_salida,coste_usd,fuente')
      .gte('creado_en', hace(30)).order('creado_en', { ascending: false }).then(ok),
    sb.from('invitaciones').select('partner_id,correo,aceptada_en').then(ok),
    sb.from('mensajes').select('id', { count: 'exact', head: true }).is('zoho_nota_id', null),
  ]);

  poner(caja, h('h2', {}, 'Administración'));

  /* Lo que espera */
  const esperan = reservas.filter(r => r.estado === 'solicitada');
  const mirar = reservas.filter(r => ['alternativa', 'rechazada'].includes(r.estado));
  poner(caja, h('dl', { class: 'portal__cifras' },
    h('div', {}, h('dt', {}, 'Respuestas de partners por mirar'), h('dd', {}, String(mirar.length))),
    h('div', {}, h('dt', {}, 'Reservas sin confirmar'), h('dd', {}, String(esperan.length))),
    h('div', {}, h('dt', {}, 'Cambios de ficha'), h('dd', {}, String(cambios.length))),
    h('div', {}, h('dt', {}, 'Acuerdos por firmar'), h('dd', {}, String(acuerdos.length)))));

  if (sinZoho.count) {
    poner(caja, h('p', { class: 'form__note' }, `${sinZoho.count} paso${sinZoho.count === 1 ? '' : 's'} de la conversación aún no está${sinZoho.count === 1 ? '' : 'n'} en Zoho. `,
      boton('Pasarlos ahora', async () => {
        const r = await api('/api/portal/sincronizar', { method: 'POST', body: {} });
        decir(r.aviso || `${r.sincronizados.filter(x => !x.error).length} pasados a Zoho.`, r.aviso ? 'error' : 'ok');
        await recargar();
      })));
  }

  const listaReservas = (titulo, lista) => {
    poner(caja, h('h3', {}, `${titulo} (${lista.length})`));
    poner(caja, lista.length ? h('table', { class: 'portal__tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Fecha'), h('th', {}, 'Partner'), h('th', {}, 'Qué'), h('th', {}, 'Estado'), h('th', {}, 'Desde'))),
      h('tbody', {}, lista.map(r => h('tr', {}, h('td', {}, fecha(r.fecha)),
        h('td', {}, h('button', { class: 'btn-link', type: 'button', onclick: () => recargar({ id: r.partner_id }) }, nombres[r.partner_id] || '—')),
        h('td', {}, r.titulo), h('td', {}, ESTADO_RESERVA[r.estado]), h('td', {}, fechaHora(r.actualizada_en))))))
      : h('p', { class: 'form__note' }, 'Nada.'));
  };
  listaReservas('Respuestas por mirar', mirar);
  listaReservas('Reservas esperando al partner', esperan);

  /* Cambios pendientes */
  poner(caja, h('h3', {}, `Cambios de ficha pendientes (${cambios.length})`));
  for (const c of cambios) { poner(caja, await tarjetaCambio(c, nombres, recargar)); }

  /* Acuerdos propuestos */
  poner(caja, h('h3', {}, `Acuerdos por firmar (${acuerdos.length})`));
  for (const a of acuerdos) {
    poner(caja, h('p', {}, h('button', { class: 'btn-link', type: 'button', onclick: () => recargar({ id: a.partner_id }) }, nombres[a.partner_id]),
      ` · versión ${a.version}${a.resumen ? ` · ${a.resumen}` : ''} · ${a.aceptado_en ? 'ya aceptado por el partner' : 'falta el partner'}`));
  }

  /* Partners */
  poner(caja, h('h3', {}, `Partners (${todos.length})`));
  poner(caja, h('table', { class: 'portal__tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Nombre'), h('th', {}, 'Código'), h('th', {}, 'Tipo'), h('th', {}, 'Estado'), h('th', {}, 'Invitados'), h('th', {}, 'Zoho'))),
    h('tbody', {}, todos.map(p => h('tr', {},
      h('td', {}, h('button', { class: 'btn-link', type: 'button', onclick: () => recargar({ id: p.id }) }, p.nombre)),
      h('td', {}, h('code', {}, p.codigo)), h('td', {}, TIPOS[p.tipo]), h('td', {}, ESTADOS[p.estado] || p.estado),
      h('td', {}, invitaciones.filter(i => i.partner_id === p.id).map(i => `${i.correo}${i.aceptada_en ? ' ✓' : ''}`).join(', ') || '—'),
      h('td', {}, p.zoho_account_id ? '✓' : '—'))))));
  poner(caja, h('details', {}, h('summary', {}, 'Dar de alta un partner'), formAlta(recargar)));

  /* Lo que cuestan las importaciones */
  const total = importaciones.reduce((s, x) => s + Number(x.coste_usd || 0), 0);
  const conClaude = importaciones.filter(x => x.metodo === 'claude');
  poner(caja, h('h3', {}, 'Importaciones de catálogos (30 días)'),
    h('p', {}, `${importaciones.length} importaciones, ${conClaude.length} con Claude. Coste: ${total.toFixed(2)} USD`
      + (conClaude.length ? `, ${(total / conClaude.length).toFixed(3)} USD de media por lectura con Claude.` : '.')),
    importaciones.length ? h('table', { class: 'portal__tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Cuándo'), h('th', {}, 'Ficha'), h('th', {}, 'Fuente'), h('th', {}, 'Tokens'), h('th', {}, 'USD'))),
      h('tbody', {}, importaciones.slice(0, 30).map(x => h('tr', {}, h('td', {}, fecha(x.creado_en)), h('td', {}, x.ficha),
        h('td', {}, x.fuente || '—'), h('td', {}, `${x.tokens_entrada} + ${x.tokens_salida}`), h('td', {}, Number(x.coste_usd).toFixed(4)))))) : null);
}

async function tarjetaCambio(c, nombres, recargar) {
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
  return h('div', { class: 'card portal__cambio' },
    h('p', {}, h('strong', {}, nombres[c.partner_id] || c.partner_id), ` · ${fecha(c.creado_en)} · ${claves.length} campo${claves.length === 1 ? '' : 's'}`),
    h('table', { class: 'portal__tabla' }, h('tbody', {}, claves.slice(0, 80).map(k => h('tr', {},
      h('th', {}, k), h('td', {}, String(antes[k] ?? '—')), h('td', {}, String(c.datos[k] ?? '—')))))),
    fotosNuevas.length ? h('p', {}, 'Fotos nuevas:') : null, fotosNuevas.length ? miniaturas : null,
    h('p', {}, nota),
    h('p', { class: 'portal__botones' }, boton('Aprobar y publicar', revisar(true), 'primary'), boton('Rechazar', revisar(false))));
}

function formAlta(recargar) {
  const codigo = h('input', { name: 'codigo', required: true, pattern: '[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?', placeholder: 'cal-soler' });
  const nombre = h('input', { name: 'nombre', required: true, placeholder: 'Cal Soler' });
  const tipo = h('select', { name: 'tipo' }, h('option', { value: 'localizacion' }, 'Espacio'), h('option', { value: 'proveedor' }, 'Proveedor'));
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

/* --- La ficha completa de un partner ------------------------------------------- */

async function fichaCompleta(caja, p, recargar) {
  const yoMismo = () => recargar(p);
  const [ficha, cambios, acuerdos, reservas, leads, impresiones, mensajes, miembros, invitaciones, admins, { data: u }] = await Promise.all([
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
  ]);
  const yo = u.user.id;
  const nombres = { ...Object.fromEntries(miembros.map(m => [m.user_id, m.correo])), ...Object.fromEntries(admins.map(a => [a.user_id, 'Events Penedès'])) };
  const ctx = { admin: true, partner: p, acuerdos, mensajes, recargar: yoMismo, yo, nombres, partnerId: p.id };
  const suma = (dias, k) => impresiones.filter(x => x.dia >= hace(dias).slice(0, 10)).reduce((s, x) => s + x[k], 0);
  const vigente = acuerdos.find(a => a.estado === 'vigente');
  const porEstado = e => reservas.filter(r => r.estado === e).length;

  poner(caja, 
    h('p', {}, boton('← Todos los partners', () => recargar(null))),
    h('h2', {}, p.nombre),
    h('p', { class: 'eyebrow' }, `${TIPOS[p.tipo]} · ${ESTADOS[p.estado] || p.estado} · código ${p.codigo} · desde el ${fecha(p.creado_en)}`),
    h('dl', { class: 'portal__cifras' },
      h('div', {}, h('dt', {}, 'Visitas 30 / 90 días'), h('dd', {}, `${suma(30, 'vistas')} / ${suma(90, 'vistas')}`)),
      h('div', {}, h('dt', {}, 'Clics 30 / 90 días'), h('dd', {}, `${suma(30, 'clics')} / ${suma(90, 'clics')}`)),
      h('div', {}, h('dt', {}, 'Leads que nos ha traído'), h('dd', {}, String(leads.length))),
      h('div', {}, h('dt', {}, 'Reservas confirmadas / por confirmar'), h('dd', {}, `${porEstado('confirmada')} / ${porEstado('solicitada') + porEstado('alternativa')}`)),
      h('div', {}, h('dt', {}, 'Acuerdo'), h('dd', {}, vigente ? `v${vigente.version}` : '—'))));

  /* Estado y Zoho */
  const estado = h('select', {}, Object.entries(ESTADOS).map(([k, v]) => h('option', { value: k, selected: p.estado === k ? true : null }, v)));
  const zohoId = h('input', { inputmode: 'numeric', value: p.zoho_account_id || '', placeholder: 'Id de la cuenta' });
  poner(caja, h('form', { class: 'form portal__rejilla', onsubmit: intentar(async ev => {
    ev.preventDefault();
    ok(await sb.from('partners').update({ estado: estado.value, zoho_account_id: zohoId.value.trim() || null }).eq('id', p.id));
    decir('Guardado.', 'ok');
    await yoMismo();
  }) }, campo('Estado', estado, 'Pausado: su página deja de verse.'), campo('Cuenta en Zoho', zohoId),
  h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Guardar'))));

  poner(caja, h('h3', {}, 'En Zoho'));
  const zoho = h('div', { class: 'portal__zoho' }, h('p', { class: 'form__note' }, 'Cargando…'));
  poner(caja, zoho);
  cargarZoho(zoho, p, zohoId);

  poner(caja, h('h3', {}, 'Lo que tiene con nosotros'),
    herramientas({ partner: p, ficha, acuerdos, reservas: reservas.length, leads: leads.length, vistas: suma(30, 'vistas') }));

  /* Reservas */
  poner(caja, h('h3', {}, `Reservas (${reservas.length})`),
    h('details', {}, h('summary', {}, 'Pedir una reserva'), formReserva({ partner: p, acuerdos, recargar: yoMismo })),
    reservas.length ? h('div', { class: 'portal__reservas' }, reservas.map(r => tarjetaReserva(r, ctx))) : h('p', { class: 'form__note' }, 'Ninguna todavía.'));

  /* Acuerdo */
  poner(caja, h('h3', {}, 'Acuerdo y versiones'), historialAcuerdos(acuerdos, ctx),
    h('details', {}, h('summary', {}, vigente ? 'Proponer una versión nueva' : 'Proponer el primer acuerdo'),
      formAcuerdo({ partnerId: p.id, acuerdos, recargar: yoMismo, admin: true })));

  /* Personas con acceso */
  const correo = h('input', { type: 'email', required: true, placeholder: 'correo@…' });
  poner(caja, h('h3', {}, 'Quién entra'),
    miembros.length ? h('table', { class: 'portal__tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Correo'), h('th', {}, 'Rol'), h('th', {}, 'Desde'), h('th', {}, 'Último acceso'))),
      h('tbody', {}, miembros.map(m => h('tr', {}, h('td', {}, m.correo), h('td', {}, m.rol), h('td', {}, fecha(m.desde)), h('td', {}, fechaHora(m.ultimo_acceso))))))
      : h('p', { class: 'form__note' }, 'Nadie ha entrado aún.'),
    invitaciones.filter(i => !i.aceptada_en).length ? h('p', { class: 'form__note' }, `Invitados sin entrar: ${invitaciones.filter(i => !i.aceptada_en).map(i => i.correo).join(', ')}`) : null,
    h('form', { class: 'form portal__rejilla', onsubmit: intentar(async ev => {
      ev.preventDefault();
      ok(await sb.from('invitaciones').insert({ partner_id: p.id, correo: correo.value.trim().toLowerCase() }));
      decir(`Invitación apuntada. Mándale el enlace eventspenedes.com/acceso: al entrar con ${correo.value.trim()} queda dentro.`, 'ok');
      await yoMismo();
    }) }, campo('Invitar a alguien', correo), h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Invitar'))));

  /* Ficha */
  poner(caja, h('h3', {}, 'Ficha'),
    h('p', {}, ficha ? `Publicada: versión ${ficha.version}, del ${fecha(ficha.actualizada_en)}. Web: ${ficha.datos?.autoriza === 'si' ? 'autorizada' : 'no autorizada'}.` : 'Sin ficha aprobada.',
      ' ', h('a', { href: `/partners/${p.codigo}` }, 'Su página'), ' ', boton('Vista previa', () => vistaPrevia(p.codigo))),
    cambios.length ? h('table', { class: 'portal__tabla' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Propuesto'), h('th', {}, 'Estado'), h('th', {}, 'Revisado'), h('th', {}, 'Nota'))),
      h('tbody', {}, cambios.map(c => h('tr', {}, h('td', {}, fecha(c.creado_en)), h('td', {}, c.estado), h('td', {}, fecha(c.revisado_en)), h('td', {}, c.nota_revision || '—')))))
      : null);
  const pendientes = await sb.from('cambios_ficha').select('*').eq('partner_id', p.id).eq('estado', 'pendiente').then(ok);
  for (const c of pendientes) { poner(caja, await tarjetaCambio(c, { [p.id]: p.nombre }, yoMismo)); }

  /* Leads */
  poner(caja, h('h3', {}, `Leads (${leads.length})`), leads.length ? h('table', { class: 'portal__tabla' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Llegó'), h('th', {}, 'Evento'), h('th', {}, 'Personas'), h('th', {}, 'Fecha'), h('th', {}, 'Zoho'))),
    h('tbody', {}, leads.map(l => h('tr', {}, h('td', {}, fecha(l.creado_en)), h('td', {}, l.tipo_evento || '—'), h('td', {}, l.personas ?? '—'),
      h('td', {}, fecha(l.fecha_evento)), h('td', {}, l.zoho_id ? `${l.zoho_modulo} ${l.zoho_id}` : '—'))))) : h('p', { class: 'form__note' }, 'Ninguno.'));

  /* Conversación, notas internas incluidas */
  poner(caja, h('h3', {}, 'Conversación y notas'),
    formComentario({ partnerId: p.id, admin: true, recargar: yoMismo, etiqueta: 'Escribir al partner o dejar una nota interna' }),
    lineaDeTiempo([...mensajes].reverse(), ctx));
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
