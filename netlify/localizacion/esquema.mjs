/* =============================================================================
   Events Penedès · la ficha de una localización, escrita una vez

   De aquí salen las dos cosas que tienen que decir lo mismo:
     · los campos del formulario `alta-localizacion.html`
       (los genera `tools/build-localizacion.mjs`; no se editan a mano)
     · la ficha que `netlify/functions/lead.mjs` deja en Zoho

   Y de aquí saldrá la tercera: lo que se publica de un espacio aprobado. Por
   eso cada sección dice a dónde puede ir lo que lleva:
     web      se puede publicar si se aprueba
     zoho     datos de una persona: a Zoho y a ningún repositorio
     interno  precios y condiciones: al repositorio privado, nunca a la web

   Tipos de campo:
     text · tel · email · url · number · textarea
     select    `op` es { valor: texto }. La primera opción vacía es «sin dato»
     sino      sí / no / sin dato. Lo que no se sabe se queda sin dato: no se
               adivina, porque un dato inventado acaba en una propuesta
     checks    casillas; cada una es su propio campo `<n>_<clave>`
     eur       importe en euros, sin IVA salvo que `iva_incluido` diga otra
               cosa. Número y no texto: es lo que permitirá calcular franjas

   `interno: true` en un campo o una sección: solo se ve con `?interno=1`.
   Es lo que rellenamos nosotros en la visita y no le toca al espacio.
   ========================================================================== */

export const FORM = 'localizacion';

export const TIPOS = {
  finca: 'Finca o masía',
  bodega: 'Bodega o cava',
  hotel: 'Hotel',
  'casa-rural': 'Casa rural',
  restaurante: 'Restaurante',
  singular: 'Espacio singular o patrimonial',
  natural: 'Espacio natural o al aire libre',
  otro: 'Otro',
};

/* La etiqueta de Zoho es corta: el CRM las recorta y las separa por comas. */
export const ETIQUETA_TIPO = {
  finca: 'Finca o masía', bodega: 'Bodega', hotel: 'Hotel', 'casa-rural': 'Casa rural',
  restaurante: 'Restaurante', singular: 'Espacio singular', natural: 'Espacio natural', otro: 'Otro tipo',
};

/* Qué tipos abren solos cada bloque condicional. Una masía con habitaciones
   también puede marcarlo a mano. */
export const ABRE = {
  ofrece_cata: ['bodega'],
  tiene_alojamiento: ['hotel', 'casa-rural'],
};

export const SALAS = 6;

const SALA = [
  { n: 'nombre', l: 'Nombre', t: 'text' },
  { n: 'tipo', l: 'Es', t: 'select', op: { interior: 'Interior', cubierto: 'Exterior cubierto', exterior: 'Exterior' } },
  { n: 'm2', l: 'm²', t: 'number' },
  { n: 'banquete', l: 'Banquete sentado', t: 'number' },
  { n: 'coctel', l: 'Cóctel de pie', t: 'number' },
  { n: 'teatro', l: 'Teatro', t: 'number' },
  { n: 'escuela', l: 'Escuela o reunión', t: 'number' },
  { n: 'luz', l: 'Luz natural', t: 'sino' },
  { n: 'clima', l: 'Climatizada', t: 'sino' },
  { n: 'precio_media', l: 'Alquiler media jornada (€)', t: 'eur' },
  { n: 'precio_dia', l: 'Alquiler jornada completa (€)', t: 'eur' },
  { n: 'notas', l: 'Notas', t: 'text' },
];

/* Un paquete es siempre lo mismo para que se pueda comparar entre espacios:
   precio, cuándo, para cuántos, cuánto dura y qué incluye. */
const UNIDAD = { evento: 'por evento', persona: 'por persona', hora: 'por hora', unidad: 'por unidad' };
/* La comisión de un paquete o extra: un porcentaje del precio, o unos euros
   con la misma unidad que el precio (4 € por persona, 50 € por evento). La
   general, un porcentaje de todo, o euros por persona o por evento. La de un
   paquete o extra gana a la general; para un evento concreto se pacta otra. */
