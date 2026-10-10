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

  /* De dónde llegó quien escribe: la primera página que vio en esta visita,
     la web que le trajo y la campaña, si la hay. Va en el campo `origen` del
     formulario y acaba en la ficha del CRM. Sin cookies: sessionStorage se
     borra al cerrar la pestaña. */
  function marcarOrigen() {
    var clave = 'ep-origen', origen = null;
    try { origen = sessionStorage.getItem(clave); } catch (e) { /* sin almacenamiento */ }
    if (!origen) {
      var partes = ['página ' + location.pathname];
      var ref = '';
      try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) { ref = ''; }
      if (ref && ref !== location.hostname) { partes.push('desde ' + ref); }
      var q = new URLSearchParams(location.search);
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
        var v = q.get(k);
        if (v) { partes.push(k.slice(4) + ' ' + v.slice(0, 60)); }
      });
      origen = partes.join(' · ');
      try { sessionStorage.setItem(clave, origen); } catch (e) { /* sin almacenamiento */ }
    }
    var campos = document.querySelectorAll('input[name="origen"]');
    for (var i = 0; i < campos.length; i++) { campos[i].value = origen; }
  }

  /* Un enlace puede llegar con el tipo ya elegido (?tipo=dj desde la página
     de DJ): se marca solo si el formulario tiene esa opción. */
  function preseleccionar() {
    var tipo = new URLSearchParams(location.search).get('tipo');
    var sel = document.querySelector('#form-contacto select[name="tipo"]');
    if (!tipo || !sel) { return; }
    for (var i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value === tipo) { sel.value = tipo; return; }
    }
  }

  /* Un programa de ejemplo llega como ?exp=castells,dj&duracion=…: se marcan
     las casillas y los desplegables que existan, y nada más. */
  function rellenarPrograma() {
    var form = document.getElementById('form-propuesta');
    if (!form) { return; }
    var q = new URLSearchParams(location.search);
    (q.get('exp') || '').split(',').forEach(function (x) {
      var c = /^[a-z_]+$/.test(x) ? form.querySelector('input[name="exp_' + x + '"]') : null;
      if (c) { c.checked = true; }
    });
    ['duracion', 'movilidad'].forEach(function (k) {
      var sel = form.querySelector('select[name="' + k + '"]'), v = q.get(k);
      if (!sel || !v) { return; }
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === v) { sel.value = v; }
      }
    });
  }

  /* La valoración: el enlace del QR trae el evento (?e=…) y, al enviar,
     vuelve a la misma página con ?enviada=1. */
  function valoracion() {
    var form = document.getElementById('form-valoracion');
    if (!form) { return; }
    var q = new URLSearchParams(location.search);
    if (q.get('enviada')) {
      form.closest('section').hidden = true;
      document.getElementById('enviada').hidden = false;
      return;
    }
    var e = (q.get('e') || '').slice(0, 120);
    if (e) { form.querySelector('input[name="evento"]').value = e; }
  }

  /* Kit para agencias: cada botón copia el texto de su tarjeta */
  function initCopiar() {
    var botones = document.querySelectorAll('.js-copiar');
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function (ev) {
        var b = ev.currentTarget;
        var t = b.closest('article').querySelector('.kit__texto');
        if (!t || !navigator.clipboard) { return; }
        navigator.clipboard.writeText(t.textContent.trim()).then(function () {
          b.setAttribute('data-copiado', 'true');
          setTimeout(function () { b.removeAttribute('data-copiado'); }, 1500);
        });
      });
    }
  }

  /* La cita en la agenda solo aparece si hay una página de reservas puesta
     en data-agenda. Sin ella, la página de gracias queda como estaba. */
  function mostrarAgenda() {
    var bloque = document.querySelector('[data-agenda]');
    if (!bloque) { return; }
    var url = bloque.getAttribute('data-agenda');
    var enlace = bloque.querySelector('a.js-agenda');
    if (!/^https:\/\//.test(url) || !enlace) { return; }
    enlace.setAttribute('href', url);
    bloque.hidden = false;
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
    marcarOrigen();
    preseleccionar();
    rellenarPrograma();
    valoracion();
    initCopiar();
    mostrarAgenda();
    initNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
