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
  { n: 'notas', l: 'Notas', t: 'text' },
];

export const SECCIONES = [
  {
    id: 'espacio', titulo: 'El espacio', destino: 'web',
    campos: [
      { n: 'nombre', l: 'Nombre del espacio', t: 'text', req: true },
      { n: 'tipo', l: 'Tipo', t: 'select', op: TIPOS, req: true },
      { n: 'relacion', l: 'Relación con nosotros', t: 'select',
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
    nota: 'Una por sala, porche o jardín. Los aforos, por formato: no es lo mismo sentados que de pie.',
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
    id: 'fotos', titulo: 'Fotos', destino: 'web',
    campos: [
      { n: 'fotos_enlace', l: 'Enlace a las fotos o al dossier', t: 'url', hint: 'Drive, Dropbox o la web del espacio. Las fotos no se suben aquí.' },
      { n: 'fotos_permiso', l: 'Permiso para publicarlas', t: 'select',
        op: { escrito: 'Sí, por escrito', verbal: 'De palabra: falta por escrito', no: 'No', pedir: 'Hay que pedirlo' } },
    ],
  },
  {
    id: 'comercial', titulo: 'Condiciones', destino: 'interno',
    nota: 'Interno: nunca se publica. Precios sin IVA salvo que se diga.',
    campos: [
      { n: 'tarifa', l: 'Tarifa de alquiler', t: 'textarea', hint: 'Por franja, por día, por persona. Tal cual lo dicen.' },
      { n: 'comision', l: 'Comisión o precio de agencia', t: 'text' },
      { n: 'reserva', l: 'Reserva y cancelación', t: 'textarea' },
      { n: 'temporada', l: 'Temporada y fechas bloqueadas', t: 'text' },
    ],
  },
  {
    id: 'visita', titulo: 'Notas de la visita', destino: 'interno',
    campos: [
      { n: 'visita_fecha', l: 'Fecha de la visita', t: 'date' },
      { n: 'visita_notas', l: 'Lo que hemos visto', t: 'textarea', hint: 'Lo bueno, lo que no encaja, para qué cliente lo propondríamos.' },
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

/* El valor tal como se lee en una ficha: «Bodega o cava», no «bodega». */
export function legible(campo, v) {
  if (v === undefined || v === null || String(v).trim() === '') { return null; }
  if (campo.t === 'sino') { return SINO[v] || v; }
  if (campo.t === 'select') { return campo.op[v] || v; }
  return String(v).trim();
}

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
        const v = legible(c, d[c.n]);
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
