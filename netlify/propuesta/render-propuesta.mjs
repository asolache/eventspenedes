/* =============================================================================
   GENERADO · no editar aquí.

   Copia de tools/lib/render-propuesta.mjs del repositorio privado
   eventspenedes-tarifas, puesta al día con:

     node tools/sync-web.mjs --web ../eventspenedes

   Se edita allí, donde está el catálogo y donde corren las guardas. Aquí se
   edita y la próxima copia se lo lleva por delante —y la guarda del repositorio
   privado lo dice antes, en CI—.
   ========================================================================== */
/* ---- fin de la cabecera generada ---- */
/* =============================================================================
   Events Penedès · el documento de la propuesta, en una sola función

   Esto es lo que monta la propuesta, y vive aquí —y no en el comando— por una
   razón: **la página que se lee en el móvil y el PDF que se adjunta al correo
   tienen que ser el mismo documento**. Si el PDF se montara con un código y la
   página con otro, el día que se cambie un párrafo se cambiará en uno de los
   dos y nadie lo notará hasta que un cliente compare.

   Una fuente, dos salidas:

     tools/build-propuesta.mjs            → HTML + PDF, en la máquina de Álvaro
     netlify/functions/borrador.mjs       → la página privada del borrador

   El módulo es **puro**: no lee ficheros, no toca la red y no mira el entorno.
   Lo que necesita se le pasa. Así puede correr dentro de una función de
   Netlify, donde no hay disco donde leer `data/`.

   **Sin importes, y no por omisión.** No hay ningún camino en este fichero por
   el que entre un precio: no se le pasan. Esconder una cifra con CSS no la
   quita —sigue en el texto, se selecciona y se busca—.
   ========================================================================== */

export const IDIOMAS = ['es', 'ca', 'en'];
export const MARCAS = ['propia', 'coproducida', 'blanca'];

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* --- Textos --------------------------------------------------------------- */

const TEXTOS = {
  es: { propuesta: 'Propuesta', para: 'Para', fecha: 'Fecha', pendiente: 'pendiente de confirmar con el espacio',
        confirmada: 'confirmada con el espacio', personas: 'personas', sello: 'Propuesta · sin precio',
        contado: 'Lo que nos habéis contado', objetivo: 'El objetivo', detalle: 'El detalle',
        espacioH: 'El espacio', programaH: 'El programa del día', experiencias: 'Las experiencias',
        ahora: 'Qué pasa ahora', aforo: 'Aforo máximo', tipos: 'Tipo de acto', cocina: 'Cocina',
        salas: 'Salas de reunión', requiere: 'Necesita', porProponer: 'El espacio, por proponer',
        porProponerT: 'Con lo que nos habéis contado hay más de un espacio que encaja. Os proponemos el que mejor funcione para el grupo y el tipo de acto cuando confirmemos disponibilidad para la fecha.',
        pasos: ['Nos decís qué cambiaríais del programa.', 'Confirmamos disponibilidad del espacio y de los proveedores para la fecha.', 'Os pasamos el presupuesto cerrado.', 'Con la reserva del 75 % la fecha queda bloqueada.'],
        validez: d => `Esta propuesta es válida ${d} días. <strong>Las fechas no quedan bloqueadas hasta la reserva.</strong>`,
        sinprecio: 'Este documento no lleva precios a propósito: primero acordamos el programa. La producción se factura por horas y los servicios van a su precio, sin comisión por encima.' },
  ca: { propuesta: 'Proposta', para: 'Per a', fecha: 'Data', pendiente: 'pendent de confirmar amb l’espai',
        confirmada: 'confirmada amb l’espai', personas: 'persones', sello: 'Proposta · sense preu',
        contado: 'El que ens heu explicat', objetivo: 'L’objectiu', detalle: 'El detall',
        espacioH: 'L’espai', programaH: 'El programa del dia', experiencias: 'Les experiències',
        ahora: 'Què passa ara', aforo: 'Aforament màxim', tipos: 'Tipus d’acte', cocina: 'Cuina',
        salas: 'Sales de reunió', requiere: 'Necessita', porProponer: 'L’espai, per proposar',
        porProponerT: 'Amb el que ens heu explicat hi ha més d’un espai que encaixa. Us proposem el que funcioni millor per al grup i el tipus d’acte quan confirmem disponibilitat per a la data.',
        pasos: ['Ens dieu què canviaríeu del programa.', 'Confirmem disponibilitat de l’espai i dels proveïdors per a la data.', 'Us passem el pressupost tancat.', 'Amb la reserva del 75 % la data queda bloquejada.'],
        validez: d => `Aquesta proposta és vàlida ${d} dies. <strong>Les dates no queden bloquejades fins a la reserva.</strong>`,
        sinprecio: 'Aquest document no porta preus a posta: primer acordem el programa. La producció es factura per hores i els serveis van al seu preu, sense comissió per sobre.' },
  en: { propuesta: 'Proposal', para: 'For', fecha: 'Date', pendiente: 'pending confirmation with the venue',
        confirmada: 'confirmed with the venue', personas: 'people', sello: 'Proposal · no pricing',
        contado: 'What you told us', objetivo: 'The goal', detalle: 'The detail',
        espacioH: 'The venue', programaH: 'The programme', experiencias: 'The experiences',
        ahora: 'What happens next', aforo: 'Maximum capacity', tipos: 'Type of event', cocina: 'Kitchen',
        salas: 'Meeting rooms', requiere: 'Needs', porProponer: 'The venue, to be proposed',
        porProponerT: 'From what you have told us, more than one venue fits. We will propose the one that works best for the group and the type of event once we confirm availability for the date.',
        pasos: ['You tell us what you would change in the programme.', 'We confirm availability of the venue and suppliers for the date.', 'We send you the closed budget.', 'With the 75 % deposit the date is held.'],
        validez: d => `This proposal is valid for ${d} days. <strong>Dates are not held until the deposit.</strong>`,
        sinprecio: 'This document carries no pricing on purpose: first we agree the programme. Production is billed by the hour and services go at their price, with no commission on top.' },
};

