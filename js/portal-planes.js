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
import { h, ok, intentar, decir, api, aZoho, boton, fecha } from './portal-ui.js';
import { icono, tarjeta, chip, kpis, extras } from './portal-app.js';

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
  const valor = await valorPlan(p);
  return [
    valor ? tarjetaValor(datos, p, valor) : null,
    p.tester || p.plan !== 'ficha' ? formMejora(p, { recargar }) : null,
    oferta ? h('div', { class: 'app-card app-card--oro app-oferta' }, icono('regalo'),
      h('div', {}, h('h3', {}, p.tester ? 'Eres uno de nuestros primeros partners' : `Oferta para los ${oferta.plazas} primeros`),
        h('p', {}, oferta.texto))) : null,
    tarjetasPlanes(datos, { actual: p.plan || 'ficha', tester: p.tester, pedir }),
    h('p', { class: 'app-nota' }, `Cuotas ${datos.iva_incluido ? 'con' : 'sin'} IVA${datos.provisional ? ', de lanzamiento' : ''}. Puedes cambiar de plan cuando quieras: escríbenos y lo hacemos.`),
  ];
}

/* Lo que el plan le ha dado al partner: solo recuentos, sin costes
   (supabase/migrations/20261020200000_valor_plan.sql) */
export async function valorPlan(p, dias = 30) {
  const { data, error } = await sb.rpc('valor_plan', { p: p.id, dias });
  if (error) { console.error('valor_plan:', error.message); return null; }
  return data;
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

export function tarjetaValor(datos, p, v, { admin = false } = {}) {
  const dePago = p.plan && p.plan !== 'ficha';
  const titulo = admin ? `Últimos ${v.dias} días`
    : dePago ? `Lo que te ha dado tu plan en los últimos ${v.dias} días` : `Lo que ha pasado en los últimos ${v.dias} días`;
  const ia = v.propuestas_ia + v.textos_ia;
  return tarjeta(titulo,
    kpis([
      [admin ? 'Visitas a su página' : 'Visitas a tu página', v.vistas, plural(v.clics, 'clic', 'clics'), 'oro'],
      [admin ? 'Clientes por su enlace' : 'Clientes por tu enlace', v.clientes],
      ['Reservas', v.reservas, `${v.confirmadas} confirmadas`],
      ['Ayuda de la IA', ia, ia ? [v.propuestas_ia ? plural(v.propuestas_ia, 'propuesta', 'propuestas') : null, v.textos_ia ? plural(v.textos_ia, 'texto', 'textos') : null].filter(Boolean).join(' · ') : null],
    ]),
    admin ? null : h('p', { class: 'app-nota' }, dePago
      ? 'Cada cifra sale de lo que pasa en el portal. Si algo no te está sirviendo, cuéntanoslo aquí abajo.'
      : `Con el plan ${nombrePlan(datos, 'pagina')} ves esto cada día y te llegan las peticiones con la respuesta preparada.`));
}

/* Lo que el partner nos pide mejorar llega a la conversación, marcado */
export const PREFIJO_MEJORA = 'Para mejorar el plan: ';
function formMejora(p, { recargar }) {
  const caja = h('textarea', { rows: 3, maxlength: 2000, required: true, placeholder: 'Qué te ahorraría tiempo, qué echas en falta, qué sobra…' });
  return h('form', { class: 'app-card form', onsubmit: intentar(async e => {
    e.preventDefault();
    const texto = caja.value.trim();
    if (!texto) { return; }
    const id = ok(await sb.rpc('comentar', { p_partner: p.id, p_texto: `${PREFIJO_MEJORA}${texto}`, p_sobre: 'general', p_ref: null, p_interno: false }));
    await aZoho({ mensaje: id });
    decir('Gracias. Lo leemos y te contamos qué cambiamos.', 'ok');
    await recargar();
  }) },
  h('h3', {}, p.tester ? 'Qué mejorarías' : 'Cuéntanos qué mejorar'),
  h('p', { class: 'app-nota' }, 'Lo que nos digas decide lo próximo que hacemos en el portal.'),
  h('p', { class: 'field' }, h('label', {}, 'Tu idea', caja)),
  h('p', { class: 'portal__botones' }, h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enviar')));
}

/* En administración: cómo le va a cada partner de pago o tester, para saber
   si el plan le compensa, y lo que nos ha pedido mejorar */
extras.admin.push(async ({ irAPartner }) => {
  const [lista, datos] = await Promise.all([
    sb.from('partners').select('id,codigo,nombre,plan,tester').or('tester.eq.true,plan.neq.ficha').order('nombre').then(ok),
    planes(),
  ]);
  const ideas = lista.length ? ok(await sb.from('mensajes').select('partner_id,texto,creado_en')
    .in('partner_id', lista.map(p => p.id)).like('texto', `${PREFIJO_MEJORA}%`).order('creado_en', { ascending: false })).filter(x => (x.texto || '').startsWith(PREFIJO_MEJORA)) : [];
  const valores = await Promise.all(lista.map(p => valorPlan(p)));
  const plazas = datos.oferta_testers?.plazas;
  const testers = lista.filter(p => p.tester).length;
  return {
    id: 'planes-valor', titulo: 'Partners de pago y testers', corto: 'Testers', icono: 'plan', n: ideas.filter(x => Date.now() - new Date(x.creado_en) < 14 * 864e5).length,
    intro: `Lo que el plan le da a cada partner que paga o prueba${plazas ? ` (${testers} de ${plazas} testers)` : ''}, y lo que nos pide mejorar.`,
    nodos: lista.length ? [h('div', { class: 'app-rejilla' }, lista.map((p, i) => h('div', {},
      h('p', { class: 'app-fila' }, h('strong', {}, p.nombre), chip(nombrePlan(datos, p.plan)), p.tester ? chip('tester', 'oro') : null,
        irAPartner ? h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => irAPartner(p.id) }, 'Abrir') : null),
      valores[i] ? tarjetaValor(datos, p, valores[i], { admin: true }) : null,
      ...ideas.filter(x => x.partner_id === p.id).map(x => h('blockquote', {}, h('p', {}, x.texto.slice(PREFIJO_MEJORA.length)), h('p', { class: 'app-nota' }, `Nos pide mejorar · ${fecha(x.creado_en)}`))))))]
      : [h('p', { class: 'app-vacio' }, 'Ningún partner de pago ni tester todavía.')],
  };
});

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
