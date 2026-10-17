/* =============================================================================
   Prueba del blog y la agenda

   Lo que importa: que en la web no salga nunca el precio de una acción ni el
   nombre de un partner sin su permiso, que lo que escribe alguien no se
   interprete como HTML, que las acciones de cada año caigan en su fecha, y que
   «Me interesa» lleve al formulario de Events Penedès y no al partner.

   Uso:  node tools/test-blog.mjs
   ========================================================================== */
import { cuerpoHtml, borradorEntrevista, faltan, proximaVez, accionPublica, cuando, slug, CUESTIONARIO } from '../js/blog-comun.js';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
console.log('\nPrueba del blog y la agenda\n');

/* 1 · El texto */
const html = cuerpoHtml('## Quiénes somos\n\nUna <script>alert(1)</script> bodega.\nDesde 1979.\n\n> Lo mejor, la vendimia');
comprueba('el texto se escapa', !html.includes('<script>') && html.includes('&lt;script&gt;'));
comprueba('«## » es un apartado y los párrafos salen como párrafos', html.includes('<h2>Quiénes somos</h2>') && html.includes('<br>Desde 1979.</p>'));
comprueba('«> » es una cita', html.includes('<blockquote><p>Lo mejor, la vendimia</p></blockquote>'));
const b = borradorEntrevista({ quienes: 'Una familia de viticultores.', momento: '  ', autentico: 'El paisaje.' });
comprueba('el borrador lleva las preguntas contestadas y no las vacías', b.includes(CUESTIONARIO[0].p) && b.includes('El paisaje.') && !b.includes(CUESTIONARIO[2].p));
comprueba('faltan las obligatorias sin contestar', faltan({ quienes: 'x', autentico: 'y' }).map(q => q.n).join() === 'momento');
comprueba('la dirección del artículo es legible', slug('Albet i Noya: viñas, cava y paisaje') === 'albet-i-noya-vinas-cava-y-paisaje');

/* 2 · Las fechas */
const vendimia = { fecha_inicio: '2025-09-01', fecha_fin: '2025-09-30', cada_ano: true, estado: 'aprobada' };
comprueba('una acción de cada año cae en el año que toca', proximaVez(vendimia, '2026-10-16').inicio === '2027-09-01');
comprueba('mientras dura, sigue saliendo', proximaVez(vendimia, '2026-09-15').inicio === '2026-09-01');
comprueba('una acción pasada que no se repite no sale', proximaVez({ fecha_inicio: '2026-03-01', cada_ano: false }, '2026-10-16') === null);
comprueba('la fecha se lee bien', cuando('2026-09-28', '2026-10-03') === '28 de septiembre – 3 de octubre' && cuando('2026-09-12', '2026-09-20') === '12 – 20 de septiembre');

/* 2b · El territorio: solo con fuente y solo lo que no ha acabado */
const { TERRITORIO, territorioProximo } = await import('../js/agenda-territorio.js');
comprueba('cada fecha del territorio lleva su fuente https', TERRITORIO.every(t => /^https:\/\//.test(t.fuente) && t.fuente_nombre));
comprueba('cada fecha del territorio es una fecha válida', TERRITORIO.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.inicio) && (!t.fin || t.fin >= t.inicio)));
comprueba('lo que ya ha acabado no sale', territorioProximo([{ id: 'a', titulo: 'x', inicio: '2026-01-01', fuente: 'https://x.cat' }], '2026-10-17').length === 0);
comprueba('lo que dura todavía sale', territorioProximo([{ id: 'a', titulo: 'x', inicio: '2026-10-01', fin: '2026-11-01', fuente: 'https://x.cat' }], '2026-10-17').length === 1);
comprueba('sin fuente no sale', territorioProximo([{ id: 'a', titulo: 'x', inicio: '2026-12-01' }], '2026-10-17').length === 0);

