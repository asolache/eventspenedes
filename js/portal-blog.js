/* =============================================================================
   Events Penedès — el blog y la agenda en el portal (/acceso)

   Para el partner, dos vistas:
     · Tu entrevista: contesta el cuestionario, da (o no) permiso para salir
       con su nombre y sus fotos y lo envía. Cuando hemos escrito el artículo
       lo lee aquí y da su visto bueno o nos pide cambios. Publicado, puede
       retirarlo cuando quiera.
     · Tu agenda: propone acciones con fecha (una vez o cada año) que, cuando
       las aprobamos, salen en eventspenedes.com/agenda y en su página como
       ofertas nuevas. El precio es para nosotros: no sale en la web.

   Para administración, una vista «Blog y agenda»: las entrevistas que han
   llegado, el editor del artículo (sale con las respuestas ya puestas), la
   publicación, las guías propias y las acciones por aprobar.

   Cada vista se engancha a la navegación del portal (js/portal-app.js) con
   `extras`. Los permisos están en la base de datos
   (supabase/migrations/20261016120000_blog_agenda.sql): aquí solo se enseña.
   ========================================================================== */
import { sb } from './portal-cliente.js';
import { extras } from './portal-app.js';
import { poner, h, fecha, euros, ok, decir, campo, boton } from './portal-ui.js';
import { CUESTIONARIO, MAX_RESPUESTA, CATEGORIAS, borradorEntrevista, faltan, slug, proximaVez, cuando } from './blog-comun.js';

const ESTADO_ARTICULO = { cuestionario: 'Borrador', enviado: 'Enviada', propuesto: 'Artículo escrito', publicado: 'Publicado', retirado: 'Retirado' };
const ESTADO_ACCION = { propuesta: 'Pendiente de aprobar', aprobada: 'En la agenda', rechazada: 'No aprobada', retirada: 'Retirada', sustituida: 'Sustituida' };
const TONO = { propuesta: 'aviso', aprobada: 'ok', rechazada: 'error', propuesto: 'aviso', publicado: 'ok', enviado: 'aviso' };
const chip = (texto, tono) => h('span', { class: 'app-chip', 'data-tono': tono || null }, texto);

/* El artículo en pantalla, sin innerHTML: lo mismo que cuerpoHtml() en la web */
function textoArticulo(a) {
  const bloques = String(a.cuerpo || '').replace(/\r\n/g, '\n').split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  return h('div', { class: 'articulo' },
    a.titulo ? h('h4', {}, a.titulo) : null,
    a.entradilla ? h('p', {}, h('strong', {}, a.entradilla)) : null,
    bloques.map(b => (b.startsWith('## ') ? h('h5', {}, b.slice(3)) : b.startsWith('> ') ? h('blockquote', {}, b.replace(/^> ?/gm, '')) : h('p', {}, b))));
}

const texto = (nombre, valor, extra = {}) => h('textarea', { name: nombre, rows: 4, maxlength: MAX_RESPUESTA, ...extra }, valor || '');
const entrada = (nombre, valor, extra = {}) => h('input', { name: nombre, value: valor ?? '', ...extra });
const casilla = (nombre, marcada) => h('input', { type: 'checkbox', name: nombre, checked: Boolean(marcada) });

/* --- El partner: su entrevista --------------------------------------------------- */

