/* =============================================================================
   Prueba de la función del portal con Zoho (/api/portal/…)

   Lo que importa: que sin sesión no haga nada; que un partner no lea nada de
   Zoho ni pase a Zoho mensajes que no son suyos ni notas internas; y que cada
   respuesta de un partner llegue como nota al trato de su reserva (o a su
   cuenta) y con una tarea para que alguien conteste.

   Uso:  node tools/test-portal.mjs
   ========================================================================== */
let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
console.log('\nPrueba de la función del portal\n');

const { default: handler, textoNota } = await import('../netlify/functions/portal.mjs');
const pedir = (ruta, { token, method = 'GET', body } = {}) => handler(new Request(`https://eventspenedes.com${ruta}`, {
  method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}));

comprueba('sin la clave del portal no responde', (await pedir('/api/portal/zoho?partner=x')).status === 503);

process.env.SUPABASE_SECRET_KEY = 'sb_secret_de_prueba';
process.env.ZOHO_CLIENT_ID = 'id'; process.env.ZOHO_CLIENT_SECRET = 's'; process.env.ZOHO_REFRESH_TOKEN = 'r';

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const SOCIO = '00000000-0000-4000-8000-00000000000b';
const OTRO = '00000000-0000-4000-8000-00000000000c';
const P1 = '11111111-1111-4111-8111-111111111111';
const R1 = '22222222-2222-4222-8222-222222222222';
const TOKENS = { 'a.b.admin': ADMIN, 'a.b.socio': SOCIO, 'a.b.otro': OTRO };
const MENSAJES = {
  '33333333-3333-4333-8333-333333333331': { id: '33333333-3333-4333-8333-333333333331', partner_id: P1, sobre: 'reserva', ref: R1, autor: SOCIO,
    tipo: 'reserva_alternativa', texto: 'Mejor el sábado', datos: { fecha: '2026-11-21' }, interno: false, creado_en: '2026-10-15T10:00:00Z' },
  '33333333-3333-4333-8333-333333333332': { id: '33333333-3333-4333-8333-333333333332', partner_id: P1, sobre: 'general', ref: null, autor: ADMIN,
    tipo: 'nota_interna', texto: 'Negociar en primavera', interno: true, creado_en: '2026-10-15T10:05:00Z' },
};
let zohoDeal = '4810000000123456';
const llamadas = [];
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  llamadas.push({ url: u, op });
  if (u.endsWith('/auth/v1/user')) {
    const t = (op.headers?.Authorization || '').replace('Bearer ', '');
    return TOKENS[t] ? Response.json({ id: TOKENS[t], email: 'x@y.z' }) : new Response('{}', { status: 401 });
  }
  if (u.includes('/rest/v1/admins')) { return Response.json(u.includes(ADMIN) ? [{ user_id: ADMIN }] : []); }
  if (u.includes('/rest/v1/miembros')) { return Response.json(u.includes(SOCIO) && u.includes(P1) ? [{ user_id: SOCIO }] : []); }
  if (u.includes('/rest/v1/partners')) { return Response.json([{ id: P1, nombre: 'Masia de Prova', zoho_account_id: '4810000000999999' }]); }
  if (u.includes('/rest/v1/reservas')) { return Response.json([{ id: R1, titulo: 'Comida · 40', fecha: '2026-11-20', personas: 40, zoho_deal_id: zohoDeal }]); }
  if (u.includes('/rest/v1/mensajes') && (op.method || 'GET') === 'GET') {
    const id = (u.match(/id=eq\.([0-9a-f-]+)/) || [])[1];
    return Response.json(id ? (MENSAJES[id] ? [MENSAJES[id]] : []) : Object.values(MENSAJES));
  }
  if (u.includes('/rest/v1/mensajes') && op.method === 'PATCH') { return new Response(null, { status: 204 }); }
  if (u.includes('accounts.zoho')) { return Response.json({ access_token: 'tok', expires_in: 3600 }); }
  if (u.includes('zohoapis')) {
    if (/\/Notes$/.test(u) || /\/Tasks$/.test(u)) { return Response.json({ data: [{ status: 'success', details: { id: '99' } }] }); }
    if (/Accounts\/\d+\?fields/.test(u)) { return Response.json({ data: [{ Account_Name: 'Masia de Prova', Tag: [{ name: 'Localización' }], Owner: { name: 'Alvaro' } }] }); }
    if (/Accounts\/\d+\/Deals/.test(u)) { return Response.json({ data: [{ id: '4810000000123456', Deal_Name: 'Empresa · Comida', Stage: 'Propuesta', Closing_Date: '2026-11-20' }] }); }
    if (/Accounts\/\d+\/(Notes|Tasks)\?/.test(u)) { return new Response(null, { status: 204 }); }
    if (/Deals\/\d+\?fields/.test(u)) { return Response.json({ data: [{ Deal_Name: 'Empresa · Comida', Stage: 'Propuesta', Closing_Date: '2026-11-20' }] }); }
    if (/Accounts\/search/.test(u)) { return Response.json({ data: [{ id: '4810000000999999', Account_Name: 'Masia de Prova' }] }); }
  }
  return new Response('?', { status: 404 });
};

