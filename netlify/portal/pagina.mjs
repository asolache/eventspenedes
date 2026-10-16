/* =============================================================================
   Events Penedès · el armazón de las páginas que monta el servidor

   Las páginas de los partners, el blog y la agenda salen enteras de una
   función, con la cabecera y el pie del sitio, sus metadatos y sus datos
   estructurados, para que buscadores y asistentes de IA las lean sin ejecutar
   nada.
   ========================================================================== */
import { CABECERA, PIE } from './marco.mjs';

export const SITIO = 'https://eventspenedes.com';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Dentro de <script type="application/ld+json">, «</» cerraría la etiqueta */
export const ld = o => JSON.stringify(o).replace(/</g, '\\u003c');
export const recorta = (t, n) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n - 1)) + '…');

/* `og`: 'website' o 'article'; `cabeza`: etiquetas de más para el <head> (ya escapadas) */
export function pagina({ titulo, descripcion, canonica, imagen, estructurados, cuerpo, indexar = true, og = 'website', cabeza = '' }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(canonica)}">
<meta name="robots" content="${indexar ? 'index, follow, max-snippet:-1, max-image-preview:large' : 'noindex'}">
<meta property="og:type" content="${og}">
<meta property="og:url" content="${esc(canonica)}">
<meta property="og:site_name" content="Events Penedès">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:image" content="${esc(imagen || `${SITIO}/assets/og-image.png`)}">
<meta property="og:locale" content="es_ES">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/assets/icon-256.png" sizes="256x256">
<meta name="theme-color" content="#050507">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/css/styles.css">
<link rel="alternate" type="application/rss+xml" title="Blog de Events Penedès" href="${SITIO}/blog/feed.xml">${cabeza}
${estructurados.map(o => `<script type="application/ld+json">${ld(o)}</script>`).join('\n')}
</head>
<body>
<a class="skip-link" href="#main">Ir al contenido principal</a>
${CABECERA}
<main id="main">
${cuerpo}
</main>
${PIE}
<script src="/js/site.js" defer></script>
</body>
</html>`;
}

export function migas(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], i) => ({ '@type': 'ListItem', position: i + 1, name, item })),
  };
}