/* El título de la portada va en el idioma del documento. Las palabras del
   cliente NO se traducen —son suyas— y por eso viven en la cita de dentro, no
   en el titular. */
const TIPOS = {
  es: { convencion:'Convención de empresa', incentivo:'Incentivo', teambuilding:'Jornada de equipo',
        celebracion:'Celebración de empresa', presentacion:'Presentación de producto', otro:'Evento de empresa' },
  ca: { convencion:'Convenció d’empresa', incentivo:'Incentiu', teambuilding:'Jornada d’equip',
        celebracion:'Celebració d’empresa', presentacion:'Presentació de producte', otro:'Acte d’empresa' },
  en: { convencion:'Company convention', incentivo:'Incentive', teambuilding:'Team day',
        celebracion:'Company celebration', presentacion:'Product launch', otro:'Company event' },
};
const EN_EL_PENEDES = { es: 'en el Penedès', ca: 'al Penedès', en: 'in the Penedès' };
const MESES = {
  es: ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'],
  ca: ['gener','febrer','març','abril','maig','juny','juliol','agost','setembre','octubre','novembre','desembre'],
  en: ['January','February','March','April','May','June','July','August','September','October','November','December'],
};

export const fechaLarga = (f, idioma) => {
  if (!f) { return null; }
  const [a, m, d] = String(f).split('-').map(Number);
  if (!a || !m || !d) { return null; }
  return idioma === 'en' ? `${MESES.en[m - 1]} ${d}, ${a}` : `${d} de ${MESES[idioma][m - 1]} de ${a}`;
};

export const limpio = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();

/* --- Que no se pueda montar una propuesta imposible ----------------------
   Esto va antes de escribir una sola línea del documento. Una propuesta que se
   contradice con la ficha del espacio es peor que no mandarla: la lee el
   espacio y queda en evidencia.

   Devuelve los fallos en vez de salirse: quien llama decide si para —el
   comando— o si los aparta y sigue —el borrador automático, que no puede
   fallar por un briefing que pide algo imposible: justo ahí es cuando más
   falta hace ver el documento—. */
