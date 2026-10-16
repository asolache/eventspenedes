/* =============================================================================
   GENERADO · no editar aquí.

   Copia de tools/lib/briefing-a-evento.mjs del repositorio privado
   eventspenedes-tarifas, puesta al día con:

     node tools/sync-web.mjs --web ../eventspenedes

   Se edita allí, donde está el catálogo y donde corren las guardas. Aquí se
   edita y la próxima copia se lo lleva por delante —y la guarda del repositorio
   privado lo dice antes, en CI—.
   ========================================================================== */
/* ---- fin de la cabecera generada ---- */
/* =============================================================================
   Events Penedès · del briefing al evento

   Lo que el cliente rellena en eventspenedes.com/propuesta llega como un
   puñado de campos de formulario. Un evento es otra cosa: tiene programa, con
   horas, y un espacio que encaja con el grupo. Esta función hace la traducción,
   y es la misma en los dos sitios donde hace falta —la función de Netlify que
   monta el borrador y el comando que genera el PDF—, porque si fueran dos, el
   borrador que lee Álvaro y el PDF que recibe el cliente serían distintos.

   Tres reglas que no son detalles:

   1. **El programa que sale de aquí es una propuesta de horas, no un horario.**
      Se calcula con las duraciones del catálogo y se revisa a mano. Por eso el
      borrador lo dice en la primera línea.

   2. **Lo que no encaja se aparta, no se tacha el borrador.** Un briefing puede
      pedir una cata de aceite en un espacio donde no se hace, o doscientas
      personas donde caben treinta. Si eso hiciera fallar la generación, no
      habría borrador justo el día que más falta hace verlo. Se quita del
      documento y se anota aparte, para que Álvaro llame y proponga otra cosa.

   3. **El presupuesto orientativo no entra en el evento.** Es una banda de
      precio, y los documentos de esta herramienta no llevan importes. No es que
      no se imprima: es que no se copia, así que no hay camino por el que pueda
      acabar en un PDF. Está en la ficha del CRM, que es donde sirve.

   La lista de campos que se copian es **lista blanca**: un campo nuevo en el
   formulario no entra solo.
   ========================================================================== */
import { comprobar, limpio, IDIOMAS } from './render-propuesta.mjs';

/* Qué casilla del formulario es qué opción del catálogo. El formulario ofrece
   lo que está en la portada y nada más: lo que no está en cartera no se pide
   (Álvaro, 16/10/2026). Si mañana se añade una experiencia a la web, se añade
   aquí y deja de ser invisible para el borrador. */
export const DE_CASILLA = {
  exp_castells: 'fent-pinya',
  exp_cata_aceite: 'cata-aceite',
  exp_cata_vino: 'visita-vinyes-cata',
  exp_catas_ludicas: 'catas-ludicas',
  exp_comer_bodega: 'comer-bodega',
  exp_maridaje: 'maridaje-paisaje',
  exp_dj: 'dj-sesion',
};

/* Quién da de comer. En Albet i Noya cocina la bodega; en cualquier otro
   espacio, el catering de la red. Un showcooking también es suyo. */
const COMIDA_EN = { 'albet-i-noya': 'comer-bodega' };
const CATERING = 'catering-cal-soler';
const CON_COMIDA = ['sentado', 'coctel', 'showcooking', 'aire-libre'];
const COMIDAS = new Set([CATERING, ...Object.values(COMIDA_EN)]);

/* El orden del día. No es el orden en que se marcan las casillas: una cata a
   las nueve de la mañana no la quiere nadie, y el taller de castells va
   después de comer a propósito —es la parte del día en la que no se puede
   sostener a nadie que no conozcas—. Las catas lúdicas cierran la jornada. */
const ORDEN = ['microbus', 'cata-aceite', 'visita-vinyes-cata', 'maridaje-paisaje',
               'comer-bodega', CATERING, 'fent-pinya', 'catas-ludicas', 'dj-sesion'];

const ARRANQUE = { media: 10 * 60, jornada: 10 * 60 + 30, 'jornada-noche': 10 * 60 + 30, 'dos-dias': 10 * 60 + 30 };
const COMIDA = 13 * 60 + 30;   // la comida no se adelanta a las doce porque cuadre la suma
const CENA = 21 * 60;          // ni el DJ empieza cuando acaba el taller
const MARGEN = 15;

/* Lo que dura una pieza sale del catálogo. Lo que no tiene duración allí es
   porque no es una actividad con horario —una comida no dura «lo que dure la
   cocina»—, así que se le pone aquí lo que dura de verdad en un evento. */
