/* =============================================================================
   Events Penedès — la relación con cada partner en el portal (/acceso)

   Lo que comparten el panel del partner y el de administración:
   - la conversación: cada paso (una reserva, un acuerdo, un cambio de ficha)
     y cada comentario, en una sola línea de tiempo, que pasa a Zoho;
   - las reservas: nosotros pedimos, el partner confirma, propone otra cosa o
     no puede, y todo queda escrito;
   - los acuerdos: versiones con historial, de cuál viene cada una, qué
     cambia respecto a la anterior y quién la firmó o la rechazó y por qué;
   - lo que el partner tiene con nosotros (sus herramientas).

   Los permisos no viven aquí: la base de datos solo acepta lo que a cada uno
   le toca (supabase/migrations).
   ========================================================================== */
import { sb } from './portal-cliente.js';
import { h, fecha, fechaHora, euros, hora, ok, intentar, decir, campo, boton, api, aZoho } from './portal-ui.js';

/* --- La conversación ------------------------------------------------------------ */

const PASOS = {
  comentario: 'Comentario', nota_interna: 'Nota interna (solo administración)',
  cambio_propuesto: 'Propone cambios en la ficha', cambio_aprobado: 'Cambios de ficha aprobados y publicados', cambio_rechazado: 'Cambios de ficha rechazados',
  acuerdo_propuesto: 'Acuerdo propuesto', acuerdo_aceptado: 'El partner acepta el acuerdo', acuerdo_validado: 'Events Penedès valida el acuerdo',
  acuerdo_vigente: 'Acuerdo vigente', acuerdo_rechazado: 'Acuerdo rechazado',
  reserva_solicitada: 'Reserva pedida', reserva_confirmada: 'Reserva confirmada', reserva_alternativa: 'Propone otra cosa',
  reserva_rechazada: 'No puede', reserva_modificada: 'Reserva cambiada: hay que volver a confirmar', reserva_cancelada: 'Reserva cancelada',
};
const DATOS = { titulo: 'Qué', fecha: 'Fecha', hora_inicio: 'Desde', hora_fin: 'Hasta', personas: 'Personas', concepto: 'Servicio', importe: 'Importe', version: 'Versión' };

export function lineaDeTiempo(mensajes, { admin, nombres = {}, yo, nosotros = 'Events Penedès' }) {
  if (!mensajes.length) { return h('p', { class: 'form__note' }, 'Todavía no hay nada escrito.'); }
  return h('ol', { class: 'portal__conversacion' }, mensajes.map(m => {
    const datos = Object.entries(m.datos || {}).filter(([k, v]) => DATOS[k] && v !== null && v !== '')
      .map(([k, v]) => `${DATOS[k]}: ${k === 'importe' ? euros(v) : k.startsWith('hora') ? hora(v) : k === 'fecha' ? fecha(v) : v}`);
    const quien = m.autor === yo ? 'Tú' : nombres[m.autor] || (admin ? 'Partner' : nosotros);
    return h('li', { class: `portal__msg${m.interno ? ' portal__msg--interno' : ''}`, 'data-tipo': m.tipo },
      h('p', { class: 'portal__msg-cab' }, h('strong', {}, PASOS[m.tipo] || m.tipo), ` · ${quien} · ${fechaHora(m.creado_en)}`,
        admin && m.zoho_nota_id && m.zoho_nota_id !== 'sin-destino' ? ' · en Zoho' : ''),
      m.texto ? h('p', { class: 'portal__msg-texto' }, m.texto) : null,
      datos.length ? h('p', { class: 'form__note' }, datos.join(' · ')) : null);
  }));
}

