/* =============================================================================
   Prueba de la lectura de B2Brouter para el tablero

   Lo que no puede pasar:
   1. Que responda sin la clave, con otra clave o sin clave configurada.
   2. Que llegue a B2Brouter algo que no sea un GET de las facturas de la
      cuenta configurada: otra cuenta, `..`, otra ruta o cualquier otro método.
   3. Que la clave de B2Brouter salga en la respuesta.

   B2Brouter no se llama: fetch se sustituye por uno falso que apunta cada
   llamada.

   Uso:  node tools/test-tablero-b2b.mjs
   ========================================================================== */
const CLAVE = 'clave-del-tablero-de-prueba-0123456789';
const B2B = 'test_clave-de-b2brouter-de-prueba';
Object.assign(process.env, { B2BROUTER_API_KEY: B2B, B2BROUTER_CUENTA: '344059', B2BROUTER_WEB: 'https://sandbox.app.b2brouter.net' });

const llamadas = [];
globalThis.fetch = async (url, o = {}) => {
  llamadas.push({ linea: `${o.method || 'GET'} ${url}`, clave: o.headers?.['X-B2B-API-Key'] });
  return new Response(JSON.stringify({ invoices: [{ id: 1, state: 'paid' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};

const { default: tablero } = await import('../netlify/functions/tablero-b2b.mjs');

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
const pide = (q, { clave = CLAVE, metodo = 'GET' } = {}) => tablero(new Request(`https://eventspenedes.com/api/tablero-b2b?${q}`, {
  method: metodo, headers: clave ? { authorization: `Bearer ${clave}` } : {},
}));

console.log('\nSin clave configurada');
delete process.env.TABLERO_CLAVE;
comprueba('responde 503', (await pide('estado=1')).status === 503);
process.env.TABLERO_CLAVE = 'corta';
comprueba('con una clave corta, también 503', (await pide('estado=1', { clave: 'corta' })).status === 503);
process.env.TABLERO_CLAVE = CLAVE;

console.log('\nSolo con su clave');
comprueba('sin cabecera: 401', (await pide('estado=1', { clave: null })).status === 401);
comprueba('con otra clave: 401', (await pide('estado=1', { clave: CLAVE + 'x' })).status === 401);
comprueba('un POST: 405', (await pide('ruta=invoices', { metodo: 'POST' })).status === 405);
llamadas.length = 0;
await pide('ruta=invoices', { clave: 'mala-mala-mala-mala-mala-mala-mala-mala' });
comprueba('sin clave no llega nada a B2Brouter', llamadas.length === 0);

console.log('\nEstado');
const e = await (await pide('estado=1')).json();
comprueba('dice que es el sandbox y da su web', e.ok && e.sandbox === true && e.web === 'https://sandbox.app.b2brouter.net');
const cuenta = process.env.B2BROUTER_CUENTA;
delete process.env.B2BROUTER_CUENTA;
comprueba('sin cuenta en Netlify: 503', (await pide('estado=1')).status === 503);
process.env.B2BROUTER_CUENTA = cuenta;

console.log('\nSolo las facturas de la cuenta');
llamadas.length = 0;
for (const ruta of ['invoices?type=IssuedInvoice&limit=500&offset=0&date_from=2025-10-13', 'invoices/123', 'invoices']) {
  const r = await pide('ruta=' + encodeURIComponent(ruta));
  comprueba(`lee ${ruta.split('?')[0]}`, r.status === 200 && !JSON.stringify(await r.json()).includes(B2B));
}
for (const ruta of ['accounts', 'contacts', 'invoices/../contacts', 'invoices/1/send', '../344060/invoices', 'invoices?x=1#', 'invoices/abc', '']) {
  comprueba(`rechaza «${ruta}»`, (await pide('ruta=' + encodeURIComponent(ruta))).status === 400);
}
comprueba('a B2Brouter solo le llegan GET de esa cuenta',
  llamadas.length === 3 && llamadas.every(l => l.linea.startsWith('GET https://api.b2brouter.net/accounts/344059/invoices') && l.clave === B2B));

const r = await pide('ruta=invoices');
comprueba('sin cachear', r.headers.get('cache-control').includes('no-store'));

console.log(fallos ? `\n✗ ${fallos} fallos\n` : '\n✓ La lectura de B2Brouter solo responde con su clave y solo lee facturas\n');
process.exit(fallos ? 1 : 0);