const COMISION_TIPO = { porcentaje: '% del precio', importe: '€ en la unidad del precio' };
const COMISION_GENERAL = { porcentaje: '% de lo que se contrata', persona: '€ por persona', evento: '€ por evento' };
function paquete(p, nombre, hint) {
  return [
    { n: `${p}_precio`, l: `${nombre} · precio laborable (€)`, t: 'eur', hint },
    { n: `${p}_precio_finde`, l: `${nombre} · precio fin de semana o festivo (€)`, t: 'eur' },
    { n: `${p}_unidad`, l: `${nombre} · el precio es`, t: 'select', op: { evento: UNIDAD.evento, persona: UNIDAD.persona } },
    { n: `${p}_horas`, l: `${nombre} · horas incluidas`, t: 'number' },
    { n: `${p}_pax`, l: `${nombre} · máximo de personas`, t: 'number' },
    { n: `${p}_comision`, l: `${nombre} · comisión para Events Penedès`, t: 'number', dec: true, hint: 'En blanco, vale la general (en «Otras tarifas»). 0 si no es comisionable.' },
    { n: `${p}_comision_tipo`, l: `${nombre} · la comisión es`, t: 'select', op: COMISION_TIPO, hint: 'En euros, va por lo mismo que el precio: por persona, por evento… Si no se dice, es un porcentaje.' },
    { n: `${p}_espacio`, l: `${nombre} · qué espacio`, t: 'text', hint: 'El jardín, la sala, toda la finca…' },
    { n: `${p}_incluye`, l: `${nombre} · qué incluye`, t: 'textarea', hint: 'Mobiliario, limpieza, personal, plan B si llueve. Lo que no esté aquí es un extra.' },
  ];
}
export const EXTRAS = 6;
function extras() {
  const out = [];
  for (let i = 1; i <= EXTRAS; i++) {
    out.push(
      { n: `extra${i}_nombre`, l: `Extra ${i}`, t: 'text', hint: i === 1 ? 'Hora extra, visita con cata, cambio a interior si llueve, técnico de sonido…' : undefined },
      { n: `extra${i}_precio`, l: `Extra ${i} · precio (€)`, t: 'eur' },
      { n: `extra${i}_unidad`, l: `Extra ${i} · el precio es`, t: 'select', op: UNIDAD },
      { n: `extra${i}_iva`, l: `Extra ${i} · lleva IVA`, t: 'sino' },
      { n: `extra${i}_comision`, l: `Extra ${i} · comisión`, t: 'number', dec: true },
      { n: `extra${i}_comision_tipo`, l: `Extra ${i} · la comisión es`, t: 'select', op: COMISION_TIPO },
    );
  }
  return out;
}

