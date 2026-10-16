/* =============================================================================
   Events Penedès — el buscador de la app (/acceso)

   Arriba, siempre a mano, como en una tienda: busca en todas las vistas a la
   vez (nombres de sección, tarjetas, filas de tabla, cifras) y lleva a lo
   encontrado. Combobox de WAI-ARIA 1.2: flechas, Intro y Escape; «/» o
   Ctrl+K para empezar a escribir. Lo que busca está en portal-buscar-datos.js.
   ========================================================================== */
import { h } from './portal-ui.js';
import { buscar } from './portal-buscar-datos.js';

const PIEZAS = '.app-card > h3, .app-kpi, .app-tabla tbody tr, .app-tareas li, .app-plan h3, details > summary, .app-fila';

/* Las celdas de una fila y la cifra de un KPI, separadas: «Catering · Por fijar» */
const limpio = n => n.textContent.replace(/\s+/g, ' ').trim();
const leer = el => (el.matches('tr, .app-kpi, .app-tareas li') ? [...el.children].filter(c => !c.matches('button, .btn')).map(limpio).filter(Boolean).join(' · ') : limpio(el));

/* Lo que se puede encontrar, leído de las vistas tal como están ahora */
function indexar(vistas, secciones) {
  const out = [];
  for (const v of vistas) {
    out.push({ vista: v.id, titulo: v.titulo, texto: `${v.titulo} ${v.corto || ''} ${v.grupo || ''}`, peso: 3 });
    for (const el of secciones[v.id].querySelectorAll(PIEZAS)) {
      const texto = leer(el);
      if (texto) { out.push({ vista: v.id, titulo: v.titulo, texto: texto.slice(0, 140), el }); }
    }
  }
  return out;
}

export function buscador({ clave, vistas, secciones, ir }) {
  const idLista = `${clave}-buscar-lista`;
  const entrada = h('input', {
    type: 'search', id: `${clave}-buscar`, autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Buscar reservas, clientes, cobros…', role: 'combobox',
    'aria-expanded': 'false', 'aria-controls': idLista, 'aria-autocomplete': 'list',
  });
  const lista = h('ul', { class: 'app-buscar__lista', id: idLista, role: 'listbox', hidden: true, 'aria-label': 'Resultados' });
  const caja = h('form', { class: 'app-buscar', role: 'search', onsubmit: ev => { ev.preventDefault(); elegir(activo < 0 ? 0 : activo); } },
    h('label', { class: 'app-sr', for: entrada.id }, 'Buscar en el panel'), entrada,
    h('kbd', { class: 'app-buscar__tecla', 'aria-hidden': 'true' }, '/'), lista);
  let res = [], activo = -1;

  const cerrar = () => { lista.hidden = true; entrada.setAttribute('aria-expanded', 'false'); entrada.removeAttribute('aria-activedescendant'); activo = -1; };
  const marcar = i => {
    activo = i;
    [...lista.children].forEach((li, k) => li.setAttribute('aria-selected', String(k === i)));
    if (i >= 0 && lista.children[i]) { entrada.setAttribute('aria-activedescendant', lista.children[i].id); lista.children[i].scrollIntoView({ block: 'nearest' }); }
  };
  function elegir(i) {
    const r = res[i];
    if (!r) { return; }
    cerrar();
    entrada.value = '';
    ir(r.vista);
    if (r.el) {
      const el = r.el.closest('tr, li, .app-card, .app-kpi, details') || r.el;
      if (el.tagName === 'DETAILS') { el.open = true; }
      el.scrollIntoView({ block: 'center' });
      el.classList.add('app-encontrado');
      setTimeout(() => el.classList.remove('app-encontrado'), 1600);
    }
  }
  entrada.addEventListener('input', () => {
    res = buscar(indexar(vistas, secciones), entrada.value);
    lista.replaceChildren(...(res.length ? res.map((r, i) => h('li', {
      id: `${idLista}-${i}`, role: 'option', 'aria-selected': 'false',
      onmousedown: ev => { ev.preventDefault(); elegir(i); },
    }, h('span', { class: 'app-buscar__que' }, r.el ? r.texto : r.titulo), h('span', { class: 'app-buscar__donde' }, r.el ? r.titulo : 'Ir a la sección')))
      : entrada.value.trim() ? [h('li', { class: 'app-buscar__nada', role: 'option', 'aria-disabled': 'true' }, 'Nada con eso. Prueba con otra palabra.')] : []));
    const hay = lista.children.length > 0;
    lista.hidden = !hay;
    entrada.setAttribute('aria-expanded', String(hay));
    marcar(res.length ? 0 : -1);
  });
  entrada.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown' && res.length) { ev.preventDefault(); marcar((activo + 1) % res.length); }
    else if (ev.key === 'ArrowUp' && res.length) { ev.preventDefault(); marcar((activo - 1 + res.length) % res.length); }
    else if (ev.key === 'Escape') { if (!lista.hidden) { ev.preventDefault(); cerrar(); } else { entrada.blur(); } }
  });
  entrada.addEventListener('blur', () => setTimeout(cerrar, 100));
  return { caja, entrada };
}

/* «/» o Ctrl+K: al buscador de la app que se ve, si no se está escribiendo ya */
document.addEventListener('keydown', ev => {
  const escribiendo = ev.target.closest?.('input, textarea, select, [contenteditable="true"]');
  if ((ev.key === '/' && !escribiendo) || (ev.key.toLowerCase() === 'k' && (ev.ctrlKey || ev.metaKey))) {
    const e = [...document.querySelectorAll('.app-buscar input')].find(x => x.offsetParent !== null);
    if (e) { ev.preventDefault(); e.focus(); }
  }
});