async function vistaEntrevista({ partner, recargar }) {
  const articulos = await sb.from('articulos').select('*').eq('partner_id', partner.id).eq('tipo', 'entrevista')
    .order('creado_en', { ascending: false }).then(ok);
  const abierta = articulos.find(a => ['cuestionario', 'enviado', 'propuesto'].includes(a.estado));
  const publicadas = articulos.filter(a => a.estado === 'publicado');
  const nodos = [h('p', { class: 'app-nota form__note' },
    'Una entrevista en el blog de Events Penedès, enlazada a tu página: contáis quiénes sois y qué hace auténtica vuestra experiencia. ',
    'Nosotros escribimos el artículo con tus respuestas, tú lo lees y das el visto bueno, y entonces lo publicamos.')];

  for (const a of publicadas) {
    nodos.push(h('div', { class: 'app-card card' },
      h('p', {}, chip('Publicado', 'ok'), ' ', h('a', { href: `/blog/${a.slug}`, target: '_blank', rel: 'noopener' }, a.titulo), ` · ${fecha(a.publicado_en)}`),
      boton('Retirar de la web', async () => {
        if (!confirm('¿Retirar la entrevista del blog?')) { return; }
        ok(await sb.rpc('publicar_articulo', { p_articulo: a.id, p_publicar: false }));
        decir('Entrevista retirada del blog.', 'ok');
        await recargar();
      })));
  }

  if (abierta?.estado === 'propuesto') {
    const cambios = h('textarea', { rows: 3, maxlength: 2000, placeholder: 'Qué quieres que cambiemos' });
    nodos.push(h('div', { class: 'app-card card' },
      h('p', {}, chip('Tu artículo está escrito', 'aviso'), abierta.ok_partner_en ? ` · le diste el visto bueno el ${fecha(abierta.ok_partner_en)}; lo publicamos en breve.` : ' · léelo y dinos si podemos publicarlo.'),
      textoArticulo(abierta),
      abierta.ok_partner_en ? null : h('p', {}, boton('Dar el visto bueno', async () => {
        ok(await sb.rpc('visto_bueno_articulo', { p_articulo: abierta.id }));
        decir('Gracias. Lo publicamos en cuanto lo revisemos.', 'ok');
        await recargar();
      }, 'primary')),
      h('details', {}, h('summary', {}, 'Pedir cambios'),
        campo('Cambios', cambios),
        boton('Enviar', async () => {
          if (!cambios.value.trim()) { throw new Error('Escribe qué quieres cambiar.'); }
          ok(await sb.rpc('comentar', { p_partner: partner.id, p_texto: `Cambios en la entrevista «${abierta.titulo}»:\n${cambios.value.trim()}` }));
          decir('Enviado. Te avisamos cuando esté corregido.', 'ok');
          await recargar();
        }))));
    return { n: abierta.ok_partner_en ? 0 : 1, nodos };
  }

  /* El cuestionario: nuevo, en borrador o ya enviado (se puede seguir cambiando) */
  const r = abierta?.respuestas || {};
  const form = h('form', { class: 'form' },
    CUESTIONARIO.map(q => campo(`${q.p}${q.obligatoria ? ' *' : ''}`, texto(q.n, r[q.n]))),
    h('p', { class: 'field' }, h('label', {}, casilla('permiso_nombre', abierta?.permiso_nombre),
      ' Autorizo a Events Penedès a publicar esta entrevista con nuestro nombre y a enlazarla a nuestra página.')),
    h('p', { class: 'field' }, h('label', {}, casilla('permiso_fotos', abierta?.permiso_fotos),
      ' Autorizo usar en el artículo las fotos de nuestra ficha (solo las que tenemos derecho a publicar).')),
    h('p', { class: 'form__note' }, 'No pongáis precios, teléfonos ni correos: el blog es para contar quiénes sois. Las peticiones de clientes nos llegan a nosotros.'));
  const leer = () => ({
    respuestas: Object.fromEntries(CUESTIONARIO.map(q => [q.n, form.elements[q.n].value.trim()]).filter(([, v]) => v)),
    nombre: form.elements.permiso_nombre.checked, fotos: form.elements.permiso_fotos.checked,
  });
  const guardar = enviar => async () => {
    const d = leer();
    if (enviar) {
      const sin = faltan(d.respuestas);
      if (sin.length) { throw new Error(`Falta contestar: ${sin.map(q => `«${q.p}»`).join(', ')}`); }
      if (!d.nombre) { throw new Error('Para publicar la entrevista necesitamos tu permiso para salir con vuestro nombre.'); }
    }
    ok(await sb.rpc('guardar_entrevista', { p_partner: partner.id, p_respuestas: d.respuestas, p_permiso_nombre: d.nombre, p_permiso_fotos: d.fotos, p_enviar: enviar }));
    decir(enviar ? 'Enviada. Escribimos el artículo y te lo enseñamos aquí antes de publicarlo.' : 'Guardado.', 'ok');
    await recargar();
  };
  poner(form, h('p', {}, boton('Guardar', guardar(false)), ' ', boton(abierta?.estado === 'enviado' ? 'Volver a enviar' : 'Enviar a Events Penedès', guardar(true), 'primary')));
  nodos.push(abierta?.estado === 'enviado'
    ? h('p', {}, chip('Enviada', 'aviso'), ` · el ${fecha(abierta.actualizado_en)}. Estamos escribiendo tu artículo; hasta entonces puedes cambiar las respuestas.`)
    : null, form);
  return { n: 0, nodos };
}