/* 2c · El club: una cita fija al mes y un tope de socios */
const { CLUB, citasClub } = await import('../js/club.js');
const sabados = citasClub({ ano: 2027, regla: 'primer-sabado' }, '2026-10-17');
comprueba('el club tiene doce citas el primer sábado de cada mes', sabados.length === 12 && sabados[0] === '2027-01-02' && sabados.every(f => new Date(f).getUTCDay() === 6 && Number(f.slice(8)) <= 7));
const viernes = citasClub({ ano: 2027, regla: 'ultimo-viernes' }, '2026-10-17');
comprueba('o el último viernes', viernes[0] === '2027-01-29' && viernes.every(f => new Date(f).getUTCDay() === 5));
comprueba('las citas pasadas no salen', citasClub({ ano: 2027, regla: 'primer-sabado' }, '2027-06-10').length === 6);
comprueba('el club no pasa de 222 socios', CLUB.plazas <= 222);

/* 3 · Lo que se publica de una acción */
const ACCION = { id: '11111111-1111-4111-8111-111111111111', partner_id: '22222222-2222-4222-8222-222222222222', titulo: 'Vendimia en familia',
  descripcion: 'Cortar uva y pisarla.', categoria: 'vino', fecha_inicio: '2026-11-07', fecha_fin: null, cada_ano: false,
  hora_inicio: '10:00:00', hora_fin: '13:00:00', plazas_min: 10, plazas_max: 40, estado: 'aprobada',
  precio: 4321, precio_unidad: 'persona', iva_incluido: false, nota_revision: 'Negociar', autor: 'x' };
const pub = accionPublica(ACCION, '2026-10-16');
comprueba('de una acción no sale el precio ni las notas', !JSON.stringify(pub).includes('4321') && !('precio' in pub) && !JSON.stringify(pub).includes('Negociar'));
comprueba('una acción sin aprobar no sale', accionPublica({ ...ACCION, estado: 'propuesta' }, '2026-10-16') === null);

/* 4 · Las páginas, con una base de datos de mentira */
process.env.SUPABASE_SECRET_KEY = 'sb_secret_prueba';
const PARTNER_PUBLICO = { id: ACCION.partner_id, codigo: 'masia-prova', nombre: 'Masia Prova SL', tipo: 'localizacion', estado: 'activo',
  fichas: [{ datos: { autoriza: 'si', nombre: 'Masia de Prova', poblacion: 'Subirats', telefono: '+34 600 111 222' } }] };
const PARTNER_OCULTO = { id: '33333333-3333-4333-8333-333333333333', codigo: 'oculto', nombre: 'Bodega Secreta', tipo: 'proveedor', estado: 'activo',
  fichas: [{ datos: { autoriza: 'revisar', nombre: 'Bodega Secreta' } }] };
const ARTICULO = { id: 'a1', tipo: 'entrevista', partner_id: PARTNER_PUBLICO.id, titulo: 'La masía <b>entre viñas</b>', slug: 'la-masia-entre-vinas',
  entradilla: 'Hablamos con la familia.', cuerpo: '## ¿Quiénes sois?\n\nUna familia.', temas: ['vino'], fotos: [`${PARTNER_PUBLICO.id}/a.jpg`],
  permiso_fotos: false, publicado_en: '2026-10-16T10:00:00Z', actualizado_en: '2026-10-16T10:00:00Z' };
const DB = {
  articulos: [ARTICULO],
  agenda: [ACCION, { ...ACCION, id: '44444444-4444-4444-8444-444444444444', partner_id: PARTNER_OCULTO.id, titulo: 'Cata a ciegas' }],
  partners: [PARTNER_PUBLICO, PARTNER_OCULTO],
};
const pedidas = [];
globalThis.fetch = async (url) => {
  const u = new URL(url);
  pedidas.push(u.pathname + u.search);
  const tabla = u.pathname.split('/').pop();
  if (tabla === 'sumar_impresion') { return new Response(null, { status: 204 }); }
  return Response.json(DB[tabla] || []);
};
const { default: blog } = await import('../netlify/functions/blog.mjs');
const pide = ruta => blog(new Request(`https://eventspenedes.com${ruta}`));

