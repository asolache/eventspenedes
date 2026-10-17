/* =============================================================================
   Events Penedès · tema claro u oscuro

   Va en el <head> de todas las páginas, sin defer, para que el color esté
   puesto antes de pintar y no se vea un parpadeo oscuro al abrir en claro.
   El oscuro es el de la casa. Si el visitante ha elegido, se recuerda en su
   navegador (localStorage, nada de cookies); si no, se sigue el del sistema.
   Al cargar la página pone el botón al final de la cabecera.
   ========================================================================== */
(function () {
  var CLAVE = 'ep-tema';
  var raiz = document.documentElement;
  var claroSistema = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  var TEXTOS = {
    es: { claro: 'Cambiar a fondo claro', oscuro: 'Cambiar a fondo oscuro' },
    ca: { claro: 'Canviar a fons clar', oscuro: 'Canviar a fons fosc' },
    en: { claro: 'Switch to light background', oscuro: 'Switch to dark background' },
  };

  function elegido() {
    try { return localStorage.getItem(CLAVE); } catch (e) { return null; }
  }

  function actual() {
    return raiz.getAttribute('data-tema') === 'claro' ? 'claro' : 'oscuro';
  }

  function aplica(tema) {
    if (tema === 'claro') { raiz.setAttribute('data-tema', 'claro'); }
    else { raiz.removeAttribute('data-tema'); }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', tema === 'claro' ? '#ffffff' : '#050507'); }
    var boton = document.querySelector('.tema');
    if (boton) { rotula(boton); }
  }

  function rotula(boton) {
    var t = TEXTOS[(raiz.lang || 'es').slice(0, 2)] || TEXTOS.es;
    var texto = actual() === 'claro' ? t.oscuro : t.claro;
    boton.setAttribute('aria-label', texto);
    boton.setAttribute('title', texto);
  }

  var guardado = elegido();
  aplica(guardado === 'claro' || guardado === 'oscuro' ? guardado : (claroSistema && claroSistema.matches ? 'claro' : 'oscuro'));

  // Mientras no haya elegido, si cambia el del sistema, cambia la página
  if (claroSistema && claroSistema.addEventListener) {
    claroSistema.addEventListener('change', function (e) {
      if (!elegido()) { aplica(e.matches ? 'claro' : 'oscuro'); }
    });
  }

  function ponBoton() {
    var cabecera = document.querySelector('.site-header__inner');
    if (!cabecera || cabecera.querySelector('.tema')) { return; }
    var boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'tema';
    boton.innerHTML =
      '<svg class="tema__sol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">'
      + '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      + '<svg class="tema__luna" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>';
    rotula(boton);
    boton.addEventListener('click', function () {
      var nuevo = actual() === 'claro' ? 'oscuro' : 'claro';
      try { localStorage.setItem(CLAVE, nuevo); } catch (e) { /* sin almacenamiento: vale para esta página */ }
      aplica(nuevo);
    });
    cabecera.appendChild(boton);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', ponBoton); }
  else { ponBoton(); }
})();
