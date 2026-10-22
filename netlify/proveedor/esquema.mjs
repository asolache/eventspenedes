/* =============================================================================
   Events Penedès · la ficha de un proveedor, escrita una vez

   Catering, catas, guías, transporte, música, fotografía, técnica… Un solo
   formulario para todos: lo común (quiénes sois, la persona de contacto, los
   servicios con su precio, las condiciones, la publicación) y un bloque propio
   por categoría, que se abre según lo que marquen.

   De aquí salen los campos de `alta-proveedor.html` (los genera
   `tools/build-fichas.mjs`), la ficha que `netlify/functions/lead.mjs` deja en
   Zoho y lo que se importa de una web o un catálogo. Cómo se lee y se escribe
   una ficha está en `netlify/ficha/nucleo.mjs`, igual que la de localización.

   Lo que más importa son los SERVICIOS: cada uno con su precio cerrado, su
   unidad y lo que incluye, para poder proponerlo sin idas y venidas. Son el
   coste paquetizado de cada proveedor y lo que acaba en `data/proveedores.json`
   del repositorio privado (`tools/importar-proveedor.mjs`).
   ========================================================================== */
import { UNIDAD_SERVICIO, COMISION_TIPO, COMISION_GENERAL, CONTACTO, AMPLIA, NO_IMPORTA_AMPLIA, ficha } from '../ficha/nucleo.mjs';

export const FORM = 'proveedor';

/* La única lista de categorías. La clave es la de «Entra en la red»
   (red.html); `zoho` es su etiqueta en el CRM y `tarifas`, su `categoria` en
   data/proveedores.json. Los espacios tienen su propia ficha. */
export const CATEGORIAS = {
  restauracion: { l: 'Restauración y catering', zoho: 'Catering', tarifas: 'catering' },
  catas: { l: 'Catas de vino, cava o aceite', zoho: 'Catas', tarifas: 'cata' },
  guias: { l: 'Guías y actividades', zoho: 'Guías y actividades', tarifas: 'guia' },
  transporte: { l: 'Transporte', zoho: 'Transporte', tarifas: 'movilidad' },
  alojamiento: { l: 'Alojamiento', zoho: 'Alojamiento', tarifas: 'alojamiento' },
  musica: { l: 'Música y espectáculos', zoho: 'Música', tarifas: 'musica' },
  ocio: { l: 'Ocio y experiencias', zoho: 'Experiencias', tarifas: 'actividad' },
  rrpp: { l: 'Protocolo, RRPP y fotografía', zoho: 'Foto y protocolo', tarifas: 'rrpp' },
  eventos: { l: 'Producción y técnica de eventos', zoho: 'Técnica', tarifas: 'tecnica' },
  otro: { l: 'Otro', zoho: null, tarifas: 'otro' },
};
const NOMBRES_CATEGORIA = Object.fromEntries(Object.entries(CATEGORIAS).map(([k, c]) => [k, c.l]));

/* Los perfiles de «Entra en la red»: los espacios y las categorías de aquí */
export const PERFILES_RED = { localizacion: 'Espacio para eventos', ...NOMBRES_CATEGORIA };

/* Qué categorías abren solas cada bloque. Quien hace dos cosas marca la
   segunda en «Además ofrecéis», o abre el bloque a mano. */
export const ABRE = {
  ofrece_catering: ['restauracion'],
  ofrece_cata: ['catas'],
  ofrece_actividad: ['guias', 'ocio'],
  ofrece_transporte: ['transporte'],
  ofrece_alojamiento: ['alojamiento'],
  ofrece_musica: ['musica'],
  ofrece_imagen: ['rrpp'],
  ofrece_tecnica: ['eventos'],
};

export const SERVICIOS = 20;

/* Un servicio es siempre lo mismo, para poder compararlo entre proveedores:
   qué es, precio, por qué unidad, para cuántos, cuánto dura y qué incluye. */
