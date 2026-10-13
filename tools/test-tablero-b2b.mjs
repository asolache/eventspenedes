/* =============================================================================
   Prueba de B2Brouter para el tablero

   Lo que no puede pasar:
   1. Que responda sin la clave, con otra clave o sin clave configurada.
   2. Que llegue a B2Brouter algo que no sea un GET de las facturas o los
      contactos de la cuenta configurada, o un borrador: otra cuenta, `..`,
      otra ruta o cualquier otro método.
   3. Que un borrador salga emitido o enviado, o se cree fuera del sandbox
      sin B2BROUTER_ESCRITURA, o con líneas que no se han comprobado.
   4. Que la clave de B2Brouter salga en la respuesta.

   B2Brouter no se llama: fetch se sustituye por uno falso que apunta cada
   llamada.

   Uso:  node tools/test-tablero-b2b.mjs
   ========================================================================== */
const CLAVE = 'clave-del-tablero-de-prueba-0123456789';
const B2B = 'test_clave-de-b2brouter-de-prueba';
Object.assign(process.env, { B2BROUTER_API_KEY: B2B, B2BROUTER_CUENTA: '344059', B2BROUTER_WEB: 'https://sandbox.app.b2brouter.net' });

const llamadas = [];
globalThis.fetch = async (url, o = {}) => {
  llamadas.push({ linea: `${o.method || 'GET'} ${url}`, clave: o.headers?.['X-B2B-API-Key'], cuerpo: o.body ? JSON.parse(o.body) : null });
  const j = o.method === 'POST' ? { invoice: { id: 77, state: 'new' } } : { invoices: [{ id: 1, state: 'paid' }] };
  return new Response(JSON.stringify(j), { status: o.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } });
};

const { default: tablero } = await import('../netlify/functions/tablero-b2b.mjs');

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
const pide = (q, { clave = CLAVE, metodo = 'GET', cuerpo } = {}) => tablero(new Request(`https://eventspenedes.com/api/tablero-b2b?${q}`, {
  method: metodo, headers: clave ? { authorization: `Bearer ${clave}` } : {},
  ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
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
comprueba('un PUT: 405', (await pide('ruta=invoices', { metodo: 'PUT' })).status === 405);
comprueba('un DELETE: 405', (await pide('ruta=invoices', { metodo: 'DELETE' })).status === 405);
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
for (const ruta of ['invoices?type=IssuedInvoice&limit=500&offset=0&date_from=2025-10-13', 'contacts?limit=500', 'invoices']) {
  const r = await pide('ruta=' + encodeURIComponent(ruta));
  comprueba(`lee ${ruta.split('?')[0]}`, r.status === 200 && !JSON.stringify(await r.json()).includes(B2B));
}
for (const ruta of ['accounts', 'invoices/123', 'contacts/5', 'invoices/../contacts', 'invoices/1/send', '../344060/invoices', 'invoices?x=1#', 'invoices/abc', '']) {
  comprueba(`rechaza «${ruta}»`, (await pide('ruta=' + encodeURIComponent(ruta))).status === 400);
}
comprueba('a B2Brouter solo le llegan GET de esa cuenta',
  llamadas.length === 3 && llamadas.every(l => /^GET https:\/\/api\.b2brouter\.net\/accounts\/344059\/(invoices|contacts)/.test(l.linea) && l.clave === B2B));

console.log('\nBorradores');
const BUENO = { contact_id: 12, fecha: '2026-10-23', lineas: [{ concepto: 'Taller de castells «Fent Pinya»', unidades: 1, precio: 1200, iva: 21 }, { concepto: 'Gestión del espacio', unidades: 1, precio: 200, iva: 21 }] };
llamadas.length = 0;
const b = await pide('borrador=1', { metodo: 'POST', cuerpo: BUENO });
const jb = await b.json();
comprueba('crea uno en el sandbox', b.status === 201 && jb.id === 77 && jb.estado === 'new' && jb.enlace.startsWith('https://sandbox.app.b2brouter.net'));
const enviado = llamadas[0]?.cuerpo;
comprueba('un solo POST, a las facturas de la cuenta', llamadas.length === 1 && llamadas[0].linea === 'POST https://api.b2brouter.net/accounts/344059/invoices');
comprueba('ni se emite ni se envía', enviado && !('send_after_import' in enviado) && !('issue_after_import' in enviado) && Object.keys(enviado).join() === 'invoice');
comprueba('con sus líneas y su IVA', enviado?.invoice.invoice_lines_attributes.length === 2
  && enviado.invoice.invoice_lines_attributes[0].taxes_attributes[0].percent === 21 && enviado.invoice.contact_id === 12);
llamadas.length = 0;
for (const [nombre, cuerpo] of [
  ['sin contacto', { ...BUENO, contact_id: null }],
  ['sin líneas', { ...BUENO, lineas: [] }],
  ['un IVA inventado', { ...BUENO, lineas: [{ ...BUENO.lineas[0], iva: 18 }] }],
  ['un precio negativo', { ...BUENO, lineas: [{ ...BUENO.lineas[0], precio: -5 }] }],
  ['cero unidades', { ...BUENO, lineas: [{ ...BUENO.lineas[0], unidades: 0 }] }],
  ['una fecha rara', { ...BUENO, fecha: 'mañana' }],
  ['que pida enviarlo', { ...BUENO, send_after_import: true }],
]) {
  const r = await pide('borrador=1', { metodo: 'POST', cuerpo });
  comprueba(`${nombre === 'que pida enviarlo' ? 'crea, sin hacer caso a' : 'rechaza'} ${nombre}`, nombre === 'que pida enviarlo' ? r.status === 201 : r.status === 400);
}
comprueba('lo que se pide de más no llega a B2Brouter', llamadas.length === 1 && !('send_after_import' in llamadas[0].cuerpo));
comprueba('un POST sin «borrador»: 400', (await pide('ruta=invoices', { metodo: 'POST', cuerpo: BUENO })).status === 400);
comprueba('sin clave no se crea', (await pide('borrador=1', { metodo: 'POST', cuerpo: BUENO, clave: null })).status === 401);
process.env.B2BROUTER_API_KEY = 'prod_clave-real';
comprueba('fuera del sandbox, no sin B2BROUTER_ESCRITURA', (await pide('borrador=1', { metodo: 'POST', cuerpo: BUENO })).status === 403);
process.env.B2BROUTER_ESCRITURA = 'si';
comprueba('y con ella, sí', (await pide('borrador=1', { metodo: 'POST', cuerpo: BUENO })).status === 201);
delete process.env.B2BROUTER_ESCRITURA;
process.env.B2BROUTER_API_KEY = B2B;

const r = await pide('ruta=invoices');
comprueba('sin cachear', r.headers.get('cache-control').includes('no-store'));

console.log(fallos ? `\n✗ ${fallos} fallos\n` : '\n✓ B2Brouter: solo con su clave, lee facturas y contactos y solo crea borradores\n');
process.exit(fallos ? 1 : 0);
