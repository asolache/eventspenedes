/* =============================================================================
   Events Penedès — motor de idiomas, correo protegido y navegación
   Sin dependencias. El castellano vive en el HTML de cada página; el catalán y
   el inglés llegan en un fichero js/lang-<página>.js que define window.EP_I18N
   y window.EP_META antes de cargar este.
   ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'ep-lang';
  var DEFAULT = 'es';

  var I18N = window.EP_I18N || {};
  I18N.es = {}; /* se rellena en el arranque leyendo el HTML */

  var META = window.EP_META || {};

  var nodes = [];
  var altNodes = [];

  function collect() {
    var list = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var key = el.getAttribute('data-i18n');
      nodes.push({ el: el, key: key });
      /* Snapshot del castellano tal como está escrito en el HTML */
      if (!(key in I18N.es)) {
        I18N.es[key] = el.innerHTML.trim();
      }
    }

    /* Los textos alternativos de las imágenes también se traducen */
    var imgs = document.querySelectorAll('[data-i18n-alt]');
    for (var k = 0; k < imgs.length; k++) {
      var img = imgs[k];
      var altKey = img.getAttribute('data-i18n-alt');
      altNodes.push({ el: img, key: altKey });
      if (!(altKey in I18N.es)) {
        I18N.es[altKey] = img.getAttribute('alt') || '';
      }
    }
  }

  function apply(lang) {
    var dict = I18N[lang] || I18N[DEFAULT];
    for (var i = 0; i < nodes.length; i++) {
      var txt = dict[nodes[i].key];
      if (typeof txt === 'string') {
        nodes[i].el.innerHTML = txt;
      }
    }

    for (var a = 0; a < altNodes.length; a++) {
      var alt = dict[altNodes[a].key];
      if (typeof alt === 'string') {
        altNodes[a].el.setAttribute('alt', alt);
      }
    }

    document.documentElement.lang = lang;

    var meta = META[lang] || META[DEFAULT];
    if (meta) {
      document.title = meta.title;
      setMeta('name', 'description', meta.desc);
      setMeta('property', 'og:title', meta.title);
      setMeta('property', 'og:description', meta.social);
      setMeta('property', 'og:image:alt', meta.title);
      setMeta('property', 'og:locale', meta.locale);
      setMeta('name', 'twitter:title', meta.title);
      setMeta('name', 'twitter:description', meta.social);
      setMeta('name', 'twitter:image:alt', meta.title);
    }

    var btns = document.querySelectorAll('.lang__btn');
    for (var j = 0; j < btns.length; j++) {
      btns[j].setAttribute('aria-pressed', String(btns[j].getAttribute('data-lang') === lang));
    }

    var idioma = document.querySelector('input[name="idioma"]');
    if (idioma) { idioma.value = lang; }

    revealMail();

    try { localStorage.setItem(STORE_KEY, lang); } catch (e) { /* modo privado */ }
  }

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

  function setMeta(attr, name, value) {
    if (typeof value !== 'string') { return; }
    var el = document.querySelector('meta[' + attr + '="' + name + '"]');
    if (el) { el.setAttribute('content', value); }
  }

  function initialLang() {
    var stored = null;
    try { stored = localStorage.getItem(STORE_KEY); } catch (e) { /* noop */ }
    if (stored && (stored === DEFAULT || I18N[stored])) { return stored; }

    var nav = (navigator.language || '').toLowerCase();
    if (nav.indexOf('ca') === 0) { return 'ca'; }
    if (nav.indexOf('es') === 0) { return 'es'; }
    if (nav.indexOf('en') === 0) { return 'en'; }
    return DEFAULT;
  }

  function initLangButtons() {
    var btns = document.querySelectorAll('.lang__btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function (ev) {
        apply(ev.currentTarget.getAttribute('data-lang'));
      });
    }
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
    collect();
    initLangButtons();
    initNav();
    apply(initialLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