const SERVICIO = [
  { n: 'nombre', l: 'Qué es', t: 'text', hint: 'Menú de mediodía, ruta de 2 h por la viña, actuación del cuarteto, trayecto Barcelona–finca…' },
  { n: 'precio', l: 'Precio (€)', t: 'eur' },
  { n: 'unidad', l: 'El precio es', t: 'select', op: UNIDAD_SERVICIO },
  { n: 'iva', l: 'Lleva IVA', t: 'sino' },
  { n: 'pax_min', l: 'Mínimo de personas', t: 'number' },
  { n: 'pax_max', l: 'Máximo de personas', t: 'number' },
  { n: 'duracion', l: 'Duración', t: 'text' },
  { n: 'no_incluye', l: 'Qué va aparte', t: 'text', hint: 'Desplazamiento, equipo de sonido, material…' },
  { n: 'incluye', l: 'Qué incluye', t: 'textarea' },
  { n: 'comision', l: 'Comisión para Events Penedès', t: 'number', dec: true, interno: true, hint: 'En blanco, vale la general. 0 si no es comisionable.' },
  { n: 'comision_tipo', l: 'La comisión es', t: 'select', op: COMISION_TIPO, interno: true },
];

const IDIOMAS = { ca: 'Catalán', es: 'Castellano', en: 'Inglés', fr: 'Francés', de: 'Alemán' };
const bloque = (id, titulo, interruptor, campos) => ({ id, titulo, destino: 'web', si: `ofrece_${id}`, interruptor, campos });
const notas = (n, hint) => ({ n, l: 'Notas', t: 'textarea', hint });