/* --- El partner: su agenda -------------------------------------------------------- */

function formAccion({ partnerId = null, base = null, admin = false, alGuardar }) {
  const b = base || {};
  const cat = h('select', { name: 'categoria' }, Object.entries(CATEGORIAS).map(([k, t]) => h('option', { value: k, selected: k === (b.categoria || 'otro') }, t)));
  const unidad = h('select', { name: 'precio_unidad' }, h('option', { value: '' }, '—'),
    [['persona', 'por persona'], ['grupo', 'por grupo'], ['hora', 'por hora']].map(([k, t]) => h('option', { value: k, selected: k === b.precio_unidad }, t)));
  const form = h('form', { class: 'form' },
    campo('Qué es *', entrada('titulo', b.titulo, { required: true, minlength: 3, maxlength: 120, placeholder: 'Vendimia en familia, cata de vermut, calçotada…' })),
    campo('Cómo es', h('textarea', { name: 'descripcion', rows: 3, maxlength: 2000 }, b.descripcion || ''), 'Sale en la web: sin precios, teléfonos ni correos.'),
    campo('Tipo', cat),
    h('div', { class: 'form__row' },
      campo('Desde *', entrada('fecha_inicio', b.fecha_inicio, { type: 'date', required: true })),
      campo('Hasta', entrada('fecha_fin', b.fecha_fin, { type: 'date' }), 'Si dura varios días, hasta tres meses.')),
    h('p', { class: 'field' }, h('label', {}, casilla('cada_ano', b.cada_ano), ' Se repite cada año en estas fechas')),
    h('div', { class: 'form__row' },
      campo('Hora de inicio', entrada('hora_inicio', b.hora_inicio ? String(b.hora_inicio).slice(0, 5) : '', { type: 'time' })),
      campo('Hora de fin', entrada('hora_fin', b.hora_fin ? String(b.hora_fin).slice(0, 5) : '', { type: 'time' }))),
    h('div', { class: 'form__row' },
      campo('Mínimo de personas', entrada('plazas_min', b.plazas_min, { type: 'number', min: 1, inputmode: 'numeric' })),
      campo('Máximo de personas', entrada('plazas_max', b.plazas_max, { type: 'number', min: 1, inputmode: 'numeric' }))),
    h('div', { class: 'form__row' },
      campo('Precio para Events Penedès', entrada('precio', b.precio, { type: 'number', min: 0, step: '0.01', inputmode: 'decimal' }), 'No sale en la web.'),
      campo('Por', unidad)),
    h('p', { class: 'field' }, h('label', {}, casilla('iva_incluido', b.iva_incluido), ' El precio lleva el IVA incluido (si no, es sin IVA)')));
  const n = v => (v === '' ? null : Number(v));
  poner(form, h('p', {}, boton(base?.id && !admin ? 'Proponer el cambio' : admin ? 'Añadir a la agenda' : 'Proponer la acción', async () => {
    if (!form.reportValidity()) { return; }
    const e = form.elements;
    const fila = {
      partner_id: partnerId, titulo: e.titulo.value.trim(), descripcion: e.descripcion.value.trim() || null, categoria: e.categoria.value,
      fecha_inicio: e.fecha_inicio.value, fecha_fin: e.fecha_fin.value || null, cada_ano: e.cada_ano.checked,
      hora_inicio: e.hora_inicio.value || null, hora_fin: e.hora_fin.value || null,
      plazas_min: n(e.plazas_min.value), plazas_max: n(e.plazas_max.value),
      precio: n(e.precio.value), precio_unidad: e.precio_unidad.value || null, iva_incluido: e.iva_incluido.checked,
      ...(admin ? { estado: 'aprobada' } : { sustituye: base?.id || null }),
    };
    if (!admin) { const { data } = await sb.auth.getUser(); fila.autor = data.user.id; }
    ok(await sb.from('agenda').insert(fila));
    decir(admin ? 'Añadida a la agenda.' : 'Propuesta enviada. Sale en la agenda cuando la aprobemos.', 'ok');
    await alGuardar();
  }, 'primary')));
  return form;
}