export const SECCIONES = [
  {
    id: 'espacio', titulo: 'El espacio', destino: 'web',
    campos: [
      { n: 'nombre', l: 'Nombre del espacio', t: 'text', req: true },
      { n: 'tipo', l: 'Tipo', t: 'select', op: TIPOS, req: true },
      { n: 'relacion', l: 'Relación con nosotros', t: 'select', interno: true,
        op: { evaluando: 'En evaluación', aliado: 'Espacio aliado', propio: 'Espacio propio' } },
      { n: 'direccion', l: 'Dirección', t: 'text', ac: 'street-address' },
      { n: 'poblacion', l: 'Población', t: 'text', ac: 'address-level2' },
      { n: 'cp', l: 'Código postal', t: 'text', ac: 'postal-code', im: 'numeric' },
      { n: 'web', l: 'Web', t: 'url' },
      { n: 'telefono', l: 'Teléfono del espacio', t: 'tel', hint: 'El general, con extensión si la hay. El de la persona va abajo.' },
      { n: 'minutos_bcn', l: 'Minutos desde Barcelona', t: 'number' },
      { n: 'descripcion', l: 'Qué lo hace único', t: 'textarea',
        hint: 'Lo que no tiene ningún otro: la historia, el paisaje, quién lo lleva. Es el párrafo de la ficha pública.' },
    ],
  },
  {
    id: 'contacto', titulo: 'Persona de contacto', destino: 'zoho',
    nota: 'Va a Zoho y a ningún otro sitio: no se publica.',
    campos: [
      { n: 'contacto_persona', l: 'Nombre', t: 'text', ac: 'off' },
      { n: 'contacto_cargo', l: 'Cargo', t: 'text', ac: 'off' },
      { n: 'contacto_movil', l: 'Móvil', t: 'tel', ac: 'off' },
      { n: 'contacto_correo', l: 'Correo', t: 'email', ac: 'off' },
    ],
  },
  {
    id: 'capacidad', titulo: 'Capacidad', destino: 'web',
    campos: [
      { n: 'aforo_banquete', l: 'Máximo sentados a mesa', t: 'number' },
      { n: 'aforo_coctel', l: 'Máximo de pie (cóctel)', t: 'number' },
      { n: 'aforo_teatro', l: 'Máximo en teatro', t: 'number' },
      { n: 'pax_minimo', l: 'Mínimo de personas', t: 'number' },
      { n: 'exclusividad', l: 'Exclusividad del espacio', t: 'select',
        op: { siempre: 'Siempre en exclusiva', desde: 'En exclusiva a partir de un mínimo', no: 'Se comparte con otros eventos' } },
      { n: 'exclusividad_desde', l: 'Exclusiva a partir de (personas)', t: 'number' },
    ],
  },
  {
    id: 'salas', titulo: 'Salas y espacios', destino: 'web', salas: true,
    nota: 'Una por sala, porche o jardín. Los aforos, por formato: no es lo mismo sentados que de pie. Si la sala se alquila por separado, su precio; si no, en blanco.',
  },
  {
    id: 'cocina', titulo: 'Cocina y catering', destino: 'web',
    campos: [
      { n: 'cocina', l: 'Cocina', t: 'select',
        op: { equipada: 'Cocina propia equipada', office: 'Office de apoyo para emplatar', no: 'No hay cocina' } },
      { n: 'cocina_m2', l: 'm² de cocina', t: 'number' },
      { n: 'catering', l: 'Catering', t: 'select',
        op: { libre: 'Libre: entra el que elijamos', lista: 'De una lista de homologados',
              exclusiva: 'En exclusiva con uno', propio: 'Lo da el propio espacio' } },
      { n: 'catering_quien', l: 'Qué caterings (exclusiva u homologados)', t: 'text' },
      { n: 'catering_canon', l: 'Canon por catering externo', t: 'sino' },
      { n: 'brasa', l: 'Barbacoa o brasa', t: 'sino' },
      { n: 'cocina_notas', l: 'Notas de cocina', t: 'textarea', hint: 'Fuegos, cámaras, agua y luz para el catering, por dónde entra.' },
    ],
  },
  {
    id: 'mobiliario', titulo: 'Mobiliario', destino: 'web',
    campos: [
      { n: 'mesas_redondas', l: 'Mesas redondas', t: 'number' },
      { n: 'mesas_redondas_pax', l: 'Comensales por mesa redonda', t: 'number' },
      { n: 'mesas_rect', l: 'Mesas rectangulares o imperiales', t: 'number' },
      { n: 'mesas_coctel', l: 'Mesas altas de cóctel', t: 'number' },
      { n: 'sillas', l: 'Sillas', t: 'number' },
      { n: 'manteleria', l: 'Mantelería incluida', t: 'sino' },
      { n: 'carpa', l: 'Carpa o cubierta para exterior', t: 'sino' },
      { n: 'mobiliario_notas', l: 'Notas de mobiliario', t: 'textarea' },
    ],
  },
  {
    id: 'tecnica', titulo: 'Equipo técnico', destino: 'web',
    campos: [
      { n: 'equipo', l: 'Qué tiene', t: 'checks', op: {
        proyector: 'Proyector', pantalla: 'Pantalla', tv: 'Pantalla de TV o monitor',
        sonido: 'Megafonía o sonido', micros: 'Micrófonos', escenario: 'Escenario o tarima',
        iluminacion: 'Iluminación ambiental', wifi: 'Wifi para el grupo', trifasica: 'Toma trifásica' } },
      { n: 'tecnica_notas', l: 'Notas técnicas', t: 'textarea', hint: 'Cuántos micros, potencia eléctrica, si el sonido tiene límite de decibelios.' },
    ],
  },
  {
    id: 'logistica', titulo: 'Acceso y logística', destino: 'web',
    campos: [
      { n: 'parking', l: 'Plazas de aparcamiento', t: 'number' },
      { n: 'autocar', l: 'Llega un autocar grande', t: 'sino' },
      { n: 'pmr', l: 'Accesible en silla de ruedas', t: 'sino' },
      { n: 'aseos', l: 'Aseos', t: 'number' },
      { n: 'hora_fin', l: 'Hora límite del evento', t: 'text' },
      { n: 'musica_limite', l: 'Límite de música o ruido', t: 'text' },
      { n: 'montaje', l: 'Montaje y desmontaje', t: 'text', hint: 'Desde cuándo se puede montar y hasta cuándo desmontar.' },
      { n: 'plan_lluvia', l: 'Plan B si llueve', t: 'textarea' },
    ],
  },
  {
    id: 'cata', titulo: 'Visita y cata', destino: 'web', si: 'ofrece_cata',
    interruptor: 'Ofrece visita o cata',
    campos: [
      { n: 'cata_tipos', l: 'Qué ofrece', t: 'checks', op: {
        visita: 'Visita a la bodega o las cavas', vinos: 'Cata de vinos', cavas: 'Cata de cavas',
        maridaje: 'Cata con maridaje', vina: 'Paseo o actividad en la viña', vendimia: 'Vendimia (en temporada)',
        ensamblaje: 'Taller de ensamblaje o enología', tienda: 'Tienda' } },
      { n: 'cata_duracion', l: 'Duración de la visita con cata', t: 'text' },
      { n: 'cata_grupo', l: 'Personas por grupo de cata', t: 'number' },
      { n: 'cata_sala', l: 'Aforo de la sala de catas', t: 'number' },
      { n: 'cata_idiomas', l: 'Idiomas de la visita', t: 'checks', op: { ca: 'Catalán', es: 'Castellano', en: 'Inglés', fr: 'Francés', de: 'Alemán' } },
      { n: 'cata_notas', l: 'Notas de la visita', t: 'textarea', hint: 'Quién la guía, qué se cata, si se adapta a empresa.' },
    ],
  },
  {
    id: 'alojamiento', titulo: 'Alojamiento', destino: 'web', si: 'tiene_alojamiento',
    interruptor: 'Tiene alojamiento',
    campos: [
      { n: 'habitaciones', l: 'Habitaciones', t: 'number' },
      { n: 'plazas', l: 'Plazas para dormir', t: 'number' },
      { n: 'habitaciones_tipos', l: 'Tipos de habitación', t: 'text', hint: 'Dobles, suites, familiares, literas…' },
      { n: 'alojamiento_exclusiva', l: 'Se alquila entera', t: 'sino' },
      { n: 'desayuno', l: 'Desayuno incluido', t: 'sino' },
      { n: 'extras', l: 'Qué más tiene', t: 'checks', op: { piscina: 'Piscina', spa: 'Spa', gimnasio: 'Gimnasio', restaurante: 'Restaurante propio' } },
      { n: 'alojamiento_notas', l: 'Notas de alojamiento', t: 'textarea', hint: 'Entrada y salida, estancia mínima, temporada.' },
    ],
  },
  {
    id: 'eventos', titulo: 'Para qué sirve', destino: 'web',
    campos: [
      { n: 'eventos', l: 'Tipos de evento', t: 'checks', op: {
        convencion: 'Convención o jornada', comida: 'Comida o cena de empresa', gala: 'Cena de gala',
        teambuilding: 'Team building', incentivo: 'Incentivo', presentacion: 'Presentación de producto',
        boda: 'Boda o celebración', calcotada: 'Calçotada o comida popular', rodaje: 'Rodaje o sesión de fotos' } },
      { n: 'actividades', l: 'Actividades que se hacen allí', t: 'textarea' },
    ],
  },
  {
    id: 'fotos', titulo: 'Fotos y publicación', destino: 'web',
    campos: [
      { n: 'fotos_enlace', l: 'Enlace a las fotos o al dossier', t: 'url', hint: 'Drive, Dropbox o la web del espacio. Las fotos no se suben aquí.' },
      { n: 'fotos_permiso', l: 'Permiso para publicar las fotos', t: 'select',
        op: { escrito: 'Sí, por escrito', verbal: 'De palabra: falta por escrito', no: 'No', pedir: 'Hay que pedirlo' } },
      { n: 'autoriza', l: 'Publicar la ficha en eventspenedes.com', t: 'select',
        op: { si: 'Sí, sin precios ni datos de contacto', revisar: 'Quiero revisarla antes', no: 'No por ahora' },
        hint: 'Nada se publica sin esta autorización. Los precios y las personas de contacto no se publican nunca.' },
    ],
  },
  {
    id: 'paquetes', titulo: 'Paquetes para Events Penedès', destino: 'interno',
    nota: 'Lo que nos cuesta usar el espacio, en paquetes cerrados y comparables entre espacios. Precio neto para Events Penedès, sin IVA salvo que se diga. Si un paquete no lo ofrecéis, dejadlo en blanco. No se publica.',
    campos: [
      ...paquete('taller', 'Solo taller, sin exclusiva', 'El espacio para un taller o actividad mientras la finca sigue abierta a otros visitantes.'),
      ...paquete('excl', 'Con exclusiva', 'Toda la finca solo para el grupo.'),
      ...extras(),
      { n: 'extras_notas', l: 'Notas de los extras', t: 'textarea', hint: 'Lo que no cabe en una línea: mínimos, suplementos, lo que depende del día.' },
    ],
    grupos: [
      ['Solo taller · sin exclusiva', /^taller_/],
      ['Con exclusiva', /^excl_/],
      ['Extras, cada uno con su precio', /^extra(\d+_|s_)/],
    ],
  },
  {
    id: 'tarifas', titulo: 'Otras tarifas', destino: 'interno',
    nota: 'No se publican: sirven para preparar presupuestos. Lo que no tenga precio fijo, en blanco y explicado en las notas.',
    campos: [
      { n: 'iva_incluido', l: 'Los precios llevan IVA', t: 'sino', hint: 'Si no se dice, se entienden sin IVA.' },
      { n: 'alquiler_media', l: 'Todo el espacio · media jornada (€)', t: 'eur', hint: 'Hasta unas 5 horas.' },
      { n: 'alquiler_dia', l: 'Todo el espacio · jornada completa (€)', t: 'eur' },
      { n: 'alquiler_noche', l: 'Todo el espacio · noche o cena (€)', t: 'eur' },
      { n: 'hora_extra', l: 'Hora extra (€)', t: 'eur' },
      { n: 'suplemento_finde', l: 'Suplemento fin de semana o festivo (%)', t: 'number' },
      { n: 'suplemento_alta', l: 'Suplemento temporada alta (%)', t: 'number' },
      { n: 'temporada', l: 'Temporada alta y fechas bloqueadas', t: 'text' },
      { n: 'pax_25', l: 'Por persona · hasta 25 (€)', t: 'eur' },
      { n: 'pax_50', l: 'Por persona · de 26 a 50 (€)', t: 'eur' },
      { n: 'pax_100', l: 'Por persona · de 51 a 100 (€)', t: 'eur' },
      { n: 'pax_mas', l: 'Por persona · más de 100 (€)', t: 'eur' },
      { n: 'pax_incluye', l: 'Qué incluye el precio por persona', t: 'text', hint: 'Visita con cata, cóctel, menú, solo canon…' },
      { n: 'minimo_facturacion', l: 'Facturación mínima (€)', t: 'eur' },
      { n: 'canon_catering', l: 'Canon por catering externo (€ por persona)', t: 'eur' },
      { n: 'comision', l: 'Comisión general para Events Penedès', t: 'number', dec: true,
        hint: 'Vale para todo lo que no lleve la suya en los paquetes o los extras. Para un evento concreto se puede pactar otra.' },
      { n: 'comision_tipo', l: 'La comisión general es', t: 'select', op: COMISION_GENERAL, hint: 'Si no se dice, es un porcentaje.' },
      { n: 'precio_neto', l: 'O, en su lugar, precio neto para agencias', t: 'sino', hint: 'Sí si los precios de arriba ya son netos para agencia.' },
      { n: 'reserva', l: 'Reserva y cancelación', t: 'textarea', hint: 'Señal, plazos, qué pasa si se cancela.' },
      { n: 'tarifa_notas', l: 'Notas de tarifas', t: 'textarea', hint: 'Lo que no cabe arriba, tal cual lo dicen.' },
    ],
  },
  {
    id: 'visita', titulo: 'Notas de la visita', destino: 'interno', interno: true,
    campos: [
      { n: 'visita_fecha', l: 'Fecha de la visita', t: 'date' },
      { n: 'visita_notas', l: 'Lo que hemos visto', t: 'textarea', hint: 'Lo bueno, lo que no encaja, para qué cliente lo propondríamos.' },
      { n: 'modelo', l: 'Cómo ganamos con este espacio', t: 'checks', op: {
        servicio: 'Nuestras horas (servicio facturado al cliente)',
        comision: 'Comisión del espacio, que cobramos',
        descuento: 'Comisión del espacio, pasada al cliente como descuento',
        neto: 'Precio neto de agencia, con nuestro margen encima' } },
      { n: 'modelo_notas', l: 'El modelo, en detalle', t: 'textarea', hint: 'Sobre qué cobra comisión y sobre qué no, gratuidades, lo pendiente de decidir.' },
      { n: 'pendiente', l: 'Lo que queda por saber', t: 'textarea' },
      { n: 'publicar', l: 'Publicación', t: 'select',
        op: { no: 'No publicar todavía', revisar: 'Propuesta para la web: revisar y aprobar' } },
    ],
  },
];