export const SECCIONES = [
  {
    id: 'proveedor', titulo: 'Quiénes sois', destino: 'web',
    campos: [
      { n: 'nombre', l: 'Nombre del negocio', t: 'text', req: true, ac: 'organization' },
      { n: 'categoria', l: 'Lo principal que ofrecéis', t: 'select', op: NOMBRES_CATEGORIA, req: true },
      { n: 'tambien', l: 'Además ofrecéis', t: 'checks', hint: 'Marca todas las que hagáis también. Cada una abre su bloque más abajo.', op: Object.fromEntries(Object.entries(NOMBRES_CATEGORIA).filter(([k]) => k !== 'otro')) },
      { n: 'poblacion', l: 'Población', t: 'text', ac: 'address-level2' },
      { n: 'zona', l: 'Dónde trabajáis', t: 'select', op: { penedes: 'En el Penedès', catalunya: 'En toda Cataluña', fuera: 'También fuera de Cataluña' } },
      { n: 'web', l: 'Web', t: 'url' },
      { n: 'telefono', l: 'Teléfono del negocio', t: 'tel', hint: 'El general. El de la persona va abajo.' },
      { n: 'idiomas', l: 'Idiomas en que trabajáis', t: 'checks', op: IDIOMAS },
      { n: 'descripcion', l: 'Qué os hace diferentes', t: 'textarea',
        hint: 'El párrafo con el que os presentaríamos a un cliente: quiénes sois, qué hacéis como nadie, de dónde sale lo que ofrecéis.' },
    ],
  },
  CONTACTO,
  bloque('catering', 'Restauración y catering', 'Ofrecéis restauración o catering', [
    { n: 'catering_formatos', l: 'Formatos', t: 'checks', op: {
      desayuno: 'Desayuno', coffee: 'Coffee break', coctel: 'Cóctel o aperitivo', menu: 'Menú sentado', buffet: 'Buffet',
      brasa: 'Brasa o barbacoa', picnic: 'Picnic o cesta', foodtruck: 'Food truck' } },
    { n: 'catering_pax_min', l: 'Mínimo de comensales', t: 'number' },
    { n: 'catering_pax_max', l: 'Máximo de comensales', t: 'number' },
    { n: 'catering_cocina', l: 'Qué necesitáis del espacio', t: 'select',
      op: { nada: 'Nada: lo traemos todo', office: 'Un office para emplatar', cocina: 'Una cocina equipada' } },
    { n: 'catering_personal', l: 'Incluye personal de sala', t: 'sino' },
    { n: 'catering_menaje', l: 'Incluye vajilla y mantelería', t: 'sino' },
    { n: 'catering_dietas', l: 'Dietas que cubrís', t: 'checks', op: {
      vegetariana: 'Vegetariana', vegana: 'Vegana', gluten: 'Sin gluten', alergias: 'Alergias, bajo pedido', halal: 'Halal' } },
    notas('catering_notas', 'Producto, de dónde sale, hasta qué hora servís, qué pasa si sube el número de comensales.'),
  ]),
  bloque('cata', 'Catas', 'Ofrecéis catas', [
    { n: 'cata_productos', l: 'Qué se cata', t: 'checks', op: { vino: 'Vino', cava: 'Cava', aceite: 'Aceite', vermut: 'Vermut', cerveza: 'Cerveza', otros: 'Otros productos' } },
    { n: 'cata_lugar', l: 'Dónde', t: 'select', op: { propio: 'En nuestra casa', desplazada: 'Vamos donde sea el evento', ambos: 'Las dos cosas' } },
    { n: 'cata_duracion', l: 'Duración', t: 'text' },
    { n: 'cata_pax_max', l: 'Máximo de personas por grupo', t: 'number' },
    notas('cata_notas', 'Quién la guía, qué se cata, si se adapta a empresa.'),
  ]),
  bloque('actividad', 'Guías y actividades', 'Ofrecéis actividades o visitas guiadas', [
    { n: 'actividad_tipos', l: 'Qué hacéis', t: 'checks', op: {
      ruta: 'Ruta o visita guiada', taller: 'Taller', aventura: 'Deporte o aventura', cultura: 'Cultura y tradición',
      naturaleza: 'Naturaleza y paisaje', gastronomia: 'Gastronomía', equipo: 'Dinámica de equipo' } },
    { n: 'actividad_duracion', l: 'Duración', t: 'text' },
    { n: 'actividad_lugar', l: 'Se hace', t: 'select', op: { interior: 'En interior', exterior: 'Al aire libre', ambos: 'En interior o al aire libre' } },
    { n: 'actividad_pax_min', l: 'Mínimo de personas', t: 'number' },
    { n: 'actividad_pax_max', l: 'Máximo de personas', t: 'number' },
    { n: 'actividad_material', l: 'Material incluido', t: 'sino' },
    { n: 'actividad_seguro', l: 'Seguro de responsabilidad civil', t: 'sino' },
    { n: 'actividad_pmr', l: 'Apta para movilidad reducida', t: 'sino' },
    { n: 'actividad_lluvia', l: 'Si llueve', t: 'text' },
    notas('actividad_notas', 'Quién la guía, qué se lleva cada uno, a partir de cuántos se divide en grupos.'),
  ]),
  bloque('transporte', 'Transporte', 'Ofrecéis transporte', [
    { n: 'transporte_vehiculos', l: 'Vehículos', t: 'checks', op: {
      coche: 'Coche', van: 'Furgoneta (hasta 8)', minibus: 'Minibús', autocar: 'Autocar', otro: 'Otro (tren turístico, bicis…)' } },
    { n: 'transporte_plazas', l: 'Plazas del vehículo más grande', t: 'number' },
    { n: 'transporte_flota', l: 'Vehículos a la vez', t: 'number' },
    { n: 'transporte_conductor', l: 'Conductor incluido', t: 'sino' },
    { n: 'transporte_pmr', l: 'Vehículo adaptado', t: 'sino' },
    notas('transporte_notas', 'Desde dónde salís, esperas, horas nocturnas.'),
  ]),
  bloque('alojamiento', 'Alojamiento', 'Ofrecéis alojamiento', [
    { n: 'habitaciones', l: 'Habitaciones', t: 'number' },
    { n: 'plazas', l: 'Plazas para dormir', t: 'number' },
    { n: 'habitaciones_tipos', l: 'Tipos de habitación', t: 'text', hint: 'Dobles, suites, familiares, literas…' },
    { n: 'desayuno', l: 'Desayuno incluido', t: 'sino' },
    notas('alojamiento_notas', 'Entrada y salida, estancia mínima, temporada.'),
  ]),
  bloque('musica', 'Música y espectáculos', 'Ofrecéis música o espectáculos', [
    { n: 'musica_formatos', l: 'Formatos', t: 'checks', op: {
      dj: 'DJ', banda: 'Grupo en directo', solista: 'Solista o dúo', clasica: 'Clásica o cuarteto',
      espectaculo: 'Animación o espectáculo', popular: 'Cultura popular' } },
    { n: 'musica_sonido', l: 'Equipo de sonido', t: 'select',
      op: { incluido: 'Lo llevamos, incluido', aparte: 'Lo llevamos, va aparte', espacio: 'Usamos el del espacio' } },
    { n: 'musica_duracion', l: 'Duración de una actuación', t: 'text' },
    { n: 'musica_montaje', l: 'Montaje y prueba de sonido', t: 'text' },
    { n: 'musica_rider', l: 'Rider técnico (enlace)', t: 'url' },
    notas('musica_notas', 'Repertorio, si se adapta al momento del evento, potencia eléctrica que necesitáis.'),
  ]),
  bloque('imagen', 'Fotografía y protocolo', 'Ofrecéis fotografía, vídeo o protocolo', [
    { n: 'imagen_servicios', l: 'Qué hacéis', t: 'checks', op: {
      foto: 'Fotografía', video: 'Vídeo', dron: 'Dron', fotomaton: 'Fotomatón', protocolo: 'Protocolo', azafatas: 'Azafatas y acreditaciones' } },
    { n: 'imagen_entrega', l: 'Plazo de entrega', t: 'text' },
    notas('imagen_notas', 'Derechos de uso de las imágenes, formato de entrega.'),
  ]),
  bloque('tecnica', 'Producción y técnica', 'Ofrecéis técnica o producción', [
    { n: 'tecnica_equipos', l: 'Qué tenéis', t: 'checks', op: {
      sonido: 'Sonido', luces: 'Iluminación', pantallas: 'Pantallas y proyección', escenario: 'Escenario o tarima',
      carpa: 'Carpas', mobiliario: 'Mobiliario', generador: 'Generador', streaming: 'Streaming' } },
    { n: 'tecnica_personal', l: 'Técnico incluido', t: 'sino' },
    notas('tecnica_notas', 'Potencia, montaje y desmontaje, lo que necesitáis del espacio.'),
  ]),
  {
    id: 'servicios', titulo: 'Servicios y precios', destino: 'interno',
    nota: 'Cada servicio con su precio cerrado: qué es, cuánto cuesta y por qué unidad, para cuántos y qué incluye. Así lo podemos proponer sin idas y venidas. Precio neto para Events Penedès, sin IVA salvo que se diga. No se publica.',
    repite: { prefijo: 'servicio', n: SERVICIOS, campos: SERVICIO, etiqueta: 'Servicio', leyenda: 'Servicio', mas: 'Añadir otro servicio' },
  },
  {
    id: 'condiciones', titulo: 'Condiciones', destino: 'interno',
    nota: 'No se publican: sirven para preparar presupuestos. Lo que no tengáis claro, en blanco.',
    campos: [
      { n: 'iva_incluido', l: 'Los precios llevan IVA', t: 'sino', hint: 'Si no se dice, se entienden sin IVA.' },
      { n: 'minimo_facturacion', l: 'Facturación mínima (€)', t: 'eur' },
      { n: 'desplazamiento', l: 'Desplazamiento', t: 'text', hint: 'Incluido hasta cierta distancia, precio por km, dietas…' },
      { n: 'antelacion', l: 'Antelación para reservar', t: 'text' },
      { n: 'temporada', l: 'Temporada alta y fechas sin disponibilidad', t: 'text' },
      { n: 'reserva', l: 'Reserva y cancelación', t: 'textarea', hint: 'Señal, plazos, qué pasa si se cancela.' },
      { n: 'comision', l: 'Comisión general para Events Penedès', t: 'number', dec: true, interno: true },
      { n: 'comision_tipo', l: 'La comisión general es', t: 'select', op: COMISION_GENERAL, interno: true },
      { n: 'condiciones_notas', l: 'Notas de tarifas', t: 'textarea', hint: 'Lo que no cabe arriba, tal cual.' },
    ],
  },
  {
    id: 'publicacion', titulo: 'Fotos y publicación', destino: 'web',
    campos: [
      { n: 'fotos_enlace', l: 'Fotos, vídeos o dossier', t: 'url', hint: 'Drive, Dropbox o vuestra web. Las fotos no se suben aquí.' },
      { n: 'tarifas_enlace', l: 'Catálogo o tarifas', t: 'url', hint: 'El PDF de tarifas, si lo tenéis en línea.' },
      { n: 'fotos_permiso', l: 'Permiso para publicar las fotos', t: 'select',
        op: { escrito: 'Sí, por escrito', verbal: 'De palabra: falta por escrito', no: 'No', pedir: 'Hay que pedirlo' } },
      { n: 'autoriza', l: 'Aparecer con vuestro nombre en eventspenedes.com', t: 'select',
        op: { si: 'Sí, sin precios ni datos de contacto', revisar: 'Queremos revisarlo antes', no: 'No por ahora: solo en propuestas' },
        hint: 'Sin esta autorización vuestro nombre no sale en la web. Los precios y las personas de contacto no se publican nunca.' },
    ],
  },
  ...AMPLIA,
  {
    id: 'revision', titulo: 'Nuestra valoración', destino: 'interno', interno: true,
    campos: [
      { n: 'relacion', l: 'Relación con nosotros', t: 'select',
        op: { evaluando: 'En evaluación', aliado: 'Proveedor de confianza', propio: 'Servicio propio' } },
      { n: 'revision_fecha', l: 'Validado el', t: 'date', hint: 'Una prueba, una reunión o un evento juntos. Sin fecha, queda «Pendiente de validar».' },
      { n: 'revision_notas', l: 'Lo que sabemos', t: 'textarea', hint: 'Lo bueno, lo que no encaja, para qué cliente lo propondríamos.' },
      { n: 'modelo', l: 'Cómo ganamos con este proveedor', t: 'checks', op: {
        servicio: 'Nuestras horas (servicio facturado al cliente)',
        comision: 'Comisión del proveedor, que cobramos',
        descuento: 'Comisión del proveedor, pasada al cliente como descuento',
        neto: 'Precio neto de agencia, con nuestro margen encima' } },
      { n: 'modelo_notas', l: 'El modelo, en detalle', t: 'textarea' },
      { n: 'pendiente', l: 'Lo que queda por saber', t: 'textarea' },
      { n: 'publicar', l: 'Publicación', t: 'select',
        op: { no: 'No publicar todavía', revisar: 'Propuesta para la web: revisar y aprobar' } },
    ],
  },
];