async function vistaAgenda({ partner, recargar }) {
  const acciones = await sb.from('agenda').select('*').eq('partner_id', partner.id).order('fecha_inicio').then(ok);
  const vivas = acciones.filter(a => ['propuesta', 'aprobada'].includes(a.estado));
  const otras = acciones.filter(a => !vivas.includes(a));
  const tarjeta = a => {
    const vez = proximaVez(a);
    return h('li', { class: 'app-fila' },
      h('p', {}, chip(ESTADO_ACCION[a.estado], TONO[a.estado]), ' ', h('strong', {}, a.titulo)),
      h('p', { class: 'form__note' }, vez ? cuando(vez.inicio, vez.fin) : 'Ya pasó', a.cada_ano ? ' · cada año' : '',
        a.precio !== null ? ` · ${euros(a.precio)}${a.precio_unidad ? ` por ${a.precio_unidad}` : ''} ${a.iva_incluido ? 'IVA incl.' : 'sin IVA'}` : '',
        a.nota_revision ? ` · Nota: ${a.nota_revision}` : ''),
      ['propuesta', 'aprobada'].includes(a.estado) ? h('p', {},
        a.estado === 'aprobada' ? h('details', {}, h('summary', {}, 'Cambiar'),
          h('p', { class: 'form__note' }, 'El cambio queda pendiente; hasta que lo aprobemos sigue saliendo la versión de ahora.'),
          formAccion({ partnerId: partner.id, base: a, alGuardar: recargar })) : null,
        boton('Retirar', async () => {
          if (!confirm(`¿Retirar «${a.titulo}» de la agenda?`)) { return; }
          ok(await sb.rpc('retirar_accion', { p_accion: a.id }));
          decir('Retirada.', 'ok');
          await recargar();
        })) : null);
  };
  return {
    n: 0,
    nodos: [
      h('p', { class: 'app-nota form__note' }, 'Las experiencias que hacéis con fecha: vendimia, catas, talleres, comidas de temporada. ',
        'Cuando las aprobamos salen en ', h('a', { href: '/agenda', target: '_blank', rel: 'noopener' }, 'la agenda del Penedès'),
        ' y en tu página como ofertas nuevas. Quien se interesa nos escribe a nosotros y te pedimos la reserva por aquí.'),
      vivas.length ? h('ul', { class: 'app-tareas portal__tareas' }, vivas.map(tarjeta)) : h('p', { class: 'app-vacio' }, 'Aún no tienes ninguna acción en la agenda.'),
      h('details', { open: !vivas.length }, h('summary', {}, 'Proponer una acción nueva'), formAccion({ partnerId: partner.id, alGuardar: recargar })),
      otras.length ? h('details', {}, h('summary', {}, `Anteriores (${otras.length})`), h('ul', { class: 'app-tareas portal__tareas' }, otras.map(tarjeta))) : null,
    ],
  };
}