export function comprobar(ev, { opciones, espacios }) {
  const fallos = [];
  const espacio = ev.espacio ? (espacios.find(e => e.id === ev.espacio) || null) : null;
  const pax = ev.evento?.pax ?? null;

  if (ev.espacio && !espacio) { fallos.push({ que: 'espacio', motivo: `el espacio «${ev.espacio}» no está en el catálogo de espacios` }); }
  if (espacio && pax && espacio.ficha.aforo.max && pax > espacio.ficha.aforo.max) {
    fallos.push({ que: 'espacio', id: espacio.id, motivo: `${pax} personas en ${espacio.nombre}, que admite ${espacio.ficha.aforo.max}` });
  }

  const programa = [];
  for (const p of (ev.programa || [])) {
    const o = opciones.find(x => x.id === p.opcion);
    if (!o) { fallos.push({ que: 'opcion', id: p.opcion, motivo: `la opción «${p.opcion}» no está en el catálogo` }); continue; }
    const suyos = [];
    if (pax && o.pax_min && pax < o.pax_min) { suyos.push(`${o.nombre.es} pide ${o.pax_min} personas como mínimo y el grupo es de ${pax}`); }
    if (pax && o.pax_max && pax > o.pax_max) { suyos.push(`${o.nombre.es} admite ${o.pax_max} personas y el grupo es de ${pax}`); }
    if (o.exige_espacio && ev.espacio !== o.exige_espacio) {
      suyos.push(`${o.nombre.es} solo se hace en ${o.exige_espacio}, y el evento es en ${ev.espacio || 'ningún espacio'}`);
    }
    /* El catering en exclusiva es la restricción que más presupuestos tumba, y
       no se ve hasta que el espacio lo dice. */
    const exclusivo = (espacio?.restricciones || []).find(r => r.tipo === 'catering_exclusivo');
    if (exclusivo && o.id === 'chef-autor') {
      suyos.push(`${espacio.nombre} tiene el catering en exclusiva de ${exclusivo.valor}: no se puede llevar chef propio`);
    }
    for (const l of IDIOMAS) {
      if (!o.nombre?.[l] || !o.describe?.[l]) { suyos.push(`${o.id} no tiene texto en ${l}`); }
    }
    if (suyos.length) { suyos.forEach(m => fallos.push({ que: 'opcion', id: o.id, motivo: m })); continue; }
    programa.push({ ...p, o });
  }

  return { fallos, espacio, programa };
}

/* --- El documento --------------------------------------------------------- */

/**
 * @param ev         el evento (eventos/<id>.json)
 * @param opciones   catálogo de opciones, campos publicables
 * @param espacios   catálogo de espacios, campos publicables
 * @param idioma     es | ca | en
 * @param marca      { modo, de, para }
 * @param modo       'cliente' (lo que se envía) | 'borrador' (lo que lees tú)
 * @param descartes  [{ id, motivo }] · lo que pidió y no encaja
 * @param avisos     [str] · lo que hay que mirar antes de enviar
 *
 * `descartes` y `avisos` **solo se escriben en modo borrador**. No se ocultan
 * con CSS: en modo cliente este HTML no existe, porque un aviso escondido con
 * una regla de estilo acaba dentro del PDF que se adjunta a un correo.
 */