/* --- Utilidades compartidas --------------------------------------------- */

export const salaCampo = (i, c) => `sala${i}_${c}`;
export const camposSala = SALA;

/* Todos los nombres de campo, en orden. La función lo usa como lista blanca:
   lo que no está aquí no entra en la ficha. */
export function nombres() {
  const out = [];
  for (const s of SECCIONES) {
    if (s.si) { out.push(s.si); }
    if (s.salas) {
      for (let i = 1; i <= SALAS; i++) { for (const c of SALA) { out.push(salaCampo(i, c.n)); } }
      continue;
    }
    for (const c of s.campos) {
      if (c.t === 'checks') { for (const k of Object.keys(c.op)) { out.push(`${c.n}_${k}`); } }
      else { out.push(c.n); }
    }
  }
  return out;
}

const SINO = { si: 'Sí', no: 'No' };

/* Cada nombre de campo con su etiqueta legible y su definición. Las casillas
   (`equipo_proyector`) se leen como «Qué tiene: Proyector». */
export function campos() {
  const m = new Map();
  for (const s of SECCIONES) {
    if (s.si) { m.set(s.si, { campo: { t: 'check' }, l: s.interruptor }); }
    if (s.salas) {
      for (let i = 1; i <= SALAS; i++) {
        for (const c of SALA) { m.set(salaCampo(i, c.n), { campo: c, l: `Sala ${i} · ${c.l}` }); }
      }
      continue;
    }
    for (const c of s.campos) {
      if (c.t === 'checks') {
        for (const [k, t] of Object.entries(c.op)) { m.set(`${c.n}_${k}`, { campo: { t: 'check' }, l: `${c.l}: ${t}` }); }
      } else { m.set(c.n, { campo: c, l: c.l }); }
    }
  }
  return m;
}