const agenda = await (await pide('/agenda')).text();
comprueba('la agenda sale con sus acciones y su Event para buscadores', agenda.includes('Vendimia en familia') && agenda.includes('"@type":"Event"'));
comprueba('en la agenda no sale ningún precio', !agenda.includes('4321') && !agenda.includes('600 111 222'));
comprueba('sale el nombre del partner con página pública, enlazado', agenda.includes('href="/partners/masia-prova"') && agenda.includes('Masia de Prova'));
comprueba('no sale el nombre del partner sin página autorizada', !agenda.includes('Bodega Secreta') && agenda.includes('Con un partner de la red'));
comprueba('a la base de datos no se le pide el precio', !pedidas.some(p => p.startsWith('/rest/v1/agenda') && /precio/.test(p)));

const plaza = await pide(`/agenda/${ACCION.id}/plaza`);
const destino = plaza.headers.get('location') || '';
comprueba('«Me interesa» lleva a nuestro formulario con el partner y la acción', plaza.status === 302 && destino.startsWith('/contacto.html?') && destino.includes('ref=masia-prova') && destino.includes('Vendimia'));

const { territorioProximo: hayTerritorio } = await import('../js/agenda-territorio.js');
const conTerritorio = hayTerritorio().length > 0;
comprueba('la agenda trae lo del territorio con su fuente', !conTerritorio || agenda.includes('En el territorio') && agenda.includes('Fuente: <a href="https://'));
comprueba('«Ir en grupo» lleva a nuestro formulario, no a la organización', !conTerritorio || /href="\/contacto\.html\?asunto=Ir\+en\+grupo[^"]*#escribenos"/.test(agenda));

comprueba('la agenda trae el club con su tope de socios', citasClub().length === 0 || (agenda.includes('Quiero ser socio') && agenda.includes(`${CLUB.plazas} socios`)));

const articulo = await (await pide('/blog/la-masia-entre-vinas')).text();
comprueba('el artículo sale con su BlogPosting', articulo.includes('"@type":"BlogPosting"'));
comprueba('el título se escapa', !articulo.includes('<b>entre') && articulo.includes('&lt;b&gt;'));
comprueba('el artículo enlaza al perfil del partner', articulo.includes('href="/partners/masia-prova"'));
comprueba('sin permiso para fotos, no salen fotos', !articulo.includes('/foto/1'));
comprueba('la foto sin permiso no se sirve', (await pide('/blog/la-masia-entre-vinas/foto/1')).status === 404);
comprueba('el artículo trae las próximas acciones del partner', articulo.includes('Próximamente'));
comprueba('un artículo que no existe da 404', (await pide('/blog/no-existe')).status === 404);
const feed = await (await pide('/blog/feed.xml')).text();
comprueba('el RSS lleva el artículo', feed.includes('<link>https://eventspenedes.com/blog/la-masia-entre-vinas</link>'));
comprueba('solo se pide lo publicado y lo aprobado', pedidas.filter(p => p.startsWith('/rest/v1/articulos')).every(p => p.includes('estado=eq.publicado'))
  && pedidas.filter(p => p.startsWith('/rest/v1/agenda')).every(p => p.includes('estado=eq.aprobada')));
comprueba('solo se acepta GET', (await blog(new Request('https://eventspenedes.com/blog', { method: 'POST' }))).status === 405);

delete process.env.SUPABASE_SECRET_KEY;
comprueba('sin la clave del portal no hay blog', (await pide('/blog')).status === 404);

/* 5 · La migración: lo que la base de datos tiene que impedir */
const { readFileSync } = await import('node:fs');
const sql = readFileSync(new URL('../supabase/migrations/20261016120000_blog_agenda.sql', import.meta.url), 'utf8');
comprueba('una entrevista no se publica sin permiso del partner ni su visto bueno', /estado <> 'publicado' or tipo <> 'entrevista' or \(permiso_nombre and ok_partner_en is not null\)/.test(sql));
comprueba('un partner solo propone acciones pendientes', /public\.es_miembro\(partner_id\) and estado = 'propuesta'/.test(sql));
comprueba('cambiar el texto pide otra vez el visto bueno', /new\.ok_partner_en := null/.test(sql));

console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo bien\n');
process.exit(fallos ? 1 : 0);