export function render({ ev, opciones, espacios, idioma = 'es', marca = {}, modo = 'cliente', descartes = [], avisos = [] }) {
  if (!IDIOMAS.includes(idioma)) { throw new Error(`idioma «${idioma}»: solo ${IDIOMAS.join(', ')}`); }
  if (!MARCAS.includes(marca.modo || 'propia')) { throw new Error('marca: propia, coproducida o blanca'); }
  if ((marca.modo || 'propia') !== 'propia' && !marca.de) {
    throw new Error(`en modo «${marca.modo}» hace falta el nombre de la agencia: un documento en marca blanca sin marca no es de nadie`);
  }

  const T = TEXTOS[idioma];
  const esBorrador = modo === 'borrador';
  const { espacio, programa } = comprobar(ev, { opciones, espacios });
  const ev2 = ev.evento || {};
  const pax = ev2.pax ?? null;
  const modoMarca = marca.modo || 'propia';

  /* --- La marca --------------------------------------------------------
     En blanca no basta con quitar el logotipo de la portada: hay que quitarlo
     del pie de cada página, de los metadatos del PDF y del nombre del
     fichero. Es lo que se olvida, así que es lo que comprueba la guarda. */
  const FIRMA = modoMarca === 'blanca' ? marca.de
              : modoMarca === 'coproducida' ? `${marca.de} · Events Penedès`
              : 'Events Penedès';
  const PIE = modoMarca === 'blanca' ? esc(marca.de)
            : 'Events Penedès · Torrelles de Foix · +34 629 86 77 15';

  const confirmado = ev2.espacio_confirmado === true;
  const estadoFecha = confirmado ? T.confirmada : T.pendiente;

  const fichaEspacio = espacio ? `
  <section>
    <h2>${T.espacioH}</h2>
    <h3>${esc(espacio.nombre)}${espacio.poblacion ? ` <span class="micro">· ${esc(espacio.poblacion)}</span>` : ''}</h3>
    <table>
      <tr><th>${T.aforo}</th><td>${esc(espacio.ficha.aforo.texto?.[idioma] || '—')}</td></tr>
      <tr><th>${T.tipos}</th><td>${esc(espacio.ficha.tipos_evento.texto?.[idioma] || '—')}</td></tr>
      <tr><th>${T.cocina}</th><td>${esc(espacio.ficha.cocina.texto?.[idioma] || '—')}</td></tr>
      <tr><th>${T.salas}</th><td>${esc(espacio.ficha.salas_reunion.texto?.[idioma] || '—')}</td></tr>
    </table>
    ${(espacio.restricciones || []).length ? '<ul>' + espacio.restricciones.map(r => `<li>${esc(r.motivo)}</li>`).join('') + '</ul>' : ''}
  </section>` : `
  <section>
    <h2>${T.porProponer}</h2>
    <p>${T.porProponerT}</p>
  </section>`;

  const filasPrograma = programa.map(p => `
  <tr>
    <td class="acc">${esc(p.hora || '—')}</td>
    <td><strong>${esc(p.o.nombre[idioma])}</strong>${p.o.duracion_min ? `<br><span class="micro">${p.o.duracion_min} min</span>` : ''}</td>
  </tr>`).join('');

  const experiencias = programa.map(p => `
  <div>
    <h3>${esc(p.o.nombre[idioma])}</h3>
    <p>${esc(p.o.describe[idioma])}</p>
    ${(p.o.requiere || []).length ? `<p class="micro">${T.requiere}: ${p.o.requiere.map(esc).join(' · ')}</p>` : ''}
  </div>`).join('');

  /* --- La capa del borrador -------------------------------------------
     Solo en modo borrador, y por eso no es un `display:none`: en modo cliente
     este HTML **no se escribe**. Un aviso oculto con CSS acaba en el PDF que
     se adjunta a un correo. */
  const avisoBorrador = !esBorrador ? '' : `
  <div class="borrador">
    <strong>Borrador automático · no se ha enviado a nadie</strong>
    <p>Lo ha montado el sistema con lo que el cliente escribió en el formulario.
    Las horas del programa son una propuesta calculada con las duraciones del
    catálogo, no un horario. Antes de enviarlo: confirmar disponibilidad del
    espacio y de los proveedores para la fecha, y escribir el párrafo que
    responde a lo que pidió —eso es lo que vende, y no lo escribe la máquina—.
    El PDF se genera desde tu máquina.</p>
    ${avisos.length ? '<ul>' + avisos.map(a => `<li>${esc(a)}</li>`).join('') + '</ul>' : ''}
    ${ev.cliente?.correo || ev.cliente?.telefono ? `<p class="micro">${esc([ev.cliente.persona, ev.cliente.correo, ev.cliente.telefono].filter(Boolean).join(' · '))}</p>` : ''}
  </div>`;

  const avisoDescartes = (!esBorrador || !descartes.length) ? '' : `
  <div class="borrador borrador--ojo">
    <strong>Pidió cosas que no encajan, y están fuera del documento</strong>
    <ul>${descartes.map(d => `<li>${esc(d.motivo)}</li>`).join('')}</ul>
    <p>Esto no se le dice así: se le llama y se le propone la alternativa.</p>
  </div>`;

  const titulo = modoMarca === 'blanca'
    ? `${T.propuesta} · ${marca.para || marca.de}`
    : `${T.propuesta} · ${marca.para || ''}`.trim();

  const html = `<!DOCTYPE html>
<html lang="${idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(titulo)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  @page :first { margin: 0; }
  :root { --tinta:#16161a; --suave:#5a5a66; --linea:#d8d8de; --oro:#a8781f; --crema:#faf8f4; }
  * { box-sizing: border-box; }
  body { margin:0; font-family:"DejaVu Sans","Liberation Sans",Arial,sans-serif; font-size:10pt; line-height:1.55; color:var(--tinta); }
  .portada { height:297mm; padding:38mm 22mm 20mm; background:var(--tinta); color:#fff; page-break-after:always; display:flex; flex-direction:column; }
  .portada__marca { font-size:11pt; letter-spacing:.22em; text-transform:uppercase; color:var(--oro); }
  .portada h1 { font-size:28pt; line-height:1.15; margin:14mm 0 0; font-weight:700; letter-spacing:-.01em; }
  .portada__para { margin-top:14mm; padding-top:6mm; border-top:1px solid rgba(255,255,255,.22); }
  .portada__para span { display:block; font-size:8.5pt; letter-spacing:.14em; text-transform:uppercase; color:#8d8d99; }
  .portada__para strong { font-size:15pt; font-weight:600; }
  .portada__pie { margin-top:auto; font-size:9pt; color:#9a9aa6; }
  .sello { align-self:flex-start; display:inline-block; margin-top:8mm; padding:2.4mm 4mm; border:1px solid var(--oro); color:var(--oro); font-size:8pt; letter-spacing:.14em; text-transform:uppercase; }
  h2 { font-size:15pt; margin:0 0 1mm; letter-spacing:-.01em; page-break-after:avoid; }
  h3 { font-size:11pt; margin:7mm 0 2mm; page-break-after:avoid; }
  section { page-break-inside:avoid; margin-bottom:11mm; }
  p { margin:0 0 3mm; }
  table { width:100%; border-collapse:collapse; margin:3mm 0 2mm; font-size:9.5pt; }
  th, td { padding:2.2mm 2.5mm; border-bottom:1px solid var(--linea); text-align:left; vertical-align:top; }
  th { font-size:7.8pt; letter-spacing:.1em; text-transform:uppercase; color:var(--suave); font-weight:600; width:38mm; }
  td.acc { color:var(--oro); font-weight:600; width:18mm; white-space:nowrap; }
  ul { margin:2mm 0 3mm; padding-left:4.5mm; }
  li { margin-bottom:1.1mm; }
  ol { margin:2mm 0 3mm; padding-left:5mm; }
  .nota { background:var(--crema); border-left:2.5px solid var(--oro); padding:3.5mm 4mm; margin:4mm 0; font-size:9pt; }
  .nota strong { color:var(--oro); }
  .micro { font-size:8.5pt; color:var(--suave); }
  .cita { border-left:2.5px solid var(--linea); padding-left:4mm; font-size:10.5pt; }
  .borrador { border:1px solid var(--oro); background:#fffaf0; padding:4mm; margin:0 0 8mm; font-size:9.5pt; }
  .borrador strong { display:block; color:var(--oro); text-transform:uppercase; letter-spacing:.08em; font-size:8.5pt; margin-bottom:2mm; }
  .borrador p:last-child { margin-bottom:0; }
  .borrador--ojo { border-color:#a32f2f; background:#fdf3f3; }
  .borrador--ojo strong { color:#a32f2f; }

  /* En pantalla esto se lee en el móvil, así que el A4 se deja para la
     impresión: una portada de 297 mm de alto en un teléfono es una pantalla
     vacía con una palabra arriba. */
  @media screen {
    body { font-size:16px; background:#f2f1ee; }
    .hoja { max-width:46rem; margin:0 auto; background:#fff; padding:0 1.25rem 2.5rem; }
    .portada { height:auto; padding:2.5rem 1.5rem; margin:0 -1.25rem 2rem; }
    .portada h1 { font-size:1.9rem; margin:1.5rem 0 0; }
    .portada__para { margin-top:1.5rem; padding-top:1rem; }
    .portada__para span { font-size:.7rem; }
    .portada__para strong { font-size:1.1rem; }
    .portada__marca { font-size:.8rem; }
    .portada__pie { margin-top:2rem; font-size:.8rem; }
    .sello { margin-top:1.25rem; padding:.4rem .7rem; font-size:.7rem; }
    h2 { font-size:1.3rem; }
    h3 { font-size:1.05rem; margin:1.5rem 0 .4rem; }
    section { margin-bottom:2.5rem; }
    p { margin:0 0 .8rem; }
    table { font-size:.95rem; margin:.8rem 0; }
    th, td { padding:.55rem .6rem; }
    th { width:9rem; font-size:.7rem; }
    td.acc { width:4.5rem; }
    .borrador { padding:1rem; margin:0 0 2rem; font-size:.95rem; }
    .borrador strong { font-size:.75rem; margin-bottom:.5rem; }
    .nota { padding:1rem; font-size:.95rem; }
    .micro { font-size:.85rem; }
    ul, ol { padding-left:1.2rem; }
    li { margin-bottom:.25rem; }
  }
  @media screen and (max-width: 32rem) {
    .portada h1 { font-size:1.5rem; }
    th { width:auto; display:block; border-bottom:0; padding-bottom:0; }
    td { display:block; padding-top:.15rem; }
    td.acc { width:auto; }
  }
</style>
</head>
<body>
<div class="hoja">

<div class="portada">
  <div class="portada__marca">${esc(FIRMA)}</div>
  <h1>${esc((TIPOS[idioma][ev2.tipo] || TIPOS[idioma].otro) + ' ' + EN_EL_PENEDES[idioma])}</h1>
  <div class="portada__para">
    <span>${T.para}</span>
    <strong>${esc(marca.para || '—')}</strong>
  </div>
  <div class="portada__para">
    <span>${T.fecha}</span>
    <strong>${esc(fechaLarga(ev2.fecha, idioma) || '—')}</strong>
    <div class="micro" style="color:#b9b9c4">${esc(estadoFecha)}${pax ? ` · ${pax} ${T.personas}` : ''}</div>
  </div>
  <div class="sello">${T.sello}</div>
  <div class="portada__pie">${PIE}</div>
</div>
${avisoBorrador}${avisoDescartes}
<section>
  <h2>${T.contado}</h2>
  ${ev2.objetivo ? `<p class="cita">${esc(ev2.objetivo)}</p>` : ''}
  ${ev2.restricciones ? `<p class="micro">${T.detalle}: ${esc(ev2.restricciones)}</p>` : ''}
</section>

${fichaEspacio}

<section>
  <h2>${T.programaH}</h2>
  <table>${filasPrograma}</table>
  ${ev.a_medida ? `<p>${esc(ev.a_medida)}</p>` : ''}
</section>

<section>
  <h2>${T.experiencias}</h2>
  ${experiencias}
</section>

<section>
  <h2>${T.ahora}</h2>
  <ol>${T.pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
  <div class="nota">
    <p>${T.validez(ev.validez_dias || 30)}</p>
    <p style="margin:0">${T.sinprecio}</p>
  </div>
  <p class="micro">${PIE}</p>
</section>

</div>
</body>
</html>
`;

  const base = `${modoMarca === 'blanca' ? limpio(marca.de) : 'propuesta'}-${limpio(ev.id)}-${idioma}`;
  return { html, titulo, base, programa, espacio, confirmado };
}