/* El registro de cambios: qué campos difieren entre la versión de partida (el
   borrador que les mandamos, o su último envío) y lo que envían ahora. Solo
   campos del esquema; los vacíos cuentan como «sin dato». */
export function cambios(antes, ahora) {
  const out = [];
  const leer = (c, v) => (c.campo.t === 'check' ? (v ? 'sí' : null) : legible(c.campo, v));
  for (const [n, c] of campos()) {
    const a = leer(c, antes[n]);
    const b = leer(c, ahora[n]);
    if (a !== b) { out.push({ campo: n, etiqueta: c.l, antes: a, ahora: b }); }
  }
  return out;
}

export function cambiosTexto(lista) {
  return lista.map(x => `· ${x.etiqueta}: ${x.antes ?? 'sin dato'} → ${x.ahora ?? 'sin dato'}`).join('\n');
}

/* El valor tal como se lee en una ficha: «Bodega o cava», no «bodega». */
export function legible(campo, v) {
  if (v === undefined || v === null || String(v).trim() === '') { return null; }
  if (campo.t === 'sino') { return SINO[v] || v; }
  if (campo.t === 'select') { return campo.op[v] || v; }
  if (campo.t === 'eur') { return `${String(v).trim()} €`; }
  return String(v).trim();
}

/* Una comisión tal como se lee: «10 %», «4 € por persona», «0, no es
   comisionable». Sin tipo, es un porcentaje: así se pedía antes. */