/* Lo nuestro no se importa nunca de un catálogo */
export const NO_IMPORTA = ['revision_fecha', 'revision_notas', 'modelo_notas', ...NO_IMPORTA_AMPLIA];

export const { nombres, campos, cambios, cambiosTexto, legible, comisionLegible, fichaTexto } = ficha(SECCIONES);

/* --- Lo que se le dice a Claude al importar un catálogo ------------------- */

export const IMPORTAR = `Eres quien prepara la ficha de un proveedor de eventos de empresa (catering, catas, guías y actividades, transporte, música, fotografía, técnica…) en el Penedès para Events Penedès, una agencia local. Te damos su web y/o su catálogo o tarifas. Devuelve los campos de la ficha que las fuentes dicen, cada uno con la frase literal de la que sale.

Reglas, por orden de importancia:
1. Solo lo que las fuentes dicen. Si un dato no aparece, no lo pongas: un dato inventado acaba en un presupuesto a un cliente. No deduzcas precios de otros precios ni mínimos de una foto.
2. "cita" es el fragmento literal (máximo 200 caracteres) del que sale el valor, con la página del PDF si la sabes ("p. 3: …").
3. "categoria" es lo que ofrecen sobre todo; si ofrecen más cosas, márcalas en tambien_*. Abre el bloque de cada cosa que ofrezcan (ofrece_*) solo si rellenas algún campo suyo.
4. Los servicios: uno por cada cosa con precio propio que ofrezcan (un menú, una ruta, una actuación, un trayecto), en el orden del catálogo, servicio1_* hasta servicio${SERVICIOS}_*. servicioN_precio es el número en euros, sin IVA salvo que diga que lo lleva (entonces servicioN_iva = "si"); servicioN_unidad, por qué se cobra (persona, evento, hora, actuación, trayecto, día, km, unidad). Si el precio es "desde" o un rango, el precio más bajo y el rango en servicioN_incluye. Lo que el catálogo dice que no está incluido, en servicioN_no_incluye.
5. "descripcion" es el párrafo que los presenta a un cliente, en castellano, con las palabras de la fuente: quiénes son, qué hacen, de dónde sale lo que ofrecen. Máximo 600 caracteres.
6. Los textos (notas, qué incluye) en castellano y breves, aunque la fuente esté en catalán o inglés. Los nombres propios, tal cual.
7. Las casillas ("si") solo cuando la fuente lo dice expresamente.
8. En "avisos", en una frase cada uno, lo que una persona debería revisar: contradicciones entre fuentes, precios que dependen de temporada, tarifas que parecen antiguas.`;
