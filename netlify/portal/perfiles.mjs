/* =============================================================================
   Events Penedès · las dos preguntas que llevan a teamtowershuma.com

   Pedido por Álvaro (14/11/2026): en la agenda y en las fichas de espacio,
   «¿Tienes un negocio en el Penedès?» y «¿Organizas para un equipo?», cada una
   con su perfil (`?perfil=negocio|empresa&de=ep`). teamtowershuma.com lee el
   perfil y la marca que enlaza (SOS/lib/recorrido.js) y lleva a cada uno a su
   camino: el negocio a su espacio, la empresa al catálogo para equipos.

   Los clics se cuentan como los demás botones del sitio: `data-clic` y
   /api/clic (netlify/functions/clic.mjs), sin cookies ni datos de la persona.
   Una sola pieza para las dos páginas: el texto y los enlaces no se repiten.
   ========================================================================== */

const WEB = 'https://teamtowershuma.com';

export const PERFILES = [
  { perfil: 'negocio', clic: 'tth-negocio', texto: '¿Tienes un negocio en el Penedès?',
    href: `${WEB}/cliente/?perfil=negocio&de=ep#alrededor` },
  { perfil: 'empresa', clic: 'tth-empresa', texto: '¿Organizas para un equipo?',
    href: `${WEB}/cataleg?s=empresa&perfil=empresa&de=ep` },
];

const attr = s => s.replace(/&/g, '&amp;');

/* `id` distingue el título si la pieza sale más de una vez en la misma página */
export function bloquePerfiles({ id = 't-perfiles', clase = '' } = {}) {
  return `
      <nav class="perfiles${clase ? ` ${clase}` : ''}" aria-labelledby="${id}">
        <h2 id="${id}" class="visually-hidden">Más allá del evento</h2>
        <ul class="perfiles__lista">${PERFILES.map(p => `
          <li><a class="perfiles__enlace" href="${attr(p.href)}" data-clic="${p.clic}" target="_blank" rel="noopener">${p.texto}<span class="visually-hidden"> (se abre en otra web)</span><span aria-hidden="true"> ↗</span></a></li>`).join('')}
        </ul>
      </nav>`;
}
