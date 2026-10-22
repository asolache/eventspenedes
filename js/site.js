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

  /* El partner que nos trae a quien escribe. Cada espacio o proveedor de la
     red tiene su enlace (eventspenedes.com/r/<código>, que lleva a ?ref=) y el
     código viaja en el campo `partner` de cualquier formulario que se envíe en
     esta visita. Solo se acepta un código con forma de código: minúsculas,
     cifras y guiones. Igual que el origen, sin cookies. */
  var CODIGO_PARTNER = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
  function marcarPartner() {
    var clave = 'ep-partner', codigo = null;
    var q = new URLSearchParams(location.search);
    var nuevo = (q.get('ref') || q.get('partner') || '').trim().toLowerCase();
    if (CODIGO_PARTNER.test(nuevo)) {
      codigo = nuevo;
      try { sessionStorage.setItem(clave, codigo); } catch (e) { /* sin almacenamiento */ }
    } else {
      try { codigo = sessionStorage.getItem(clave); } catch (e) { codigo = null; }
    }
    if (!codigo) { return; }
    var campos = document.querySelectorAll('input[name="partner"]');
    for (var i = 0; i < campos.length; i++) { campos[i].value = codigo; }
  }

  /* La página de contacto: cada camino que acaba en el formulario de aquí
     mismo deja marcado su tipo. */
  function rutasContacto() {
    var sel = document.querySelector('#form-contacto select[name="tipo"]');
    var rutas = document.querySelectorAll('a[data-tipo]');
    if (!sel) { return; }
    for (var i = 0; i < rutas.length; i++) {
      rutas[i].addEventListener('click', function () { sel.value = this.getAttribute('data-tipo'); });
    }
  }

  /* Un enlace puede llegar con el tipo ya elegido (?tipo=dj desde la página
     de DJ): se marca solo si el formulario tiene esa opción. */
  function preseleccionar() {
    var q = new URLSearchParams(location.search);
    /* ?tipo= en contacto; ?perfil= en «Entra en la red», que es a donde
       llevan las llamadas de la portada a espacios y proveedores. */
    [['#form-contacto select[name="tipo"]', q.get('tipo')],
     ['#form-red select[name="perfil"]', q.get('perfil')]].forEach(function (par) {
      var sel = document.querySelector(par[0]), v = par[1];
      if (!v || !sel) { return; }
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === v) { sel.value = v; return; }
      }
    });
  }

  /* Desde la agenda, «Me interesa» llega con ?asunto=…&fecha=…: se escriben
     en el mensaje y la fecha del formulario de contacto si están vacíos. */
  function rellenarAsunto() {
    var form = document.getElementById('form-contacto');
    if (!form) { return; }
    var q = new URLSearchParams(location.search);
    var asunto = (q.get('asunto') || '').slice(0, 200), fecha = q.get('fecha') || '';
    if (asunto && form.elements.mensaje && !form.elements.mensaje.value) { form.elements.mensaje.value = asunto + '\n\n'; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha) && form.elements.fecha && !form.elements.fecha.value) { form.elements.fecha.value = fecha; }
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
    /* Desde la conversación de la portada llegan también lo escrito y las
       personas (?objetivo=…&pax=…): solo si el campo está vacío. */
    var objetivo = (q.get('objetivo') || '').slice(0, 1200), pax = q.get('pax') || '';
    if (objetivo && form.elements.objetivo && !form.elements.objetivo.value) { form.elements.objetivo.value = objetivo; }
    if (/^\d{1,4}$/.test(pax) && form.elements.pax && !form.elements.pax.value) { form.elements.pax.value = pax; }
    ['duracion', 'catering', 'movilidad', 'espacio'].forEach(function (k) {
      var sel = form.querySelector('select[name="' + k + '"]'), v = q.get(k);
      if (!sel || !v) { return; }
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === v) { sel.value = v; }
      }
    });
  }

  /* La selección: «Me interesa» en espacios y actividades de la portada, y
     «Añadir a mi selección» en las páginas de los partners (/partners). Una
     sola cesta para todo el sitio: se guarda en este navegador (localStorage,
     sin cookies ni servidor) y pasa al formulario de propuesta: rellena el
     espacio y las experiencias que tienen casilla, y el resto viaja por su
     nombre en el campo `seleccion`. Se vacía al enviar.
     Los ids: `exp:<casilla>`, `act:<actividad>`, `espacio:<valor>`,
     `catering:<código>`, `partner:<código>` (y `partner:<código>:sala-1`, una
     parte suya) y `agenda:<id>`. */
  var CLAVE_SEL = 'ep-seleccion';
  var CASILLA_SEL = {
    'exp:castells': 'exp_castells', 'exp:cata_aceite': 'exp_cata_aceite', 'exp:cata_vino': 'exp_cata_vino',
    'act:catas-ludicas': 'exp_catas_ludicas', 'act:comer-bodega': 'exp_comer_bodega',
    'act:maridaje-paisaje': 'exp_maridaje'
  };
  function leerSel() {
    try {
      var v = JSON.parse(localStorage.getItem(CLAVE_SEL) || '[]');
      return Array.isArray(v) ? v.filter(function (x) { return x && x.id && x.nombre; }) : [];
    } catch (e) { return []; }
  }
  function guardarSel(sel) {
    try { localStorage.setItem(CLAVE_SEL, JSON.stringify(sel)); } catch (e) { /* sin almacenamiento */ }
  }

  function seleccionPortada() {
    var botones = document.querySelectorAll('.interes[data-interes]');
    var reservas = document.querySelectorAll('a[data-reservar]');
    var barra = document.getElementById('seleccion');
    if (!botones.length || !barra) { return; }
    function pintar() {
      var sel = leerSel(), ids = sel.map(function (x) { return x.id; });
      for (var i = 0; i < botones.length; i++) {
        botones[i].setAttribute('aria-pressed', String(ids.indexOf(botones[i].getAttribute('data-interes')) >= 0));
      }
      barra.querySelector('.seleccion__n').textContent = sel.length;
      barra.hidden = sel.length === 0;
    }
    for (var i = 0; i < botones.length; i++) {
      botones[i].addEventListener('click', function () {
        var id = this.getAttribute('data-interes');
        var caja = this.closest('article');
        var h3 = caja && caja.querySelector('h3');
        var nombre = this.getAttribute('data-nombre') || (h3 ? h3.textContent.trim() : id);
        var sel = leerSel().filter(function (x) { return x.id !== id; });
        if (this.getAttribute('aria-pressed') !== 'true') { sel.push({ id: id, nombre: nombre }); }
        guardarSel(sel);
        pintar();
      });
    }
    /* «Reservar / pedir fecha» en la página de un partner: lo deja en la
       selección (sin quitarlo si ya estaba) y sigue al formulario */
    for (var j = 0; j < reservas.length; j++) {
      reservas[j].addEventListener('click', function () {
        var id = this.getAttribute('data-reservar');
        var sel = leerSel();
        if (!sel.some(function (x) { return x.id === id; })) {
          sel.push({ id: id, nombre: this.getAttribute('data-nombre') || id });
          guardarSel(sel);
        }
      });
    }
    barra.querySelector('.seleccion__vaciar').addEventListener('click', function () {
      guardarSel([]);
      pintar();
    });
    pintar();
  }

  function seleccionPropuesta() {
    var form = document.getElementById('form-propuesta');
    var caja = document.getElementById('seleccion-form');
    if (!form || !caja) { return; }
    var lista = caja.querySelector('ul');
    var campo = form.querySelector('input[name="seleccion"]');
    function pintar() {
      var sel = leerSel();
      lista.innerHTML = '';
      sel.forEach(function (x) {
        var li = document.createElement('li');
        var t = document.createElement('span');
        t.textContent = x.nombre;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'seleccion-form__quitar';
        b.textContent = '×';
        b.setAttribute('aria-label', '− ' + x.nombre);
        b.addEventListener('click', function () {
          guardarSel(leerSel().filter(function (y) { return y.id !== x.id; }));
          pintar();
        });
        li.appendChild(t);
        li.appendChild(b);
        lista.appendChild(li);
      });
      if (campo) { campo.value = sel.map(function (x) { return x.nombre; }).join(' · ').slice(0, 1000); }
      caja.hidden = sel.length === 0;
    }
    var sel = leerSel();
    if (sel.length) {
      var espacio = form.querySelector('select[name="espacio"]');
      sel.forEach(function (x) {
        var p = x.id.split(':');
        if ((p[0] === 'espacio' || p[0] === 'partner') && p.length === 2 && espacio && !espacio.value) {
          for (var i = 0; i < espacio.options.length; i++) {
            if (espacio.options[i].value === p[1]) { espacio.value = p[1]; }
          }
        }
        if (CASILLA_SEL.hasOwnProperty(x.id)) {
          var c = form.querySelector('input[name="' + CASILLA_SEL[x.id] + '"]');
          if (c) { c.checked = true; }
        }
      });
      var mas = form.querySelector('details.form__mas');
      if (mas) { mas.open = true; }
    }
    form.addEventListener('submit', function () { guardarSel([]); });
    pintar();
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

  /* «Entra en la red»: lo que nos contó al presentarse viaja a la página de
     gracias, que le ofrece seguir con su ficha ya empezada (la del espacio o
     la del proveedor). Solo en esta pestaña: sessionStorage. */
  var CLAVE_RED = 'ep-red';
  function recordarRed() {
    var form = document.getElementById('form-red');
    if (!form) { return; }
    form.addEventListener('submit', function () {
      var e = form.elements, d = {};
      ['perfil', 'empresa', 'web', 'poblacion', 'persona', 'correo'].forEach(function (k) {
        if (e[k] && e[k].value) { d[k] = String(e[k].value).trim().slice(0, 300); }
      });
      try { sessionStorage.setItem(CLAVE_RED, JSON.stringify(d)); } catch (err) { /* sin almacenamiento */ }
    });
  }

  function seguirConLaFicha() {
    var bloque = document.querySelector('[data-ficha-siguiente]');
    if (!bloque) { return; }
    var d = null;
    try { d = JSON.parse(sessionStorage.getItem(CLAVE_RED) || 'null'); } catch (e) { d = null; }
    if (!d || !d.perfil) { return; }
    var espacio = d.perfil === 'localizacion';
    var q = new URLSearchParams();
    q.set('desde', 'red');
    if (d.empresa) { q.set('nombre', d.empresa); }
    if (!espacio) { q.set('categoria', d.perfil); }
    if (d.web) { q.set('web', /^https?:\/\//i.test(d.web) ? d.web : 'https://' + d.web); }
    if (d.poblacion) { q.set('poblacion', d.poblacion); }
    if (d.persona) { q.set('contacto_persona', d.persona); }
    if (d.correo) { q.set('contacto_correo', d.correo); }
    var enlace = bloque.querySelector('a.js-ficha');
    if (!enlace) { return; }
    enlace.setAttribute('href', '/alta-' + (espacio ? 'localizacion' : 'proveedor') + '?' + q.toString());
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
    marcarPartner();
    rutasContacto();
    preseleccionar();
    rellenarPrograma();
    rellenarAsunto();
    seleccionPortada();
    seleccionPropuesta();
    valoracion();
    initCopiar();
    mostrarAgenda();
    recordarRed();
    seguirConLaFicha();
    initNav();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

/* Clics en los botones que llevan a pedir algo (data-clic): se cuentan en
   /api/clic sin cookies ni datos de la persona, solo botón y página. */
(function () {
  if (!navigator.sendBeacon) return;
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-clic]');
    if (!el) return;
    try {
      navigator.sendBeacon('/api/clic', JSON.stringify({ b: el.getAttribute('data-clic'), p: location.pathname }));
    } catch (err) { /* contar nunca debe romper el clic */ }
  });
})();

/* La conversación de la portada: cada idea se añade a lo escrito y marca su
   experiencia, que viaja como ?exp= al formulario de propuesta. */
(function () {
  var form = document.querySelector('form.charla');
  if (!form) return;
  var texto = form.elements.objetivo, exp = form.elements.exp;
  form.querySelectorAll('.chip').forEach(function (chip) {
    chip.setAttribute('aria-pressed', 'false');
    chip.addEventListener('click', function () {
      var on = chip.getAttribute('aria-pressed') !== 'true';
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
      var frase = chip.textContent.trim();
      if (on && texto.value.indexOf(frase) === -1) { texto.value = (texto.value ? texto.value.replace(/\s+$/, '') + '. ' : '') + frase; }
      exp.value = Array.prototype.filter.call(form.querySelectorAll('.chip[aria-pressed="true"]'), function () { return true; })
        .map(function (c) { return c.getAttribute('data-exp'); }).join(',');
      texto.focus();
    });
  });
  form.addEventListener('submit', function () { if (!exp.value) exp.disabled = true; });
})();