export function comisionLegible(d, n) {
  const v = d[n];
  if (v === undefined || v === null || String(v).trim() === '') { return null; }
  const cifra = String(v).trim();
  if (Number(cifra) === 0) { return '0, no es comisionable'; }
  const tipo = d[`${n}_tipo`] || 'porcentaje';
  if (tipo === 'porcentaje') { return `${cifra} %`; }
  if (tipo === 'persona' || tipo === 'evento') { return `${cifra} € por ${tipo}`; }
  const unidad = UNIDAD[d[n.replace(/comision$/, 'unidad')]];
  return `${cifra} €${unidad ? ' ' + unidad : ''}`;
}
const ES_COMISION = /(^|_)comision$/;
const ES_TIPO_COMISION = /(^|_)comision_tipo$/;

/* La ficha en texto plano, por secciones. Lo que no se rellenó no sale: una
   ficha llena de «—» esconde lo que sí se sabe. */
export function fichaTexto(d) {
  const l = [];
  for (const s of SECCIONES) {
    if (s.si && !d[s.si]) { continue; }
    const filas = [];
    if (s.salas) {
      for (let i = 1; i <= SALAS; i++) {
        const partes = SALA.map(c => {
          const v = legible(c, d[salaCampo(i, c.n)]);
          return v && c.n !== 'nombre' ? `${c.l}: ${v}` : null;
        }).filter(Boolean);
        const nombre = legible(SALA[0], d[salaCampo(i, 'nombre')]);
        if (nombre || partes.length) { filas.push(`· ${nombre || `Sala ${i}`}${partes.length ? ' — ' + partes.join(' · ') : ''}`); }
      }
    } else {
      for (const c of s.campos) {
        if (c.t === 'checks') {
          const marcadas = Object.entries(c.op).filter(([k]) => d[`${c.n}_${k}`]).map(([, t]) => t);
          if (marcadas.length) { filas.push(`${c.l}: ${marcadas.join(', ')}`); }
          continue;
        }
        /* La comisión y su tipo, en una sola línea */
        if (ES_TIPO_COMISION.test(c.n)) { continue; }
        const v = ES_COMISION.test(c.n) ? comisionLegible(d, c.n) : legible(c, d[c.n]);
        if (v) { filas.push(`${c.l}: ${v}`); }
      }
    }
    if (filas.length) {
      const marca = s.destino === 'interno' ? ' (interno)' : s.destino === 'zoho' ? ' (no se publica)' : '';
      l.push(`## ${s.titulo}${marca}`, ...filas, '');
    }
  }
  return l.join('\n').trim();
}