comprueba('sin sesión, 401', (await pedir('/api/portal/zoho?partner=' + P1)).status === 401);
comprueba('con un token inventado, 401', (await pedir('/api/portal/zoho?partner=' + P1, { token: 'a.b.falso' })).status === 401);
comprueba('un partner no lee nada de Zoho', (await pedir('/api/portal/zoho?partner=' + P1, { token: 'a.b.socio' })).status === 403);

const r = await pedir('/api/portal/zoho?partner=' + P1, { token: 'a.b.admin' });
const { cuenta } = await r.json();
comprueba('administración ve la cuenta, sus tratos y etiquetas', r.status === 200 && cuenta.nombre === 'Masia de Prova'
  && cuenta.tratos.length === 1 && cuenta.etiquetas.includes('Localización') && /crm\.zoho\.eu\/crm\/tab\/Accounts\//.test(cuenta.enlace));
comprueba('y un trato para pedir una reserva', (await (await pedir('/api/portal/zoho?deal=4810000000123456', { token: 'a.b.admin' })).json()).trato.cierre === '2026-11-20');
comprueba('un id de trato raro no llega a Zoho', (await pedir('/api/portal/zoho?deal=abc', { token: 'a.b.admin' })).status === 400);

llamadas.length = 0;
const otro = await pedir('/api/portal/sincronizar', { token: 'a.b.otro', method: 'POST', body: { mensaje: '33333333-3333-4333-8333-333333333331' } });
comprueba('alguien de otro partner no pasa a Zoho mensajes ajenos', otro.status === 403 && !llamadas.some(l => l.url.includes('zohoapis')));
const interna = await pedir('/api/portal/sincronizar', { token: 'a.b.socio', method: 'POST', body: { mensaje: '33333333-3333-4333-8333-333333333332' } });
comprueba('ni un partner una nota interna', interna.status === 403);
comprueba('un partner no pasa a Zoho todo lo pendiente', (await pedir('/api/portal/sincronizar', { token: 'a.b.socio', method: 'POST', body: {} })).status === 403);

llamadas.length = 0;
const s = await pedir('/api/portal/sincronizar', { token: 'a.b.socio', method: 'POST', body: { mensaje: '33333333-3333-4333-8333-333333333331' } });
const nota = llamadas.find(l => /Deals\/4810000000123456\/Notes$/.test(l.url));
const tarea = llamadas.find(l => /\/Tasks$/.test(l.url));
comprueba('la respuesta del partner va como nota al trato de la reserva', s.status === 200 && nota
  && /El partner propone otra cosa · Masia de Prova/.test(nota.op.body) && /Mejor el sábado/.test(nota.op.body) && /Lo escribe Masia de Prova/.test(nota.op.body));
comprueba('con una tarea para contestarle', tarea && /Contestar a Masia de Prova/.test(tarea.op.body));
comprueba('y el mensaje queda marcado como pasado', llamadas.some(l => l.op.method === 'PATCH' && /zoho_nota_id/.test(l.op.body)));

zohoDeal = null;
llamadas.length = 0;
await pedir('/api/portal/sincronizar', { token: 'a.b.admin', method: 'POST', body: {} });
comprueba('sin trato, a la cuenta del partner', llamadas.some(l => /Accounts\/4810000000999999\/Notes$/.test(l.url)));
comprueba('lo que escribe administración no crea tareas', llamadas.filter(l => /\/Tasks$/.test(l.url)).length === 1);

const t = textoNota({ tipo: 'reserva_confirmada', texto: null, datos: { fecha: '2026-11-21', otra: 'x' }, creado_en: 'ahora' },
  { partner: { nombre: 'P' }, reserva: { titulo: 'T', fecha: '2026-11-21' }, dePartner: true });
comprueba('la nota solo cuenta los datos que conoce', /Fecha: 2026-11-21/.test(t.texto) && !/otra/.test(t.texto));

console.log('');
if (fallos) { console.log(`❌ ${fallos} fallo${fallos > 1 ? 's' : ''}.`); process.exit(1); }
console.log('✅ El portal solo habla con Zoho por quien debe y lo que debe.\n');