const POR_DEFECTO = { 'comer-bodega': 105, [CATERING]: 105, microbus: 60 };

const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutos = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const dura = (id, opciones) => opciones.find(x => x.id === id)?.duracion_min || POR_DEFECTO[id] || 60;

/** Reparte horas por el programa con las duraciones del catálogo. */
function horas(ids, opciones, duracion) {
  let t = ARRANQUE[duracion] ?? ARRANQUE.jornada;
  return ids.map(id => {
    if (COMIDAS.has(id) && t < COMIDA) { t = COMIDA; }
    if (id === 'dj-sesion' && t < CENA) { t = CENA; }
    /* La visita de Albet i Noya sale a las horas en punto (su ficha dice «a
       las 10, 11, 12 o 13 h»), y el documento lo enseña al lado de la hora. */
    if (id === 'visita-vinyes-cata') { t = Math.ceil(t / 60) * 60; }
    const hora = hhmm(t);
    t += dura(id, opciones) + MARGEN;
    return { hora, opcion: id };
  });
}

/**
 * @param d          los campos del formulario, tal como los manda Netlify
 * @param opciones   catálogo de opciones
 * @param espacios   catálogo de espacios
 * @param recibido   ISO del envío · para el identificador y la trazabilidad
 * @returns { evento, descartes, avisos }
 */
