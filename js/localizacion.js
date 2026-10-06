/* =============================================================================
   Events Penedès — la ficha de localización, pensada para rellenarse de visita

   · Se guarda sola en este dispositivo a cada cambio. En una bodega sin
     cobertura, cerrar la pestaña no pierde nada.
   · Se envía sin salir de la página. Si no hay red, lo dice y la ficha sigue
     guardada; solo se borra cuando Netlify confirma que la tiene.
   · Acepta campos prerrellenados en la URL (?nombre=…&contacto_persona=…),
     que solo llenan lo vacío, y los quita de la barra de direcciones.
   · Con ?interno=1 enseña lo que rellenamos nosotros (relación, notas de la
     visita); sin él, la ficha es la que puede rellenar el propio espacio.
     Este dispositivo lo recuerda.
   · Abre los bloques de cata y alojamiento según el tipo, y enseña las salas
     de una en una.
   Sin JavaScript el formulario funciona igual: todo visible y envío normal.
   ========================================================================== */
(function () {
  'use strict';

  var CLAVE = 'ep-ficha-localizacion';
  var CLAVE_INTERNO = 'ep-ficha-interno';
  var form = document.getElementById('form-localizacion');
  if (!form) { return; }
  var estado = form.querySelector('[data-estado]');
  var borrar = form.querySelector('[data-borrar]');

  function decir(texto, tipo) {
    estado.textContent = texto;
    estado.setAttribute('data-tipo', tipo || 'info');
    estado.hidden = false;
  }

  /* --- Guardar y recuperar ------------------------------------------------ */

  function leer() {
    var datos = {};
    var els = form.elements;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.name || el.type === 'hidden' || el.name === 'bot-field' || el.type === 'submit') { continue; }
      if (el.type === 'checkbox') { if (el.checked) { datos[el.name] = el.value; } }
      else if (el.value) { datos[el.name] = el.value; }
    }
    return datos;
  }

  function poner(nombre, valor, soloVacio) {
    var el = form.elements[nombre];
    if (!el || el.type === 'hidden') { return; }
    if (el.type === 'checkbox') {
      if (!soloVacio || !el.checked) { el.checked = Boolean(valor); }
    } else if (!soloVacio || !el.value) {
      el.value = valor;
    }
  }

  function guardar() {
    try {
      var datos = leer();
      var hay = Object.keys(datos).some(function (k) { return k !== 'consentimiento'; });
      if (hay) { localStorage.setItem(CLAVE, JSON.stringify(datos)); }
      else { localStorage.removeItem(CLAVE); }
      borrar.hidden = !hay;
    } catch (e) { /* sin almacenamiento: el formulario sigue funcionando */ }
  }

  function recuperar() {
    var guardado = null;
    try { guardado = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { guardado = null; }
    if (guardado) {
      Object.keys(guardado).forEach(function (k) { poner(k, guardado[k], false); });
      decir('Ficha recuperada de este dispositivo: «' + (guardado.nombre || 'sin nombre') + '». Sigue donde lo dejaste.');
      borrar.hidden = false;
    }
    var q = new URLSearchParams(location.search);
    try {
      if (q.get('interno') === '1') { localStorage.setItem(CLAVE_INTERNO, '1'); }
      if (q.get('interno') === '0') { localStorage.removeItem(CLAVE_INTERNO); }
      if (localStorage.getItem(CLAVE_INTERNO) === '1') { form.setAttribute('data-interno', ''); }
    } catch (e) { if (q.get('interno') === '1') { form.setAttribute('data-interno', ''); } }
    var prellenado = false;
    q.forEach(function (v, k) { if (form.elements[k]) { poner(k, v, true); prellenado = true; } });
    if (prellenado) {
      history.replaceState(null, '', location.pathname);
      guardar();
    }
  }

  /* --- Bloques que se abren solos ----------------------------------------- */

  var tipo = form.elements.tipo;
  var interruptores = form.querySelectorAll('input[data-tipos]');

  function condicionales() {
    var bloques = form.querySelectorAll('.form__cond[data-si]');
    for (var i = 0; i < bloques.length; i++) {
      var cb = form.elements[bloques[i].getAttribute('data-si')];
      bloques[i].hidden = !(cb && cb.checked);
    }
  }

  function porTipo() {
    for (var i = 0; i < interruptores.length; i++) {
      var tipos = interruptores[i].getAttribute('data-tipos').split(' ');
      /* Solo abre, nunca cierra: una masía con habitaciones lo marca a mano
         y no se le desmarca al cambiar de tipo. */
      if (tipo.value && tipos.indexOf(tipo.value) !== -1) { interruptores[i].checked = true; }
    }
    condicionales();
  }

  /* --- Salas de una en una ------------------------------------------------- */

  var salas = form.querySelectorAll('fieldset.sala');
  var mas = form.querySelector('.sala__mas');

  function conDatos(fs) {
    var els = fs.querySelectorAll('input, select, textarea');
    for (var i = 0; i < els.length; i++) { if (els[i].value) { return true; } }
    return false;
  }

  function mostrarSalas() {
    var ultima = 0;
    for (var i = 0; i < salas.length; i++) { if (conDatos(salas[i])) { ultima = i; } }
    for (var j = 0; j < salas.length; j++) { salas[j].hidden = j > ultima; }
    mas.hidden = ultima >= salas.length - 1;
  }

  mas.addEventListener('click', function () {
    for (var i = 0; i < salas.length; i++) {
      if (salas[i].hidden) {
        salas[i].hidden = false;
        var primero = salas[i].querySelector('input');
        if (primero) { primero.focus(); }
        break;
      }
    }
    mas.hidden = !form.querySelector('fieldset.sala[hidden]');
  });

  /* --- Envío --------------------------------------------------------------- */

  form.addEventListener('submit', function (ev) {
    if (!window.fetch) { return; }
    ev.preventDefault();
    var boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    decir('Enviando…');
    var cuerpo = new URLSearchParams(new FormData(form)).toString();
    fetch('/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: cuerpo,
    }).then(function (r) {
      if (!r.ok) { throw new Error('HTTP ' + r.status); }
      var nombre = form.elements.nombre.value;
      try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
      form.reset();
      porTipo();
      mostrarSalas();
      borrar.hidden = true;
      decir('Enviada: la ficha de «' + nombre + '» nos ha llegado. Gracias. No se publica nada sin vuestra autorización.', 'ok');
      window.scrollTo(0, 0);
    }).catch(function () {
      decir('No se ha podido enviar (¿sin cobertura?). La ficha sigue guardada en este dispositivo: vuelve a pulsar «Enviar la ficha» cuando haya red.', 'error');
      estado.scrollIntoView({ block: 'center' });
    }).then(function () { boton.disabled = false; });
  });

  borrar.addEventListener('click', function () {
    if (!window.confirm('¿Vaciar la ficha? Lo que no se haya enviado se pierde.')) { return; }
    try { localStorage.removeItem(CLAVE); } catch (e) { /* nada */ }
    form.reset();
    porTipo();
    mostrarSalas();
    borrar.hidden = true;
    estado.hidden = true;
  });

  /* --- Arranque ------------------------------------------------------------ */

  recuperar();
  porTipo();
  mostrarSalas();

  var espera;
  form.addEventListener('input', function () { clearTimeout(espera); espera = setTimeout(guardar, 300); });
  form.addEventListener('change', function (ev) {
    if (ev.target === tipo) { porTipo(); }
    if (ev.target.hasAttribute && ev.target.hasAttribute('data-tipos')) { condicionales(); }
    guardar();
  });
})();