/* --- Administración: blog y agenda ------------------------------------------------ */

function editorArticulo(a, { partner, fotosFicha, recargar }) {
  const cuerpo = a.cuerpo || (a.tipo === 'entrevista' ? borradorEntrevista(a.respuestas) : '');
  const titulo = entrada('titulo', a.titulo, { maxlength: 140, required: true });
  const direccion = entrada('slug', a.slug, { maxlength: 80, pattern: '[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?', required: true });
  titulo.addEventListener('input', () => { if (!a.slug) { direccion.value = slug(titulo.value); } });
  const form = h('form', { class: 'form' },
    campo('Título', titulo),
    campo('Dirección', direccion, 'eventspenedes.com/blog/…'),
    campo('Entradilla', h('textarea', { name: 'entradilla', rows: 2, maxlength: 400 }, a.entradilla || ''), 'La descripción para buscadores y redes.'),
    campo('Texto', h('textarea', { name: 'cuerpo', rows: 16, maxlength: 30000 }, cuerpo), 'Párrafos separados por una línea en blanco; «## » para un apartado; «> » para una cita.'),
    campo('Temas', entrada('temas', (a.temas || []).join(', '), { placeholder: 'vino, vendimia, masías' })));
  const fotos = new Set(a.fotos || []);
  if (fotosFicha.length && (a.tipo === 'guia' || a.permiso_fotos)) {
    const lista = h('ul', { class: 'portal__fotos' });
    poner(form, h('p', {}, 'Fotos del artículo (de su ficha aprobada):'), lista);
    for (const ruta of fotosFicha) {
      sb.storage.from('fotos').createSignedUrl(ruta, 3600).then(({ data }) => {
        const c = casilla('foto', fotos.has(ruta));
        c.addEventListener('change', () => (c.checked ? fotos.add(ruta) : fotos.delete(ruta)));
        lista.append(h('li', {}, data ? h('img', { src: data.signedUrl, alt: '' }) : null, h('label', {}, c, ' Usar')));
      });
    }
  } else if (a.tipo === 'entrevista' && !a.permiso_fotos) {
    poner(form, h('p', { class: 'form__note' }, 'Sin permiso del partner para usar sus fotos: el artículo sale sin fotos.'));
  }
  const datos = () => {
    const e = form.elements;
    return { titulo: e.titulo.value.trim(), slug: e.slug.value.trim(), entradilla: e.entradilla.value.trim() || null,
      cuerpo: e.cuerpo.value.trim(), temas: e.temas.value.split(',').map(t => t.trim()).filter(Boolean), fotos: [...fotos] };
  };
  const guardar = async (estado) => {
    if (!form.reportValidity()) { throw new Error('Falta el título o la dirección.'); }
    ok(await sb.from('articulos').update({ ...datos(), ...(estado ? { estado } : {}) }).eq('id', a.id));
  };
  const botones = a.tipo === 'entrevista'
    ? [boton(a.estado === 'propuesto' ? 'Guardar (pide otra vez su visto bueno si cambia el texto)' : 'Guardar y enseñárselo al partner', async () => {
      await guardar('propuesto');
      decir(`Guardado. ${partner?.nombre || 'El partner'} lo verá en su panel para dar el visto bueno.`, 'ok');
      await recargar();
    }),
    a.estado === 'propuesto' && a.ok_partner_en && a.permiso_nombre ? boton('Publicar', async () => {
      ok(await sb.rpc('publicar_articulo', { p_articulo: a.id, p_publicar: true }));
      decir('Publicado en el blog.', 'ok');
      await recargar();
    }, 'primary') : h('span', { class: 'form__note' }, a.estado === 'propuesto' ? ' Falta el visto bueno del partner para publicar.' : '')]
    : [boton('Guardar', async () => { await guardar(); decir('Guardado.', 'ok'); await recargar(); }),
      boton('Publicar', async () => {
        await guardar();
        ok(await sb.rpc('publicar_articulo', { p_articulo: a.id, p_publicar: true }));
        decir('Publicado en el blog.', 'ok');
        await recargar();
      }, 'primary')];
  poner(form, h('p', {}, botones));
  return form;
}

