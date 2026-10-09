/* =============================================================================
   Events Penedès — la ficha de localización, pensada para rellenarse de visita

   · Se guarda sola en este dispositivo a cada cambio. En una bodega sin
     cobertura, cerrar la pestaña no pierde nada.
   · Se envía sin salir de la página. Si no hay red, lo dice y la ficha sigue
     guardada; solo se borra cuando Netlify confirma que la tiene.
   · Acepta campos prerrellenados en la URL (?nombre=…&contacto_persona=…),
     que solo llenan lo vacío, y los quita de la barra de direcciones. Avisa
     de que viene prellenada. Los enlaces salen del repositorio privado:
     `node tools/enlace-localizacion.mjs <id> --web ../eventspenedes`.
   · Registro de cambios: el campo oculto `borrador` lleva la versión de la
     que parte la ficha (la prellenada o el último envío desde este
     dispositivo). La función compara y deja en la nota de Zoho qué cambió.
     Tras enviar, la ficha se queda como se envió y ofrece un enlace para
     volver a abrirla así desde cualquier sitio.
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
  var CLAVE_PARTIDA = 'ep-ficha-partida';
  var form = document.getElementById('form-localizacion');
  if (!form) { return; }
  var partida = form.elements.borrador;
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

  function fijarPartida(datos) {
    if (!partida) { return; }
    partida.value = JSON.stringify(datos);
    try { localStorage.setItem(CLAVE_PARTIDA, partida.value); } catch (e) { /* nada */ }
  }

  /* El enlace que vuelve a abrir la ficha tal como se ha enviado */
  function enlaceDe(datos) {
    var q = new URLSearchParams();
    Object.keys(datos).forEach(function (k) { if (k !== 'consentimiento') { q.set(k, datos[k]); } });
    return location.origin + location.pathname + '?' + q.toString();
  }

  function recuperar() {
    try { if (partida) { partida.value = localStorage.getItem(CLAVE_PARTIDA) || ''; } } catch (e) { /* nada */ }
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
    var deEnlace = {};
    q.forEach(function (v, k) {
      if (form.elements[k] && form.elements[k].type !== 'hidden') { poner(k, v, true); deEnlace[k] = v; prellenado = true; }
    });
    if (prellenado) {
      fijarPartida(deEnlace);
      history.replaceState(null, '', location.pathname);
      guardar();
      /* El enlace prellenado se lo mandamos al espacio con lo que dice su
         catálogo: tiene que saber que es un borrador nuestro, no su ficha. */
      decir(form.hasAttribute('data-interno')
        ? 'Ficha prellenada desde el catálogo. Revísala y completa lo que veas en la visita.'
        : 'Os hemos adelantado la ficha con lo que dice vuestro catálogo. Revisadla, corregid lo que no esté bien, decidnos si autorizáis publicarla y enviadla: hasta entonces no nos llega nada.');
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
      /* La ficha se queda como se ha enviado y pasa a ser la versión de
         partida: el próximo envío nos llegará con lo que cambie respecto a esta. */
      var enviada = leer();
      fijarPartida(enviada);
      decir('Enviada: la ficha de «' + nombre + '» nos ha llegado. Gracias. No se publica nada sin vuestra autorización. '
        + 'Podéis cambiarla cuando queráis y volver a enviarla: nos llega con lo que ha cambiado.', 'ok');
      var enlace = document.createElement('a');
      enlace.href = enlaceDe(enviada);
      enlace.textContent = 'Enlace para volver a abrir la ficha tal como la habéis enviado';
      estado.appendChild(document.createElement('br'));
      estado.appendChild(enlace);
      window.scrollTo(0, 0);
    }).catch(function () {
      decir('No se ha podido enviar (¿sin cobertura?). La ficha sigue guardada en este dispositivo: vuelve a pulsar «Enviar la ficha» cuando haya red.', 'error');
      estado.scrollIntoView({ block: 'center' });
    }).then(function () { boton.disabled = false; });
  });

  borrar.addEventListener('click', function () {
    if (!window.confirm('¿Vaciar la ficha? Lo que no se haya enviado se pierde.')) { return; }
    try { localStorage.removeItem(CLAVE); localStorage.removeItem(CLAVE_PARTIDA); } catch (e) { /* nada */ }
    form.reset();
    if (partida) { partida.value = ''; }
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