export function formComentario({ partnerId, sobre = 'general', ref = null, admin, recargar, etiqueta = 'Escribe un comentario' }) {
  const texto = h('textarea', { rows: 2, maxlength: 4000, required: true });
  const interno = admin ? h('input', { type: 'checkbox' }) : null;
  return h('form', { class: 'form portal__comentar', onsubmit: intentar(async ev => {
    ev.preventDefault();
    const id = ok(await sb.rpc('comentar', { p_partner: partnerId, p_texto: texto.value.trim(), p_sobre: sobre, p_ref: ref, p_interno: Boolean(interno?.checked) }));
    await aZoho({ mensaje: id });
    decir('Comentario guardado.', 'ok');
    await recargar();
  }) },
  campo(etiqueta, texto),
  interno ? h('p', {}, h('label', {}, interno, ' Nota interna: el partner no la ve')) : null,
  h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Enviar')));
}

/* --- Reservas -------------------------------------------------------------------- */

export const ESTADO_RESERVA = {
  solicitada: 'Esperando confirmación', confirmada: 'Confirmada', alternativa: 'Propuesta alternativa',
  rechazada: 'No puede', cancelada: 'Cancelada',
};

const cuando = r => `${fecha(r.fecha)}${r.hora_inicio ? `, ${hora(r.hora_inicio)}${r.hora_fin ? `–${hora(r.hora_fin)}` : ''}` : ''}`;

export function tarjetaReserva(r, { admin, partner, acuerdos, mensajes, recargar, yo, nombres }) {
  const acuerdo = acuerdos.find(a => a.id === r.acuerdo_id);
  const hilo = mensajes.filter(m => m.ref === r.id);
  const caja = h('article', { class: `card portal__reserva`, 'data-estado': r.estado },
    h('p', { class: 'eyebrow' }, ESTADO_RESERVA[r.estado] || r.estado),
    h('h4', {}, r.titulo),
    h('dl', { class: 'portal__datos' },
      dato('Cuándo', cuando(r)),
      r.personas ? dato('Personas', String(r.personas)) : null,
      r.concepto ? dato('Qué os pedimos', r.concepto) : null,
      r.importe !== null ? dato('Importe', `${euros(r.importe)}${r.iva_incluido ? ' IVA incluido' : ' sin IVA'}`) : null,
      dato('Acuerdo', acuerdo ? `versión ${acuerdo.version}` : 'sin acuerdo firmado'),
      r.responder_antes && ['solicitada', 'alternativa'].includes(r.estado) ? dato('Contestar antes del', fecha(r.responder_antes)) : null),
    r.detalles ? h('p', { class: 'portal__msg-texto' }, r.detalles) : null);

  if (!admin && r.estado === 'solicitada') { caja.append(respuestaPartner(r, recargar)); }
  if (!admin && r.estado === 'confirmada') {
    caja.append(h('details', {}, h('summary', {}, 'Ya no podemos'), formMotivo('Cuéntanos qué ha pasado', async texto => {
      ok(await sb.rpc('responder_reserva', { p_reserva: r.id, p_respuesta: 'rechazada', p_texto: texto }));
      await aZoho({ ref: r.id });
      decir('Avisado. Te contestamos enseguida.', 'ok');
      await recargar();
    })));
  }
  if (admin) { caja.append(accionesAdmin(r, partner, recargar)); }

  caja.append(h('details', { open: hilo.length > 1 ? true : null },
    h('summary', {}, `Conversación de esta reserva (${hilo.length})`),
    lineaDeTiempo(hilo, { admin, yo, nombres }),
    formComentario({ partnerId: r.partner_id, sobre: 'reserva', ref: r.id, admin, recargar })));
  return caja;
}

const dato = (t, v) => h('div', {}, h('dt', {}, t), h('dd', {}, v));

function formMotivo(etiqueta, enviar) {
  const texto = h('textarea', { rows: 2, maxlength: 4000, required: true });
  return h('form', { class: 'form', onsubmit: intentar(async ev => { ev.preventDefault(); await enviar(texto.value.trim()); }) },
    campo(etiqueta, texto), h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Enviar')));
}

function respuestaPartner(r, recargar) {
  const nota = h('textarea', { rows: 2, maxlength: 4000, placeholder: 'Algo que debamos saber (opcional)' });
  const confirmar = h('form', { class: 'form', onsubmit: intentar(async ev => {
    ev.preventDefault();
    ok(await sb.rpc('responder_reserva', { p_reserva: r.id, p_respuesta: 'confirmada', p_texto: nota.value.trim() || null }));
    await aZoho({ ref: r.id });
    decir('Reserva confirmada. Gracias.', 'ok');
    await recargar();
  }) }, campo('Comentario', nota), h('p', {}, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Confirmar la reserva')));

  const f = { fecha: h('input', { type: 'date', value: r.fecha }), hora_inicio: h('input', { type: 'time', value: hora(r.hora_inicio) }),
    hora_fin: h('input', { type: 'time', value: hora(r.hora_fin) }), personas: h('input', { type: 'number', min: 1, value: r.personas ?? '' }),
    importe: h('input', { type: 'number', min: 0, step: '0.01', value: r.importe ?? '' }) };
  const texto = h('textarea', { rows: 2, maxlength: 4000, required: true, placeholder: 'Qué cambia y por qué' });
  const alternativa = h('form', { class: 'form portal__rejilla', onsubmit: intentar(async ev => {
    ev.preventDefault();
    const propuesta = {};
    for (const [k, el] of Object.entries(f)) {
      const v = el.value.trim();
      const antes = k.startsWith('hora') ? hora(r[k]) : String(r[k] ?? '');
      if (v && v !== antes) { propuesta[k] = ['personas'].includes(k) ? Number(v) : k === 'importe' ? Number(v) : v; }
    }
    ok(await sb.rpc('responder_reserva', { p_reserva: r.id, p_respuesta: 'alternativa', p_texto: texto.value.trim(), p_propuesta: propuesta }));
    await aZoho({ ref: r.id });
    decir('Propuesta enviada. Te decimos si nos encaja.', 'ok');
    await recargar();
  }) },
  campo('Fecha', f.fecha), campo('Desde', f.hora_inicio), campo('Hasta', f.hora_fin), campo('Personas', f.personas),
  campo('Importe (€)', f.importe), campo('Qué propones', texto),
  h('p', {}, h('button', { class: 'btn btn--ghost', type: 'submit' }, 'Proponer otra cosa')));

  return h('div', { class: 'portal__responder' }, confirmar,
    h('details', {}, h('summary', {}, 'Proponer otra fecha, hora o precio'), alternativa),
    h('details', {}, h('summary', {}, 'No podemos'), formMotivo('Cuéntanos por qué', async t => {
      ok(await sb.rpc('responder_reserva', { p_reserva: r.id, p_respuesta: 'rechazada', p_texto: t }));
      await aZoho({ ref: r.id });
      decir('Entendido, gracias por avisar.', 'ok');
      await recargar();
    })));
}

function accionesAdmin(r, partner, recargar) {
  const cont = h('div', { class: 'portal__botones' });
  if (r.estado === 'alternativa') {
    cont.append(boton('Aceptar su propuesta', async () => {
      ok(await sb.rpc('aceptar_alternativa', { p_reserva: r.id }));
      await aZoho();
      decir('Aceptada: la reserva queda confirmada con lo que propuso.', 'ok');
      await recargar();
    }, 'primary'));
  }
  if (r.estado !== 'cancelada') {
    cont.append(h('details', {}, h('summary', {}, 'Cambiar y volver a pedir'), formReserva({ partner, reserva: r, recargar })));
    cont.append(h('details', {}, h('summary', {}, 'Cancelar'), formMotivo('Motivo (lo ve el partner)', async t => {
      ok(await sb.rpc('cancelar_reserva', { p_reserva: r.id, p_texto: t }));
      await aZoho();
      decir('Reserva cancelada.', 'ok');
      await recargar();
    })));
  }
  if (r.estado === 'solicitada') {
    const asunto = `Reserva para el ${fecha(r.fecha)}: ${r.titulo}`;
    const cuerpo = `Hola,\n\nOs hemos pedido una reserva en el portal de Events Penedès: ${r.titulo}, ${cuando(r)}${r.personas ? `, ${r.personas} personas` : ''}.\n\n¿Nos la confirmáis aquí? https://eventspenedes.com/acceso\n\nGracias.`;
    cont.append(h('a', { class: 'btn btn--ghost', href: `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}` }, 'Avisar por correo'));
  }
  return cont;
}

/* Pedir una reserva (o cambiar una pedida). El título lo ve el partner: sin
   nombre ni datos del cliente, que están en Zoho. */
export function formReserva({ partner, reserva, acuerdos = [], recargar }) {
  const r = reserva || {};
  const f = {
    titulo: h('input', { required: true, minlength: 3, maxlength: 160, value: r.titulo || '', placeholder: 'Comida de empresa · 40 personas' }),
    concepto: h('input', { maxlength: 300, value: r.concepto || '', placeholder: 'Menú de temporada en la sala grande' }),
    fecha: h('input', { type: 'date', required: true, value: r.fecha || '' }),
    hora_inicio: h('input', { type: 'time', value: hora(r.hora_inicio) }),
    hora_fin: h('input', { type: 'time', value: hora(r.hora_fin) }),
    personas: h('input', { type: 'number', min: 1, value: r.personas ?? '' }),
    importe: h('input', { type: 'number', min: 0, step: '0.01', value: r.importe ?? '' }),
    responder_antes: h('input', { type: 'date', value: r.responder_antes || '' }),
    zoho_deal_id: h('input', { inputmode: 'numeric', pattern: '\\d{6,25}', value: r.zoho_deal_id || '', placeholder: 'Id del trato en Zoho' }),
    detalles: h('textarea', { rows: 3, maxlength: 4000 }, r.detalles || ''),
  };
  const iva = h('input', { type: 'checkbox', checked: r.iva_incluido ? true : null });
  const vigente = acuerdos.find(a => a.estado === 'vigente');
  const valores = () => {
    const v = {};
    for (const [k, el] of Object.entries(f)) {
      const x = el.value.trim();
      v[k] = x === '' ? null : ['personas'].includes(k) ? Number(x) : k === 'importe' ? Number(x) : x;
    }
    return v;
  };
  const traer = boton('Traer la fecha de Zoho', async () => {
    const { trato } = await api(`/api/portal/zoho?deal=${encodeURIComponent(f.zoho_deal_id.value.trim())}`);
    if (!trato) { throw new Error('No encuentro ese trato en Zoho.'); }
    if (trato.cierre && !f.fecha.value) { f.fecha.value = trato.cierre; }
    decir(`Trato «${trato.nombre}» (${trato.etapa || 'sin etapa'}). El título es lo que verá el partner: no pongas el nombre del cliente.`, 'info');
  });
  return h('form', { class: 'form portal__rejilla', onsubmit: intentar(async ev => {
    ev.preventDefault();
    const v = valores();
    if (reserva) {
      const cambios = {};
      for (const [k, x] of Object.entries(v)) {
        const antes = k.startsWith('hora') ? (hora(r[k]) || null) : (r[k] ?? null);
        if (String(x ?? '') !== String(antes ?? '')) { cambios[k] = x; }
      }
      if (!Object.keys(cambios).length) { throw new Error('No has cambiado nada.'); }
      ok(await sb.rpc('modificar_reserva', { p_reserva: r.id, p_cambios: cambios, p_texto: null }));
      decir('Cambiada. El partner tiene que volver a confirmarla.', 'ok');
    } else {
      ok(await sb.from('reservas').insert({ partner_id: partner.id, ...v, iva_incluido: iva.checked }));
      decir(`Reserva pedida a ${partner.nombre}${vigente ? `, con el acuerdo vigente (versión ${vigente.version})` : ', sin acuerdo vigente'}. Avísale para que la confirme.`, 'ok');
    }
    await aZoho();
    await recargar();
  }) },
  campo('Título (lo ve el partner)', f.titulo), campo('Qué le pedimos', f.concepto),
  campo('Fecha', f.fecha), campo('Desde', f.hora_inicio), campo('Hasta', f.hora_fin), campo('Personas', f.personas),
  campo('Importe acordado (€)', f.importe), reserva ? null : h('p', {}, h('label', {}, iva, ' El importe lleva IVA')),
  campo('Que conteste antes del', f.responder_antes),
  campo('Trato en Zoho', f.zoho_deal_id, 'Las respuestas del partner van como notas a este trato.'), h('p', {}, traer),
  campo('Detalles para el partner', f.detalles),
  h('p', {}, h('button', { class: 'btn btn--primary', type: 'submit' }, reserva ? 'Guardar y volver a pedir' : 'Pedir la reserva')));
}

/* --- Acuerdos ---------------------------------------------------------------------- */

export const ESTADO_ACUERDO = { propuesto: 'Propuesto', vigente: 'Vigente', sustituido: 'Sustituido', rechazado: 'Rechazado' };
export const TIPOS_CONCEPTO = { porcentaje: '% sobre el precio', fijo: '€ por evento', por_unidad: '€ por unidad', ninguna: 'Sin comisión' };

const conceptos = a => (Array.isArray(a?.condiciones?.conceptos) ? a.condiciones.conceptos : []);
const textoDe = a => (typeof a?.condiciones?.texto === 'string' ? a.condiciones.texto
  : a?.condiciones && !a.condiciones.conceptos ? JSON.stringify(a.condiciones, null, 2) : '');
const leerConcepto = c => `${c.concepto}: ${c.tipo === 'ninguna' ? 'sin comisión' : `${c.valor ?? '?'}${c.tipo === 'porcentaje' ? ' %' : ' €'}${c.tipo === 'por_unidad' && c.unidad ? ` por ${c.unidad}` : c.tipo === 'fijo' ? ' por evento' : ''}`}${c.notas ? ` (${c.notas})` : ''}`;

/* Qué cambia de una versión a otra: los conceptos uno a uno y el texto por
   líneas. Es lo que se mira antes de firmar. */
export function diferencias(antes, ahora) {
  const cambios = [];
  const a = new Map(conceptos(antes).map(c => [String(c.concepto).toLowerCase(), c]));
  const b = new Map(conceptos(ahora).map(c => [String(c.concepto).toLowerCase(), c]));
  for (const [k, c] of b) {
    if (!a.has(k)) { cambios.push({ tipo: 'nuevo', texto: leerConcepto(c) }); } else if (leerConcepto(a.get(k)) !== leerConcepto(c)) {
      cambios.push({ tipo: 'cambia', texto: `${leerConcepto(a.get(k))} → ${leerConcepto(c)}` });
    }
  }
  for (const [k, c] of a) { if (!b.has(k)) { cambios.push({ tipo: 'quita', texto: leerConcepto(c) }); } }
  const la = textoDe(antes).split('\n').map(s => s.trim()).filter(Boolean);
  const lb = textoDe(ahora).split('\n').map(s => s.trim()).filter(Boolean);
  for (const l of lb) { if (!la.includes(l)) { cambios.push({ tipo: 'nuevo', texto: l }); } }
  for (const l of la) { if (!lb.includes(l)) { cambios.push({ tipo: 'quita', texto: l }); } }
  for (const k of ['vigente_desde', 'vigente_hasta']) {
    if ((antes?.condiciones?.[k] || '') !== (ahora?.condiciones?.[k] || '')) {
      cambios.push({ tipo: 'cambia', texto: `${k === 'vigente_desde' ? 'Desde' : 'Hasta'}: ${antes?.condiciones?.[k] || '—'} → ${ahora?.condiciones?.[k] || '—'}` });
    }
  }
  return cambios;
}

const SIGNO = { nuevo: '+', quita: '−', cambia: '~' };

export function historialAcuerdos(acuerdos, { admin, recargar, mensajes = [], yo, nombres, partnerId }) {
  if (!acuerdos.length) { return h('p', {}, 'Aún no hay ningún acuerdo por escrito.'); }
  const porId = new Map(acuerdos.map(a => [a.id, a]));
  return h('ol', { class: 'portal__acuerdos', reversed: true }, acuerdos.map(a => {
    const base = porId.get(a.basado_en) || acuerdos.filter(x => x.version < a.version && x.estado !== 'rechazado').sort((x, y) => y.version - x.version)[0];
    const dif = base ? diferencias(base, a) : null;
    const yaFirmado = admin ? a.validado_por : a.aceptado_por;
    const hilo = mensajes.filter(m => m.ref === a.id);
    return h('li', { class: 'portal__acuerdo', 'data-estado': a.estado },
      h('p', {}, h('strong', {}, `Versión ${a.version} · ${ESTADO_ACUERDO[a.estado] || a.estado}`),
        a.resumen ? ` · ${a.resumen}` : '',
        base ? h('span', { class: 'form__note' }, ` (parte de la versión ${base.version})`) : null),
      conceptos(a).length ? h('ul', { class: 'portal__conceptos' }, conceptos(a).map(c => h('li', {}, leerConcepto(c)))) : null,
      textoDe(a) ? h('pre', { class: 'portal__condiciones' }, textoDe(a)) : null,
      dif ? h('details', { open: a.estado === 'propuesto' ? true : null },
        h('summary', {}, `Qué cambia respecto a la versión ${base.version} (${dif.length})`),
        dif.length ? h('ul', { class: 'portal__diff' }, dif.map(d => h('li', { 'data-tipo': d.tipo }, `${SIGNO[d.tipo]} ${d.texto}`)))
          : h('p', { class: 'form__note' }, 'Nada: es igual.')) : null,
      h('p', { class: 'form__note' }, [
        `Propuesto el ${fecha(a.creado_en)}`,
        `aceptado por el partner: ${a.aceptado_en ? fecha(a.aceptado_en) : 'no'}`,
        `validado por Events Penedès: ${a.validado_en ? fecha(a.validado_en) : 'no'}`,
        a.vigente_desde ? `vigente desde el ${fecha(a.vigente_desde)}${a.vigente_hasta ? ` hasta el ${fecha(a.vigente_hasta)}` : ''}` : null,
        a.rechazado_en ? `rechazado el ${fecha(a.rechazado_en)}${a.motivo ? `: «${a.motivo}»` : ''}` : null,
      ].filter(Boolean).join(' · ')),
      a.estado === 'propuesto' ? h('div', { class: 'portal__botones' },
        !yaFirmado ? boton(admin ? 'Validar' : 'Aceptar', async () => {
          const r = ok(await sb.rpc('firmar_acuerdo', { acuerdo: a.id }));
          await aZoho(admin ? {} : { ref: a.id });
          decir(r === 'vigente' ? 'Acuerdo vigente: sustituye al anterior.' : 'Firmado. Falta la otra parte.', 'ok');
          await recargar();
        }, 'primary') : h('span', { class: 'form__note' }, 'Ya lo has firmado. Falta la otra parte.'),
        h('details', {}, h('summary', {}, 'Rechazar'), formMotivo('Por qué (queda en el historial)', async t => {
          ok(await sb.rpc('rechazar_propuesta', { acuerdo: a.id, motivo: t }));
          await aZoho(admin ? {} : { ref: a.id });
          decir('Rechazado. Se puede proponer otra versión.', 'ok');
          await recargar();
        }))) : null,
      h('details', {}, h('summary', {}, `Comentarios de esta versión (${hilo.length})`),
        lineaDeTiempo(hilo, { admin, yo, nombres }),
        formComentario({ partnerId: partnerId || a.partner_id, sobre: 'acuerdo', ref: a.id, admin, recargar })));
  }));
}

/* Proponer una versión nueva. Parte de la vigente: se cambia lo que haga falta
   y el historial dice qué ha cambiado. */
export function formAcuerdo({ partnerId, acuerdos, recargar, admin }) {
  const vigente = acuerdos.find(a => a.estado === 'vigente');
  const resumen = h('input', { maxlength: 300, placeholder: 'Qué cambia en dos palabras', required: true });
  const desde = h('input', { type: 'date', value: vigente?.condiciones?.vigente_desde || '' });
  const hasta = h('input', { type: 'date', value: vigente?.condiciones?.vigente_hasta || '' });
  const texto = h('textarea', { rows: 4, maxlength: 4000 }, textoDe(vigente));
  const filas = h('tbody');
  const fila = (c = {}) => {
    const tipo = h('select', {}, Object.entries(TIPOS_CONCEPTO).map(([k, v]) => h('option', { value: k, selected: (c.tipo || 'porcentaje') === k ? true : null }, v)));
    const tr = h('tr', {},
      h('td', {}, h('input', { 'data-c': 'concepto', value: c.concepto || '', placeholder: 'Visitas y catas', 'aria-label': 'Concepto' })),
      h('td', {}, tipo),
      h('td', {}, h('input', { 'data-c': 'valor', type: 'number', step: '0.01', min: 0, value: c.valor ?? '', 'aria-label': 'Valor' })),
      h('td', {}, h('input', { 'data-c': 'unidad', value: c.unidad || '', placeholder: 'persona', 'aria-label': 'Unidad' })),
      h('td', {}, h('input', { 'data-c': 'notas', value: c.notas || '', 'aria-label': 'Notas' })),
      h('td', {}, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => tr.remove(), 'aria-label': 'Quitar' }, '×')));
    tipo.setAttribute('data-c', 'tipo');
    filas.append(tr);
  };
  for (const c of conceptos(vigente)) { fila(c); }
  if (!conceptos(vigente).length) { fila(); }
  return h('form', { class: 'form portal__nuevo-acuerdo', onsubmit: intentar(async ev => {
    ev.preventDefault();
    const lista = [...filas.querySelectorAll('tr')].map(tr => {
      const c = {};
      for (const el of tr.querySelectorAll('[data-c]')) { const v = el.value.trim(); if (v !== '') { c[el.dataset.c] = el.dataset.c === 'valor' ? Number(v) : v; } }
      return c;
    }).filter(c => c.concepto);
    if (!lista.length && !texto.value.trim()) { throw new Error('Pon al menos un concepto o el texto de las condiciones.'); }
    const condiciones = { conceptos: lista, texto: texto.value.trim() || undefined, vigente_desde: desde.value || undefined, vigente_hasta: hasta.value || undefined };
    const { data: u } = await sb.auth.getUser();
    const nuevo = ok(await sb.from('acuerdos').insert({ partner_id: partnerId, version: 0, condiciones, resumen: resumen.value.trim(), propuesto_por: u.user.id }).select('id').single());
    await aZoho(admin ? {} : { ref: nuevo.id });
    decir(admin ? 'Versión propuesta: el partner la ve y la acepta desde su panel.' : 'Propuesta enviada. Está vigente cuando la firmamos las dos partes.', 'ok');
    await recargar();
  }) },
  h('p', {}, vigente ? `Parte de la versión ${vigente.version}, la vigente. Cambia lo que haga falta.` : 'Primera versión del acuerdo.'),
  campo('Resumen', resumen),
  h('table', { class: 'portal__tabla portal__tabla--edita' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Concepto'), h('th', {}, 'Cómo'), h('th', {}, 'Valor'), h('th', {}, 'Unidad'), h('th', {}, 'Notas'), h('th', {}, ''))),
    filas),
  h('p', {}, h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => fila() }, 'Añadir concepto')),
  campo('Condiciones por escrito', texto), campo('Vale desde', desde), campo('Hasta', hasta, 'Vacío: hasta que haya otra versión.'),
  h('p', {}, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Proponer esta versión')));
}

/* --- Lo que el partner tiene con nosotros ------------------------------------------- */

export function herramientas({ partner, ficha, acuerdos, reservas, leads, vistas }) {
  const vigente = acuerdos.find(a => a.estado === 'vigente');
  const publica = ficha?.datos?.autoriza === 'si' && partner.estado === 'activo';
  const items = [
    [publica, 'Página propia en eventspenedes.com', publica ? h('a', { href: `/partners/${partner.codigo}` }, `/partners/${partner.codigo}`) : 'Se publica cuando la ficha está aprobada y autorizada.'],
    [true, 'Enlace propio para traer clientes', h('code', {}, `eventspenedes.com/r/${partner.codigo}`)],
    [true, 'Visitas y clics de su página', `${vistas} visitas en 30 días`],
    [leads > 0, 'Leads que nos trae, sin datos del cliente', `${leads}`],
    [reservas > 0, 'Reservas pedidas y confirmadas en el portal', `${reservas}`],
    [Boolean(vigente), 'Acuerdo por escrito con historial de versiones', vigente ? `versión ${vigente.version} vigente` : 'sin acuerdo vigente'],
    [Boolean(ficha?.version), 'Ficha y fotos que actualiza el propio partner', ficha?.version ? `versión ${ficha.version}` : 'sin ficha aprobada'],
    [true, 'Importar su web o su catálogo en PDF a la ficha', 'desde «Editar mi ficha»'],
  ];
  return h('ul', { class: 'portal__herramientas' }, items.map(([hecho, que, como]) =>
    h('li', { 'data-hecho': hecho ? 'si' : 'no' }, h('span', { 'aria-hidden': 'true' }, hecho ? '✓ ' : '○ '), h('strong', {}, que), ' · ', como)));
}
