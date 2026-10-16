/* =============================================================================
   Events Penedès — los planes del canal y el asistente de IA en el portal

   Los planes (ficha, página, web propia) y su cuota salen de data/planes.json:
   nada se teclea dos veces. El plan de cada partner está en la base de datos
   y solo lo cambia administración; el partner lo pide en la conversación.

   El asistente escribe con Claude el párrafo de presentación a partir de lo
   publicable de la ficha (ver netlify/portal/ia.mjs). Lo que propone no se
   publica solo: el partner lo usa y queda como un cambio por revisar.
   ========================================================================== */
import { sb, proponer } from './portal-cliente.js';
import { h, ok, intentar, decir, api, aZoho, boton } from './portal-ui.js';
import { icono, tarjeta, chip } from './portal-app.js';

let cache = null;
export async function planes() {
  if (!cache) {
    cache = fetch('/data/planes.json', { cache: 'no-cache' }).then(r => {
      if (!r.ok) { throw new Error('No se han podido leer los planes'); }
      return r.json();
    }).catch(e => { cache = null; throw e; });
  }
  return cache;
}

const euros = n => `${Number(n).toLocaleString('es-ES')} €`;
export const nombrePlan = (datos, id) => datos.planes.find(p => p.id === id)?.nombre || id;

/* Las tres tarjetas. `actual` marca el plan del partner; `pedir(plan)`, si
   llega, pone el botón para pedir el cambio. */
export function tarjetasPlanes(datos, { actual = null, tester = false, pedir = null } = {}) {
  const iva = datos.iva_incluido ? 'IVA incluido' : 'sin IVA';
  const oferta = datos.oferta_testers;
  return h('div', { class: 'app-planes' }, datos.planes.map(pl => h('article', { class: 'app-plan', 'data-actual': pl.id === actual ? 'si' : null },
    pl.id === actual ? h('span', { class: 'app-plan__marca' }, chip(tester ? 'Tu plan · tester' : 'Tu plan', 'oro')) : null,
    h('h3', {}, pl.nombre),
    h('p', { class: 'app-plan__precio' }, pl.precio_mes ? euros(pl.precio_mes) : 'Gratis',
      pl.precio_mes ? h('small', {}, ` al mes, ${iva}`) : null),
    pl.precio_ano ? h('p', { class: 'app-nota' }, `o ${euros(pl.precio_ano)} al año${pl.alta ? `; el alta, ${pl.alta}` : ''}`) : null,
    pl.precio_mes && oferta ? h('p', { class: 'app-nota' }, oferta.precio_mes !== null && oferta.precio_mes !== undefined
      ? `Primeros ${oferta.plazas} partners: ${euros(oferta.precio_mes)} al mes.`
      : `Precio de lanzamiento para los primeros ${oferta.plazas} partners.`) : null,
    h('p', {}, pl.resumen),
    h('ul', {}, pl.incluye.map(x => h('li', {}, x))),
    pedir && pl.id !== actual ? h('button', { class: `btn ${pl.precio_mes ? 'btn--primary' : 'btn--ghost'}`, type: 'button', onclick: intentar(() => pedir(pl)) },
      pl.precio_mes ? `Quiero el plan ${pl.nombre}` : 'Volver a la ficha gratis') : null)));
}

/* La vista «Tu plan» de un partner */
export async function vistaPlan(p, { recargar }) {
  const datos = await planes();
  const oferta = datos.oferta_testers;
  const pedir = async pl => {
    const texto = `Quiero pasar al plan ${pl.nombre}${pl.precio_mes ? ` (${euros(pl.precio_mes)} al mes)` : ''}. ¿Me contáis cómo seguimos?`;
    const id = ok(await sb.rpc('comentar', { p_partner: p.id, p_texto: texto, p_sobre: 'general', p_ref: null, p_interno: false }));
    await aZoho({ mensaje: id });
    decir(`Te escribimos para pasarte al plan ${pl.nombre}. Lo verás en la conversación.`, 'ok');
    await recargar();
  };
  return [
    oferta ? h('div', { class: 'app-card app-card--oro app-oferta' }, icono('regalo'),
      h('div', {}, h('h3', {}, p.tester ? 'Eres uno de nuestros primeros partners' : `Oferta para los ${oferta.plazas} primeros`),
        h('p', {}, oferta.texto))) : null,
    tarjetasPlanes(datos, { actual: p.plan || 'ficha', tester: p.tester, pedir }),
    h('p', { class: 'app-nota' }, `Cuotas ${datos.iva_incluido ? 'con' : 'sin'} IVA${datos.provisional ? ', de lanzamiento' : ''}. Puedes cambiar de plan cuando quieras: escríbenos y lo hacemos.`),
  ];
}

/* El asistente de IA para la descripción. `datos` es la ficha en curso. */
export function asistenteDescripcion(p, datos, { recargar, admin = false }) {
  const salida = h('p', { class: 'app-ia__salida', hidden: true });
  const falta = h('ul', { class: 'app-nota', hidden: true });
  const coste = h('p', { class: 'app-ia__coste', hidden: true });
  const usar = h('button', { class: 'btn btn--primary', type: 'button', hidden: true });
  const caja = h('div', { class: 'app-card app-ia' },
    h('div', { class: 'app-ia__cab' }, icono('ia'), h('h3', {}, 'Asistente de IA')),
    h('p', { class: 'app-nota' }, admin
      ? 'Propone el párrafo de presentación de este partner con lo publicable de su ficha. No ve precios, contactos ni condiciones.'
      : 'Te propone el párrafo con el que te presentamos a los clientes, a partir de tu ficha. No ve tus precios ni tus contactos. Si te gusta, lo usas y lo revisamos antes de publicarlo.'),
    datos.descripcion ? h('details', {}, h('summary', {}, 'La descripción de ahora'), h('p', {}, datos.descripcion)) : null,
    salida, falta, coste,
    h('div', { class: 'app-fila' },
      boton('Proponer una descripción', async () => {
        caja.setAttribute('aria-busy', 'true');
        salida.hidden = false;
        salida.textContent = 'Escribiendo…';
        try {
          const r = await api('/api/portal/ia', { method: 'POST', body: { partner: p.id, accion: 'descripcion' } });
          salida.textContent = r.descripcion;
          falta.replaceChildren(...(r.falta || []).map(x => h('li', {}, x)));
          falta.hidden = !r.falta?.length;
          if (falta.childElementCount) { falta.prepend(h('li', { class: 'app-nota' }, 'Quedaría mejor si tu ficha dijera:')); }
          coste.textContent = r.coste_usd !== null && r.coste_usd !== undefined ? `Coste de esta propuesta: ${Number(r.coste_usd).toFixed(3)} USD` : '';
          coste.hidden = !admin || !coste.textContent;
          usar.hidden = false;
        } catch (e) {
          salida.hidden = true;
          throw e;
        } finally { caja.removeAttribute('aria-busy'); }
      }, 'ghost'),
      usar));
  usar.textContent = 'Usar este texto';
  usar.addEventListener('click', intentar(async () => {
    await proponer(p.id, { ...datos, descripcion: salida.textContent });
    decir('Descripción guardada. Queda pendiente de revisión.', 'ok');
    await recargar();
  }));
  return caja;
}

export const tarjetaPlan = (datos, p) => tarjeta('Tu plan',
  h('p', {}, h('strong', {}, nombrePlan(datos, p.plan || 'ficha')), p.tester ? ' · ' : '', p.tester ? chip('tester', 'oro') : null));