export function briefingAEvento(d = {}, { opciones, espacios, recibido = new Date().toISOString() } = {}) {
  const txt = k => String(d[k] ?? '').trim();
  const pax = Number.parseInt(txt('pax'), 10) || null;

  /* El idioma del documento es el del evento, no el de la web: alguien puede
     pedir la propuesta navegando en catalán para un equipo que la quiere en
     inglés. Con la mezcla, el del navegante es la mejor pista que hay. */
  const idiomaWeb = IDIOMAS.includes(txt('idioma')) ? txt('idioma') : 'es';
  const idioma = IDIOMAS.includes(txt('idioma_evento')) ? txt('idioma_evento') : idiomaWeb;

  const duracion = txt('duracion') || 'jornada';
  const cliente = { empresa: txt('empresa') || null, persona: txt('persona') || null,
                    correo: txt('correo') || null, telefono: txt('telefono') || null };

  const pedidas = Object.entries(DE_CASILLA).filter(([k]) => txt(k)).map(([, id]) => id);

  /* Lo que solo se hace en un sitio dice dónde es el evento, si el cliente no
     lo ha dicho: quien marca la visita entre viñas de Albet i Noya está
     eligiendo Albet i Noya. Si lo marcado es de dos sitios, gana el que más
     piezas tiene, y lo del otro se aparta como cualquier cosa que no encaja. */
  let espacio = txt('espacio') || null;
  let deducido = null;
  if (!espacio) {
    const cuenta = {};
    pedidas.map(id => opciones.find(o => o.id === id)?.exige_espacio).filter(Boolean)
      .forEach(s => { cuenta[s] = (cuenta[s] || 0) + 1; });
    deducido = Object.keys(cuenta).sort((a, b) => cuenta[b] - cuenta[a])[0] || null;
    espacio = deducido;
  }

  if (txt('movilidad') === 'microbus') { pedidas.push('microbus'); }
  /* Si hay que comer, la comida entra en el programa con quien la hace. */
  const comida = COMIDA_EN[espacio] || CATERING;
  if (CON_COMIDA.includes(txt('catering')) && !pedidas.includes(comida)) { pedidas.push(comida); }
  if (duracion === 'jornada-noche' && !pedidas.includes('dj-sesion')) { pedidas.push('dj-sesion'); }

  const ordenadas = ORDEN.filter(id => pedidas.includes(id))
    .concat(pedidas.filter(id => !ORDEN.includes(id)));

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(txt('fecha')) ? txt('fecha') : null;
  const quien = limpio(cliente.empresa || cliente.persona || 'sin-nombre').slice(0, 40);

  const evento = {
    id: `${fecha || recibido.slice(0, 10)}-${quien || 'sin-nombre'}`,
    estado: 'borrador',
    origen: { formulario: 'propuesta', recibido },
    idioma,
    /* La marca la decide Álvaro, no el formulario: que el evento venga a través
       de una agencia no quiere decir que el documento salga en marca blanca.
       Eso se habla con la agencia. */
    marca: { modo: 'propia', de: null, para: cliente.empresa || cliente.persona || null },
    cliente,
    a_traves_de: txt('a_traves_de') || null,
    evento: {
      tipo: txt('tipo') || 'otro',
      fecha,
      fecha_firme: txt('fecha_firme') || 'aproximada',
      /* Nunca, por mucho que el cliente diga que la fecha está cerrada: la
         disponibilidad la confirma el espacio, no el formulario. Era la
         condición de Álvaro y es la única que no depende de un dato. */
      espacio_confirmado: false,
      pax,
      duracion,
      idioma_evento: txt('idioma_evento') || null,
      objetivo: txt('objetivo') || null,
      restricciones: [txt('restricciones'), txt('catering') === 'ninguna' ? 'No hace falta comida.' : '',
                      txt('origen_transporte') ? `Salen desde ${txt('origen_transporte')}.` : '']
        .filter(Boolean).join(' ') || null,
    },
    espacio,
    programa: horas(ordenadas, opciones, duracion),
    a_medida: null,
    validez_dias: 30,
    /* Para la llamada, no para el documento. */
    comercial: { quien_decide: txt('quien_decide') || null, cuando_decide: txt('cuando_decide') || null },
  };

  /* --- Apartar lo que no encaja ----------------------------------------
     Se pasa por la misma comprobación que el comando, y lo que falla se quita
     en vez de tumbar el borrador. */
  const descartes = [];
  let { fallos } = comprobar(evento, { opciones, espacios });

  const delEspacio = fallos.filter(f => f.que === 'espacio');
  if (delEspacio.length) {
    delEspacio.forEach(f => descartes.push({ id: evento.espacio, motivo: f.motivo + ' · el espacio se queda fuera del documento' }));
    evento.espacio = null;
    ({ fallos } = comprobar(evento, { opciones, espacios }));
  }

  const fuera = new Set(fallos.filter(f => f.que === 'opcion').map(f => f.id));
  fallos.filter(f => f.que === 'opcion').forEach(f => descartes.push({ id: f.id, motivo: f.motivo }));
  if (fuera.size) {
    evento.programa = horas(ordenadas.filter(id => !fuera.has(id)), opciones, duracion);
  }

  /* --- Lo que hay que mirar antes de enviar ---------------------------- */
  const avisos = [];
  if (!evento.programa.length) {
    avisos.push(ordenadas.length ? 'Nada de lo que pidió encaja: el programa está vacío y hay que proponerlo entero.'
                                 : 'No ha marcado ninguna experiencia: el programa está vacío y hay que proponerlo entero.');
  }
  if (!evento.espacio) { avisos.push('Sin espacio: el documento dice que lo proponemos nosotros. Decide cuál antes de enviarlo.'); }
  const elEspacio = espacios.find(e => e.id === evento.espacio);
  if (deducido && elEspacio) { avisos.push(`No eligió espacio: sale ${elEspacio.nombre} por lo que ha marcado. Confírmalo antes de enviar.`); }
  /* Un espacio con horario no se ve en las horas del programa hasta que
     alguien suma. Se suma aquí. */
  const horario = (elEspacio?.restricciones || []).find(r => r.tipo === 'horario');
  const [abre, cierra] = (String(horario?.valor ?? '').match(/^(\d{1,2})-(\d{1,2})$/) || []).slice(1).map(Number);
  if (cierra && evento.programa.length) {
    const empieza = Math.min(...evento.programa.map(p => minutos(p.hora)));
    const acaba = Math.max(...evento.programa.map(p => minutos(p.hora) + dura(p.opcion, opciones)));
    const fuera = [empieza < abre * 60 ? `empieza a las ${hhmm(empieza)}` : '',
                   acaba > cierra * 60 ? `acaba a las ${hhmm(acaba)}` : ''].filter(Boolean);
    if (fuera.length) { avisos.push(`${elEspacio.nombre} abre de ${abre} a ${cierra} h y el programa ${fuera.join(' y ')}: ajústalo con el espacio antes de enviar.`); }
  }
  if (!fecha) { avisos.push('Sin fecha: la portada sale con un guion. Pregúntala antes de enviar.'); }
  if (evento.a_traves_de) { avisos.push(`Viene a través de «${evento.a_traves_de}»: decide la marca —propia, coproducida o blanca— antes de montar el PDF.`); }
  if (duracion === 'dos-dias') { avisos.push('Dos días o más: el programa que sale es de un día. El segundo se escribe a mano.'); }
  if (txt('presupuesto_orientativo')) { avisos.push('Ha dado un presupuesto orientativo: está en la ficha del CRM y no entra en el documento.'); }

  return { evento, descartes, avisos };
}
