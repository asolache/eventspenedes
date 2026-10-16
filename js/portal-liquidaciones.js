/* =============================================================================
   Events Penedès — liquidaciones: lo facturado y cobrado por evento

   Cada fila es una línea de la venta de un evento que toca al partner (ver
   tools/liquidaciones.mjs). El partner la lee; administración la apunta y
   marca cuándo se facturó y cuándo se cobró. Sin comisiones ni márgenes.
   ========================================================================== */
import { sb } from './portal-cliente.js';
import { h, fecha, euros, ok, intentar, decir, campo, boton } from './portal-ui.js';
import { tarjeta, kpis, chip } from './portal-app.js';
import { resumenLiquidaciones } from './portal-liquidaciones-resumen.js';

const QUIEN = { partner: 'Tú al cliente', nosotros: 'Nosotros al cliente' };

export const estadoLinea = f => (f.cobrado_en ? ['Cobrado', 'ok'] : f.facturado_en ? ['Facturado', 'aviso'] : ['Previsto', null]);

export async function vistaLiquidaciones(p, { admin = false, recargar }) {
  const { data, error } = await sb.from('liquidaciones').select('*').eq('partner_id', p.id).order('fecha', { ascending: false, nullsFirst: false });
  if (error) { console.error('liquidaciones:', error); return [h('p', { class: 'app-vacio' }, 'Las liquidaciones no se han podido cargar.')]; }
  const filas = data || [];
  const r = resumenLiquidaciones(filas);
  const marcar = (f, campoFecha) => intentar(async () => {
    ok(await sb.from('liquidaciones').update({ [campoFecha]: new Date().toISOString().slice(0, 10), actualizada_en: new Date().toISOString() }).eq('id', f.id));
    decir(campoFecha === 'cobrado_en' ? 'Marcado como cobrado.' : 'Marcado como facturado.', 'ok');
    await recargar();
  });

  const porEvento = new Map();
  for (const f of filas) {
    if (!porEvento.has(f.evento)) { porEvento.set(f.evento, []); }
    porEvento.get(f.evento).push(f);
  }

  const lista = filas.length
    ? [...porEvento].map(([evento, lineas]) => tarjeta(null,
      h('p', { class: 'app-fila' }, h('strong', {}, lineas[0].fecha ? fecha(lineas[0].fecha) : 'Sin fecha'), h('span', { class: 'app-nota' }, evento)),
      h('div', { class: 'app-desliza' }, h('table', { class: 'app-tabla portal__tabla--tarjetas' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Concepto'), h('th', {}, 'Factura'), h('th', {}, 'Importe'), h('th', {}, 'Estado'), admin ? h('th', {}, '') : null)),
        h('tbody', {}, lineas.map(f => {
          const [est, tono] = estadoLinea(f);
          return h('tr', {},
            h('td', { 'data-c': 'Concepto' }, f.concepto, f.nota ? h('small', { class: 'app-nota', style: 'display:block' }, f.nota) : null),
            h('td', { 'data-c': 'Factura' }, QUIEN[f.factura] || f.factura),
            h('td', { 'data-c': 'Importe' }, f.importe === null ? 'Por fijar' : `${euros(f.importe)}${f.iva_incluido ? ' con IVA' : ''}`),
            h('td', { 'data-c': 'Estado' }, chip(est, tono), f.cobrado_en ? h('small', { class: 'app-nota' }, ` ${fecha(f.cobrado_en)}`) : f.facturado_en ? h('small', { class: 'app-nota' }, ` ${fecha(f.facturado_en)}`) : null),
            admin ? h('td', {}, !f.facturado_en ? boton('Facturado', marcar(f, 'facturado_en')) : !f.cobrado_en ? boton('Cobrado', marcar(f, 'cobrado_en')) : null) : null);
        }))))))
    : [h('p', { class: 'app-vacio' }, admin
      ? 'Ninguna todavía. Se apuntan desde la venta de cada evento o con el formulario de abajo.'
      : 'Todavía no hay eventos con tu parte. Cuando hagamos uno juntos, aquí verás lo facturado y lo cobrado, evento a evento.')];

  return [
    kpis([
      ['Eventos', r.eventos],
      ['Facturado', euros(r.facturado)],
      ['Cobrado', euros(r.cobrado), null, 'ok'],
      ['Por cobrar', euros(r.por_cobrar), null, r.por_cobrar ? 'aviso' : null],
    ]),
    r.sin_importe ? h('p', { class: 'app-nota' }, `${r.sin_importe} línea${r.sin_importe === 1 ? '' : 's'} sin importe todavía: no suma${r.sin_importe === 1 ? '' : 'n'}.`) : null,
    ...lista,
    admin ? formLinea(p, recargar) : null,
  ];
}

function formLinea(p, recargar) {
  const evento = h('input', { name: 'evento', required: true, pattern: '[a-z0-9-]{3,80}', placeholder: '2026-10-10-bellesguart' });
  const fechaEv = h('input', { name: 'fecha', type: 'date' });
  const concepto = h('input', { name: 'concepto', required: true, maxlength: 300, placeholder: 'Catering para 40' });
  const factura = h('select', { name: 'factura' }, h('option', { value: 'partner' }, 'El partner al cliente'), h('option', { value: 'nosotros' }, 'Nosotros al cliente'));
  const importe = h('input', { name: 'importe', type: 'number', min: 0, step: '0.01', placeholder: 'Sin IVA; vacío si no se sabe' });
  const form = h('form', { class: 'form portal__rejilla' },
    campo('Evento (id de la venta)', evento), campo('Fecha', fechaEv), campo('Concepto', concepto),
    campo('Quién factura', factura), campo('Importe', importe),
    h('p', {}, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Apuntar')));
  form.addEventListener('submit', intentar(async e => {
    e.preventDefault();
    ok(await sb.from('liquidaciones').insert({
      partner_id: p.id, evento: evento.value.trim(), fecha: fechaEv.value || null, concepto: concepto.value.trim(),
      factura: factura.value, importe: importe.value === '' ? null : Number(importe.value),
    }));
    decir('Línea apuntada.', 'ok');
    await recargar();
  }));
  return h('details', { class: 'app-card' }, h('summary', {}, 'Apuntar una línea a mano'), form);
}
