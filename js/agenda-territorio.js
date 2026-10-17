/* =============================================================================
   Events Penedès · lo que pasa en el territorio

   Fiestas, ferias, catas y rutas públicas del Penedès que no organiza la red.
   Salen en /agenda junto a las acciones de los partners como motivo para ir
   en grupo: nosotros ponemos el transporte, el espacio, la comida y la
   actividad con la red. Cada una lleva la página de donde sale su fecha; sin
   fuente no entra. Lo que ya ha pasado deja de salir solo.

   Se revisa a mano: cuando una fecha cambia en la fuente, se cambia aquí.
   Revisado el 17 de octubre de 2026.
   ========================================================================== */

const PT = 'Penedès Turisme';
const SC = 'Surt de Casa';

export const TERRITORIO = [
  { id: 'sonabe-subirats', titulo: 'Cicle Sonabé', inicio: '2026-10-03', fin: '2026-11-21',
    poblacion: 'Subirats', categoria: 'musica',
    descripcion: 'Nueve conciertos de música en catalán, para todas las edades, en los centros y ateneos de Subirats.',
    fuente: 'https://surtdecasa.cat/penedes/agenda/2026/cicle-sonabe-concerts-als-centres-i-ateneus-de-subirats/269326', fuente_nombre: SC },
  { id: 'sopar-verema-ca-nestella', titulo: 'Cena de vendimia con barbacoa y música en directo', inicio: '2026-10-24', hora: '19:00',
    poblacion: 'Sant Esteve Sesrovires', categoria: 'musica',
    descripcion: 'En la Finca Ca N’Estella: paseo por la viña, pisada de uva, barbacoa, vinos y música en directo.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/sopar-de-verema-amb-barbacoa-i-musica-en-directe-al-penedes', fuente_nombre: PT },
  { id: 'most-2026', titulo: 'Most, Festival Internacional de Cine del Vino', inicio: '2026-11-05', fin: '2026-11-15',
    poblacion: 'Vilafranca del Penedès', categoria: 'vino',
    descripcion: 'La 15.ª edición del festival de cine sobre el vino y la viña que organiza Vinseum.',
    fuente: 'https://surtdecasa.cat/penedes/agenda/2026/15e-most-festival-internacional-de-cinema-del-vi/270041', fuente_nombre: SC },
  { id: 'funifira-2026', titulo: 'Funifira', inicio: '2026-11-13', fin: '2026-11-15',
    poblacion: 'Gelida', categoria: 'gastronomia',
    descripcion: 'Fin de semana de maquetas y tren, con un espacio gastronómico de producto local, vino y cava del Penedès.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/funifira', fuente_nombre: PT },
  { id: 'mata-degolla-2026', titulo: 'Fira del Mata-degolla', inicio: '2026-11-15',
    poblacion: 'Sant Quintí de Mediona', categoria: 'cultura',
    descripcion: 'Feria de artesanía y recreaciones históricas por las calles del pueblo, en recuerdo de los pueblos quemados en 1714.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/mata-degolla', fuente_nombre: PT },
  { id: 'subirats-tastal-2026', titulo: 'Subirats Tasta’l', inicio: '2026-11-22', hora: '11:00', hora_fin: '15:00',
    poblacion: 'Subirats', categoria: 'vino',
    descripcion: 'Muestra de vinos, cavas, cocina y producto de Subirats en Sant Pau d’Ordal.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/subirats-tastal', fuente_nombre: PT },
  { id: 'pedra-seca-2026', titulo: 'Paseo de la piedra seca', inicio: '2026-11-28', hora: '09:30',
    poblacion: 'Subirats', categoria: 'naturaleza',
    descripcion: 'Dos horas y media entre barracas de piedra seca con el CESUB, y cata de vino o cava al final. Plazas limitadas.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/passejada-de-la-pedra-seca', fuente_nombre: PT },
  { id: 'maridam-torro-2026', titulo: 'MARIDA’m: el turrón con cava', inicio: '2026-12-12', hora: '12:00',
    poblacion: 'Sant Sadurní d’Anoia', categoria: 'vino',
    descripcion: 'Cata de temporada en el Cava Centre: el turrón en platos salados con cavas de distintos estilos.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/maridam-cicle-de-tastos-de-temporada-al-cava-centre', fuente_nombre: PT },
  { id: 'nadal-torrelavit-2026', titulo: 'Fira de Nadal de Torrelavit', inicio: '2026-12-12', hora: '10:00', hora_fin: '14:00',
    poblacion: 'Torrelavit', categoria: 'otro',
    descripcion: 'Paradas de regalos y decoración de Navidad en el Parc dels Miradors.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/fira-de-nadal-de-torrelavit', fuente_nombre: PT },
  { id: 'santa-llucia-gelida-2026', titulo: 'Fira de Santa Llúcia', inicio: '2026-12-13',
    poblacion: 'Gelida', categoria: 'gastronomia',
    descripcion: 'Escudella popular en la plaza de la iglesia, bailes, feria de artesanos y premio solidario.',
    fuente: 'https://www.penedesturisme.cat/ca/activitat/fira-de-santa-llucia-de-gelida', fuente_nombre: PT },
];

/* Lo que todavía no ha acabado, por fecha */
export const territorioProximo = (lista = TERRITORIO, dia = new Date().toISOString().slice(0, 10)) => lista
  .filter(x => x.fuente && /^https:\/\//.test(x.fuente) && (x.fin || x.inicio) >= dia)
  .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.titulo.localeCompare(b.titulo));
