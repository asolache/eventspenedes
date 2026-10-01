/* =============================================================================
   Events Penedès — envío del formulario por correo
   No hay servidor: al enviar se compone un mailto con los datos y se abre el
   programa de correo de quien escribe. La dirección de destino no está en el
   HTML en claro; viaja codificada en data-m, igual que los enlaces de correo.
   ========================================================================== */
(function () {
  'use strict';

  /* Etiqueta legible de cada campo, por idioma. Lo que llega al buzón tiene
     que leerse como una ficha, no como un volcado de nombres de input. */
  var CAMPOS = {
    es: {
      subject: 'Solicitud de evento',
      nombre: 'Nombre',
      persona: 'Persona de contacto',
      empresa: 'Empresa o agencia',
      cargo: 'Cargo',
      web: 'Web',
      mercado: 'Clientes y mercados',
      correo: 'Correo',
      telefono: 'Teléfono',
      personas: 'Nº de personas',
      fecha: 'Fecha aproximada',
      tipo: 'Tipo de evento',
      mensaje: 'Mensaje',
      idioma: 'Idioma de navegación',
      pie: 'Enviado desde eventspenedes.com'
    },
    ca: {
      subject: 'Sol·licitud d’esdeveniment',
      nombre: 'Nom',
      persona: 'Persona de contacte',
      empresa: 'Empresa o agència',
      cargo: 'Càrrec',
      web: 'Web',
      mercado: 'Clients i mercats',
      correo: 'Correu',
      telefono: 'Telèfon',
      personas: 'Nre. de persones',
      fecha: 'Data aproximada',
      tipo: 'Tipus d’esdeveniment',
      mensaje: 'Missatge',
      idioma: 'Idioma de navegació',
      pie: 'Enviat des d’eventspenedes.com'
    },
    en: {
      subject: 'Event enquiry',
      nombre: 'Name',
      persona: 'Contact person',
      empresa: 'Company or agency',
      cargo: 'Role',
      web: 'Website',
      mercado: 'Clients and markets',
      correo: 'Email',
      telefono: 'Phone',
      personas: 'Number of people',
      fecha: 'Approximate date',
      tipo: 'Type of event',
      mensaje: 'Message',
      idioma: 'Browsing language',
      pie: 'Sent from eventspenedes.com'
    }
  };

  var ORDEN = ['nombre', 'persona', 'empresa', 'cargo', 'correo', 'telefono', 'web',
               'personas', 'fecha', 'tipo', 'mercado'];

  function decode(token) {
    try {
      return atob(token.split('').reverse().join(''));
    } catch (e) {
      return '';
    }
  }

  function valorVisible(form, name) {
    var el = form.elements[name];
    if (!el) { return ''; }
    if (el.tagName === 'SELECT') {
      /* El texto que la persona ha visto, no el value interno */
      return el.options[el.selectedIndex] ? el.options[el.selectedIndex].textContent.trim() : '';
    }
    return (el.value || '').trim();
  }

  function init() {
    var form = document.querySelector('form[data-m]');
    if (!form) { return; }

    var destino = decode(form.getAttribute('data-m') || '');
    if (!destino) { return; }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var lang = document.documentElement.lang;
      var t = CAMPOS[lang] || CAMPOS.es;

      var cabecera = form.getAttribute('data-asunto') || t.subject;
      var quien = valorVisible(form, 'nombre') || valorVisible(form, 'empresa');
      var asunto = cabecera + (quien ? ' — ' + quien : '');

      var lineas = [];
      for (var i = 0; i < ORDEN.length; i++) {
        var v = valorVisible(form, ORDEN[i]);
        if (v) { lineas.push(t[ORDEN[i]] + ': ' + v); }
      }

      var mensaje = valorVisible(form, 'mensaje');
      if (mensaje) { lineas.push('', t.mensaje + ':', mensaje); }

      lineas.push('', '--', t.idioma + ': ' + lang, t.pie);

      window.location.href = 'mailto:' + destino +
        '?subject=' + encodeURIComponent(asunto) +
        '&body=' + encodeURIComponent(lineas.join('\n'));

      /* Si el navegador no tiene cliente de correo asociado no pasa nada
         visible, así que dejamos a mano la alternativa. */
      var fallback = document.getElementById('form-fallback');
      if (fallback) { fallback.hidden = false; }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
