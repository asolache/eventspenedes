/* =============================================================================
   Events Penedès — comportamiento común a todas las páginas
   Los idiomas ya no se cambian en el navegador: cada idioma es una URL propia
   generada por tools/build-i18n.mjs. Aquí solo queda lo que necesita JavaScript.
   ========================================================================== */
(function () {
  'use strict';

  /* El correo no viaja en claro en el HTML: se compone en el navegador.
     Los recolectores de direcciones que no ejecutan JS no lo ven. */
  function revealMail() {
    var links = document.querySelectorAll('.js-mail[data-m]');
    for (var i = 0; i < links.length; i++) {
      var token = links[i].getAttribute('data-m');
      var addr;
      try {
        addr = atob(token.split('').reverse().join(''));
      } catch (e) {
        continue;
      }
      links[i].textContent = addr;
      links[i].setAttribute('href', 'mailto:' + addr + '?subject=' +
        encodeURIComponent('Consulta desde eventspenedes.com'));
    }
  }

  /* El formulario viaja con el idioma de la página, para saber cómo responder */
  function marcarIdioma() {
    var campo = document.querySelector('input[name="idioma"]');
    if (campo) { campo.value = document.documentElement.lang || 'es'; }
  }

  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('nav');
    if (!toggle || !nav) { return; }

    toggle.addEventListener('click', function () {
      var open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });

    nav.addEventListener('click', function (ev) {
      if (ev.target.tagName === 'A') {
        nav.setAttribute('data-open', 'false');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function init() {
    revealMail();
    marcarIdioma();
    initNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
