/* =============================================================================
   Prueba de la lectura de Zoho para el tablero

   Lo que no puede pasar:
   1. Que responda sin la clave, con otra clave o sin clave configurada.
   2. Que llegue a Zoho algo que no sea un GET de la lista: otro módulo, `..`,
      otra versión de la API, o cualquier otro método.
   3. Que deje de abrir un borrador legítimo, o que abra uno tocado.

   Zoho no se llama: fetch se sustituye por uno falso que apunta cada llamada.

   Uso:  node tools/test-tablero.mjs
   ========================================================================== */
const CLAVE = 'clave-del-tablero-de-prueba-0123456789';
const SECRETO = 'clave-de-prueba-larguisima-no-usar-jamas';
Object.assign(process.env, { ZOHO_CLIENT_ID: 'x', ZOHO_CLIENT_SECRET: 'x', ZOHO_REFRESH_TOKEN: 'x', ZOHO_DC: 'com', PROPUESTA_SECRET: SECRETO });

const llamadas = [];
globalThis.fetch = async (url, o = {}) => {
  const metodo = o.method || 'GET';
  llamadas.push(`${metodo} ${url}`);
  const j = String(url).includes('/oauth/v2/token') ? { access_token: 'falso', expires_in: 3600 } : { data: [{ id: '1' }] };
  return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { default: tablero } = await import('../netlify/functions/tablero.mjs');
const { cerrar } = await import('../netlify/propuesta/sobre.mjs');

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
const pide = (q, { clave = CLAVE, metodo = 'GET' } = {}) => tablero(new Request(`https://eventspenedes.com/api/tablero?${q}`, {
  method: metodo, headers: clave ? { authorization: `Bearer ${clave}` } : {},
}));
const zoho = () => llamadas.filter(l => !l.includes('/oauth/v2/token'));

console.log('\nSin clave configurada');
delete process.env.TABLERO_CLAVE;
comprueba('responde 503', (await pide('estado=1')).status === 503);
process.env.TABLERO_CLAVE = 'corta';
comprueba('con una clave corta, también 503', (await pide('estado=1', { clave: 'corta' })).status === 503);
process.env.TABLERO_CLAVE = CLAVE;

console.log('\nSolo con su clave');
comprueba('sin cabecera: 401', (await pide('estado=1', { clave: null })).status === 401);
comprueba('con otra clave: 401', (await pide('estado=1', { clave: CLAVE + 'x' })).status === 401);
comprueba('con la clave: estado ok y com', (await (await pide('estado=1')).json()).dc === 'com');
comprueba('un POST: 405', (await pide('estado=1', { metodo: 'POST' })).status === 405);
llamadas.length = 0;
await pide('ruta=Deals', { clave: 'mala-mala-mala-mala-mala-mala-mala-mala' });
comprueba('sin clave no llega nada a Zoho', llamadas.length === 0);

console.log('\nSolo lecturas de la lista');
llamadas.length = 0;
for (const ruta of ['Deals?fields=Deal_Name,Stage&per_page=200&page=1&sort_by=Modified_Time&sort_order=desc',
  'Deals/123', 'Deals/123/Notes?per_page=50', 'Accounts', 'Leads', 'Contacts/7']) {
  comprueba(`lee ${ruta.split('?')[0]}`, (await pide('ruta=' + encodeURIComponent(ruta))).status === 200);
}
for (const ruta of ['Users', 'settings/modules', 'Deals/../Users', 'Deals/1/Attachments', '../v3/Deals', 'Deals?x=1#', 'Deals/abc', '']) {
  comprueba(`rechaza «${ruta}»`, (await pide('ruta=' + encodeURIComponent(ruta))).status === 400);
}
comprueba('a Zoho solo le llegan GET de crm/v2', zoho().length === 6 && zoho().every(l => l.startsWith('GET https://www.zohoapis.com/crm/v2/')));

console.log('\nBorradores');
const sobre = cerrar({ evento: { id: '2027-05-14-acme' }, descartes: [], avisos: [] }, SECRETO);
const b = await pide('sobre=' + sobre);
comprueba('abre uno legítimo', b.status === 200 && (await b.json()).evento?.id === '2027-05-14-acme');
const tocado = sobre.slice(0, -3) + (sobre.endsWith('AAA') ? 'BBB' : 'AAA');
comprueba('no abre uno tocado', (await pide('sobre=' + tocado)).status === 400);
comprueba('no abre uno con otra clave', (await pide('sobre=' + cerrar({ evento: { id: 'x' } }, SECRETO + 'otra'))).status === 400);
comprueba('sin cachear', b.headers.get('cache-control').includes('no-store'));

console.log(fallos ? `\n✗ ${fallos} fallos\n` : '\n✓ La lectura del tablero solo responde con su clave y solo lee\n');
process.exit(fallos ? 1 : 0);