async function vistaAdmin({ recargar, irAPartner }) {
  const [articulos, pendientes, partners] = await Promise.all([
    sb.from('articulos').select('*').order('actualizado_en', { ascending: false }).limit(200).then(ok),
    sb.from('agenda').select('*').eq('estado', 'propuesta').order('creado_en').then(ok),
    sb.from('partners').select('id,codigo,nombre').order('nombre').then(ok),
  ]);
  const nombre = Object.fromEntries(partners.map(p => [p.id, p]));
  const enlace = id => (nombre[id] ? h('button', { class: 'btn-link', type: 'button', onclick: () => irAPartner?.(nombre[id]) }, nombre[id].nombre) : 'Events Penedès');
  const enCurso = articulos.filter(a => ['enviado', 'propuesto'].includes(a.estado) || (a.tipo === 'guia' && a.estado === 'cuestionario'));
  const publicados = articulos.filter(a => a.estado === 'publicado');
  const fotosDe = async id => {
    if (!id) { return []; }
    const f = await sb.from('fichas').select('datos').eq('partner_id', id).maybeSingle().then(ok);
    return (Array.isArray(f?.datos?.imagenes) ? f.datos.imagenes : []).filter(r => typeof r === 'string' && r.startsWith(`${id}/`));
  };

  const nodos = [h('h3', {}, `Entrevistas y guías en curso (${enCurso.length})`)];
  if (!enCurso.length) { nodos.push(h('p', { class: 'app-vacio' }, 'Nada. Cuando un partner envíe su entrevista sale aquí con sus respuestas.')); }
  for (const a of enCurso) {
    const p = nombre[a.partner_id];
    nodos.push(h('div', { class: 'app-card card' },
      h('p', {}, chip(ESTADO_ARTICULO[a.estado], TONO[a.estado]), ' ', a.tipo === 'entrevista' ? enlace(a.partner_id) : 'Guía',
        a.tipo === 'entrevista' ? ` · nombre: ${a.permiso_nombre ? 'sí' : 'NO'} · fotos: ${a.permiso_fotos ? 'sí' : 'no'}` : '',
        a.ok_partner_en ? ` · visto bueno del partner el ${fecha(a.ok_partner_en)}` : ''),
      a.tipo === 'entrevista' ? h('details', {}, h('summary', {}, 'Sus respuestas'),
        h('dl', {}, CUESTIONARIO.filter(q => a.respuestas?.[q.n]).map(q => [h('dt', {}, q.p), h('dd', {}, a.respuestas[q.n])]))) : null,
      editorArticulo(a, { partner: p, fotosFicha: await fotosDe(a.partner_id), recargar })));
  }
  nodos.push(h('details', {}, h('summary', {}, 'Escribir una guía'), h('p', {}, boton('Empezar una guía nueva', async () => {
    ok(await sb.from('articulos').insert({ tipo: 'guia', estado: 'cuestionario' }));
    await recargar();
  }))));

  nodos.push(h('h3', {}, `Publicados (${publicados.length})`), publicados.length
    ? h('ul', { class: 'app-tareas portal__tareas' }, publicados.map(a => h('li', { class: 'app-fila' },
      h('a', { href: `/blog/${a.slug}`, target: '_blank', rel: 'noopener' }, a.titulo), ` · ${fecha(a.publicado_en)} · `, enlace(a.partner_id), ' ',
      boton('Retirar', async () => {
        if (!confirm(`¿Retirar «${a.titulo}» del blog?`)) { return; }
        ok(await sb.rpc('publicar_articulo', { p_articulo: a.id, p_publicar: false }));
        await recargar();
      }))))
    : h('p', { class: 'app-vacio' }, 'Aún no hay nada publicado.'));

  nodos.push(h('h3', {}, `Acciones de la agenda por aprobar (${pendientes.length})`));
  for (const a of pendientes) {
    const nota = h('input', { type: 'text', placeholder: 'Nota para el partner (opcional)' });
    const vez = proximaVez(a);
    const revisar = aprobar => async () => {
      ok(await sb.rpc('revisar_accion', { p_accion: a.id, p_aprobar: aprobar, p_nota: nota.value.trim() || null }));
      decir(aprobar ? 'Aprobada: ya sale en la agenda.' : 'No aprobada.', 'ok');
      await recargar();
    };
    nodos.push(h('div', { class: 'app-card card' },
      h('p', {}, enlace(a.partner_id), ' · ', h('strong', {}, a.titulo), a.sustituye ? ' · cambia una que ya está en la agenda' : ''),
      h('p', { class: 'form__note' }, [vez ? cuando(vez.inicio, vez.fin) : 'fecha pasada', a.cada_ano ? 'cada año' : '',
        CATEGORIAS[a.categoria], a.plazas_max ? `hasta ${a.plazas_max} pax` : '',
        a.precio !== null ? `${euros(a.precio)}${a.precio_unidad ? ` por ${a.precio_unidad}` : ''} ${a.iva_incluido ? 'IVA incl.' : 'sin IVA'}` : 'sin precio'].filter(Boolean).join(' · ')),
      a.descripcion ? h('p', {}, a.descripcion) : null,
      h('p', {}, nota, ' ', boton('Aprobar', revisar(true), 'primary'), ' ', boton('No aprobar', revisar(false)))));
  }
  if (!pendientes.length) { nodos.push(h('p', { class: 'app-vacio' }, 'Nada por aprobar.')); }
  const quien = h('select', {}, h('option', { value: '' }, 'Events Penedès'), partners.map(p => h('option', { value: p.id }, p.nombre)));
  const hueco = h('div');
  const pintarForm = () => { hueco.textContent = ''; hueco.append(formAccion({ partnerId: quien.value || null, admin: true, alGuardar: recargar })); };
  quien.addEventListener('change', pintarForm);
  pintarForm();
  nodos.push(h('details', {}, h('summary', {}, 'Añadir una acción a la agenda'), campo('De quién', quien), hueco),
    h('p', {}, h('a', { href: '/agenda', target: '_blank', rel: 'noopener' }, 'Ver la agenda publicada'), ' · ',
      h('a', { href: '/blog', target: '_blank', rel: 'noopener' }, 'Ver el blog')));

  const porMirar = articulos.filter(a => a.estado === 'enviado' || (a.estado === 'propuesto' && a.ok_partner_en)).length + pendientes.length;
  return { n: porMirar, nodos };
}

/* --- Enganche a la navegación del portal ------------------------------------------ */

const vista = (id, titulo, icono, fn) => async ctx => {
  try { return { id, titulo, icono, ...(await fn(ctx)) }; } catch (e) {
    return { id, titulo, icono, n: 0, nodos: [h('p', { class: 'app-vacio' }, `No se ha podido cargar: ${e.message}`)] };
  }
};
extras.partner.push(vista('entrevista', 'Tu entrevista', 'ficha', vistaEntrevista));
extras.partner.push(vista('agenda', 'Tu agenda', 'reservas', vistaAgenda));
extras.admin.push(vista('blog', 'Blog y agenda', 'ficha', vistaAdmin));

export { vistaEntrevista, vistaAgenda, vistaAdmin, formAccion };
