/* =============================================================================
   Prueba de la lectura de Zoho para el tablero

   Lo que no puede pasar:
   1. Que responda sin la clave, con otra clave o sin clave configurada.
   2. Que llegue a Zoho una lectura que no es de la lista: otro módulo, `..`,
      u otra versión de la API.
   3. Que escriba algo que no está en su lista: otra ruta, otro método, un
      campo de más; o que escriba con TABLERO_ESCRITURA=no.
   4. Que deje de abrir un borrador legítimo, o que abra uno tocado.

   Zoho no se llama: fetch se sustituye por uno falso que apunta cada llamada.

   Uso:  node tools/test-tablero.mjs
   ========================================================================== */
const CLAVE = 'clave-del-tablero-de-prueba-0123456789';
const SECRETO = 'clave-de-prueba-larguisima-no-usar-jamas';
Object.assign(process.env, { ZOHO_CLIENT_ID: 'x', ZOHO_CLIENT_SECRET: 'x', ZOHO_REFRESH_TOKEN: 'x', ZOHO_DC: 'com', PROPUESTA_SECRET: SECRETO });

const llamadas = [];
const cuerpos = [];
globalThis.fetch = async (url, o = {}) => {
  const metodo = o.method || 'GET';
  llamadas.push(`${metodo} ${url}`);
  if (o.body && !String(url).includes('/oauth/')) { cuerpos.push(JSON.parse(o.body)); }
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
const pide = (q, { clave = CLAVE, metodo = 'GET', cuerpo } = {}) => tablero(new Request(`https://eventspenedes.com/api/tablero?${q}`, {
  method: metodo, headers: clave ? { authorization: `Bearer ${clave}` } : {}, body: cuerpo,
}));
const escribe = (p, o = {}) => pide('', { metodo: 'POST', cuerpo: typeof p === 'string' ? p : JSON.stringify(p), ...o });
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
comprueba('un DELETE: 405', (await pide('estado=1', { metodo: 'DELETE' })).status === 405);
llamadas.length = 0;
comprueba('una escritura sin clave: 401', (await escribe({ metodo: 'POST', ruta: 'Leads', datos: { Last_Name: 'x' } }, { clave: null })).status === 401);
comprueba('y no llega a Zoho', llamadas.length === 0);
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

console.log('\nSolo las escrituras de la lista');
llamadas.length = 0; cuerpos.length = 0;
const buenas = [
  [{ metodo: 'POST', ruta: 'Deals/123/Notes', datos: { Note_Title: 'Llamada', Note_Content: 'Quieren visita' } }, 'POST', '/crm/v2/Deals/123/Notes'],
  [{ metodo: 'POST', ruta: 'Accounts/9/Notes', datos: { Note_Title: 'Visita', Note_Content: 'Bien' } }, 'POST', '/crm/v2/Accounts/9/Notes'],
  [{ metodo: 'PUT', ruta: 'Deals/123', datos: { Stage: 'Visita', Next_Step: 'Llamar', Closing_Date: '2027-01-10', Amount: 1 } }, 'PUT', '/crm/v2/Deals/123'],
  [{ metodo: 'PUT', ruta: 'Leads/5', datos: { Lead_Status: 'Contactado', Email: 'otro@x.com' } }, 'PUT', '/crm/v2/Leads/5'],
  [{ metodo: 'POST', ruta: 'Leads', datos: { Last_Name: 'Puig', Company: 'Acme', Owner: { id: '1' } } }, 'POST', '/crm/v2/Leads'],
];
for (const [p, metodo, ruta] of buenas) {
  comprueba(`escribe ${p.metodo} ${p.ruta}`, (await escribe(p)).status === 200 && zoho().at(-1) === `${metodo} https://www.zohoapis.com${ruta}`);
}
comprueba('quita los campos de más (Amount, Email, Owner)', !cuerpos.some(c => 'Amount' in c.data[0] || 'Email' in c.data[0] || 'Owner' in c.data[0]));
comprueba('pasa los de la lista', cuerpos[2].data[0].Stage === 'Visita' && cuerpos[4].data[0].Last_Name === 'Puig');
const antes = zoho().length;
for (const p of [{ metodo: 'DELETE', ruta: 'Deals/123' }, { metodo: 'PUT', ruta: 'Accounts/9', datos: { Account_Name: 'x' } },
  { metodo: 'POST', ruta: 'Deals', datos: { Deal_Name: 'x' } }, { metodo: 'POST', ruta: 'Leads/5/actions/convert', datos: {} },
  { metodo: 'PUT', ruta: 'Deals/123/../../Users/1', datos: { Stage: 'x' } }, { metodo: 'PUT', ruta: 'Deals/123', datos: { Amount: 1 } },
  { metodo: 'POST', ruta: 'Users/1/Notes', datos: { Note_Content: 'x' } }, 'esto no es json']) {
  comprueba(`rechaza ${typeof p === 'string' ? p : p.metodo + ' ' + p.ruta}`, (await escribe(p)).status === 400);
}
comprueba('nada de eso llega a Zoho', zoho().length === antes);
process.env.TABLERO_ESCRITURA = 'no';
comprueba('con TABLERO_ESCRITURA=no, 403', (await escribe(buenas[0][0])).status === 403 && zoho().length === antes);
comprueba('y sigue leyendo', (await pide('ruta=Deals')).status === 200);
delete process.env.TABLERO_ESCRITURA;

console.log('\nBorradores');
const sobre = cerrar({ evento: { id: '2027-05-14-acme' }, descartes: [], avisos: [] }, SECRETO);
const b = await pide('sobre=' + sobre);
comprueba('abre uno legítimo', b.status === 200 && (await b.json()).evento?.id === '2027-05-14-acme');
const tocado = sobre.slice(0, -3) + (sobre.endsWith('AAA') ? 'BBB' : 'AAA');
comprueba('no abre uno tocado', (await pide('sobre=' + tocado)).status === 400);
comprueba('no abre uno con otra clave', (await pide('sobre=' + cerrar({ evento: { id: 'x' } }, SECRETO + 'otra'))).status === 400);
comprueba('sin cachear', b.headers.get('cache-control').includes('no-store'));

console.log(fallos ? `\n✗ ${fallos} fallos\n` : '\n✓ El tablero solo entra con su clave, lee lo de su lista y escribe solo lo de su lista\n');
process.exit(fallos ? 1 : 0);
