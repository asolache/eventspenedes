/* =============================================================================
   Prueba de la importación de catálogos a la ficha de localización

   Lo que no puede fallar, por orden:
     1. Que nada que no sea un campo de la ficha, o que sea nuestro, entre.
     2. Que la función no se deje usar para leer la red interna de Netlify.
     3. Que lo que se saca sea lo que la fuente dice: de la web, del PDF y de
        Claude, con la frase de la que sale.

   Sin red: las webs, los PDF y Claude son simulados.

   Uso:  node tools/test-importar.mjs
   ========================================================================== */
import { deflateSync } from 'node:zlib';

const { validar, urlSegura, directa, leerHtml, candidatos, reglas, importar, conClaude, definiciones } =
  await import('../netlify/localizacion/importar.mjs');
const { textoDePdf } = await import('../netlify/localizacion/pdf-texto.mjs');
const { default: handler } = await import('../netlify/functions/importar-catalogo.mjs');

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
const lanza = async f => { try { await f(); return false; } catch { return true; } };

console.log('\nPrueba de la importación de catálogos\n');

/* --- Un PDF de prueba: texto directo, y texto dentro de un formulario con
   fuente ToUnicode de 2 bytes, que es como lo hace Canva ------------------- */
function pdfDePrueba(lineas, enFormulario = []) {
  const objs = [];
  const flujo = (dict, datos) => {
    const z = deflateSync(Buffer.from(datos, 'latin1'));
    return Buffer.concat([Buffer.from(`<< ${dict} /Filter /FlateDecode /Length ${z.length} >>\nstream\n`, 'latin1'), z, Buffer.from('\nendstream')]);
  };
  const esc = t => t.replace(/[\\()]/g, m => '\\' + m);
  const contenido = 'BT /F1 12 Tf 50 800 Td ' + lineas.map(l => `(${esc(l)}) Tj 0 -14 Td`).join(' ') + ' ET /X1 Do';
  /* La fuente del formulario: glifo n → carácter, con un bfrange para las letras */
  const hex = t => [...t].map(c => (c.charCodeAt(0) + 100).toString(16).padStart(4, '0')).join('');
  const cmap = `/CIDInit /ProcSet findresource begin 12 dict begin begincmap
1 begincodespacerange <0000> <FFFF> endcodespacerange
1 beginbfrange <0064> <0163> <0000> endbfrange
endcmap end end`;
  const form = 'BT /G1 10 Tf 1 0 0 1 50 400 Tm ' + enFormulario.map((l, i) => `1 0 0 1 50 ${400 - i * 14} Tm <${hex(l)}> Tj`).join(' ') + ' ET';
  objs[1] = Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'latin1');
  objs[2] = Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 /Resources << /Font << /F1 5 0 R >> /XObject << /X1 6 0 R >> >> >>', 'latin1');
  objs[3] = Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>', 'latin1');
  objs[4] = flujo('', contenido);
  objs[5] = Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', 'latin1');
  objs[6] = flujo('/Type /XObject /Subtype /Form /BBox [0 0 595 842] /Resources << /Font << /G1 7 0 R >> >>', form);
  objs[7] = Buffer.from('<< /Type /Font /Subtype /Type0 /BaseFont /X /Encoding /Identity-H /ToUnicode 8 0 R >>', 'latin1');
  objs[8] = flujo('', cmap);
  const partes = [Buffer.from('%PDF-1.4\n', 'latin1')];
  for (let i = 1; i < objs.length; i++) {
    partes.push(Buffer.from(`${i} 0 obj\n`, 'latin1'), objs[i], Buffer.from('\nendobj\n', 'latin1'));
  }
  partes.push(Buffer.from('trailer << /Root 1 0 R >>\n%%EOF', 'latin1'));
  return Buffer.concat(partes);
}

const PDF = pdfDePrueba(
  ['Celler de Prova', 'Carrer de les Vinyes 3, 08739 Sant Pau d\'Ordal', 'Tel. 93 899 20 03',
   'La sala de barricas acoge banquetes de hasta 120 personas sentadas.', 'COMISIÓN: 10%',
   'Visita guiada a la bodega y cata de vinos.'],
  ['Wifi en todo el recinto', 'Bodas y team building'],
);

/* --- 1 · El PDF se lee ------------------------------------------------------ */
const t = textoDePdf(PDF);
comprueba('el PDF se lee, con saltos de línea', /Celler de Prova\nCarrer de les Vinyes/.test(t.texto));
comprueba('lee el texto de los formularios con fuente ToUnicode (como Canva)', /Wifi en todo el recinto/.test(t.texto) && /Bodas y team building/.test(t.texto));
comprueba('dice cuánto de lo leído es legible', t.legible > 0.9 && t.paginas === 1);
comprueba('lo que no es un PDF se rechaza', await lanza(() => textoDePdf(Buffer.from('<html>'))));

/* --- 2 · validar(): la lista blanca ----------------------------------------- */
const v = validar([
  { campo: 'nombre', valor: 'Celler de Prova', cita: 'portada' },
  { campo: 'nombre', valor: 'Otro nombre', cita: 'después' },
  { campo: 'tipo', valor: 'Bodega o cava', cita: 'x' },
  { campo: 'aforo_banquete', valor: '120', cita: 'p. 3' },
  { campo: 'aforo_coctel', valor: 'unos 200', cita: 'x' },
  { campo: 'sala1_precio_dia', valor: '1.500,50', cita: 'x' },
  { campo: 'alquiler_dia', valor: '1,200.00', cita: 'x' },
  { campo: 'sala1_m2', valor: '51.5', cita: 'x' },
  { campo: 'catering', valor: 'lo-que-sea', cita: 'x' },
  { campo: 'pmr', valor: 'Sí', cita: 'x' },
  { campo: 'cata_tipos_vinos', valor: 'si', cita: 'x' },
  { campo: 'autoriza', valor: 'si', cita: 'x' },
  { campo: 'fotos_permiso', valor: 'escrito', cita: 'x' },
  { campo: 'relacion', valor: 'aliado', cita: 'x' },
  { campo: 'visita_notas', valor: 'nota nuestra', cita: 'x' },
  { campo: 'inventado', valor: 'x', cita: 'x' },
  { campo: 'contacto_correo', valor: 'no es un correo', cita: 'x' },
  { campo: 'web', valor: 'javascript:alert(1)', cita: 'x' },
  { campo: 'taller_comision', valor: '0', cita: 'sin comisión en espacios' },
]);
comprueba('entra lo que es un campo, con su cita', v.datos.nombre === 'Celler de Prova' && v.origen.aforo_banquete === 'p. 3');
comprueba('el primer valor de un campo se queda', v.datos.nombre === 'Celler de Prova');
comprueba('un desplegable acepta la clave o el texto de la opción, y nada más',
  v.datos.tipo === 'bodega' && !('catering' in v.datos));
comprueba('los números se leen en castellano y en inglés; «unos 200» no es un número',
  v.datos.sala1_precio_dia === '1500.5' && v.datos.alquiler_dia === '1200' && !('aforo_coctel' in v.datos) && !('sala1_m2' in v.datos));
comprueba('sí/no y casillas', v.datos.pmr === 'si' && v.datos.cata_tipos_vinos === 'si');
comprueba('la casilla marca su bloque', v.datos.ofrece_cata === 'si');
comprueba('lo que decide el espacio no se importa (autorizar, permiso de fotos)', !('autoriza' in v.datos) && !('fotos_permiso' in v.datos));
comprueba('lo nuestro no se importa (relación, notas de visita)', !('relacion' in v.datos) && !('visita_notas' in v.datos));
comprueba('lo que no es un campo no entra', !('inventado' in v.datos));
comprueba('correos y webs malformados no entran', !('contacto_correo' in v.datos) && !('web' in v.datos));
comprueba('una comisión de 0 es un dato y entra', v.datos.taller_comision === '0');
comprueba('ningún campo interno es importable', [...definiciones().keys()].every(n => !/^(visita_|modelo|relacion|publicar|pendiente)/.test(n)));

/* --- 3 · Solo direcciones públicas ------------------------------------------- */
const publica = async () => [{ address: '93.184.216.34' }];
const interna = async () => [{ address: '10.0.0.7' }];
for (const [u, l] of [['http://localhost/', publica], ['http://127.0.0.1/', publica], ['http://169.254.169.254/latest/meta-data', publica],
  ['http://[::1]/', publica], ['file:///etc/passwd', publica], ['https://bodega.example:8443/', publica],
  ['https://usuario:clave@bodega.example/', publica], ['https://intranet.bodega.example/', interna], ['http://192.168.1.1/', publica]]) {
  comprueba(`no sale a ${u}`, await lanza(() => urlSegura(u, l)));
}
comprueba('sale a una web pública', (await urlSegura('https://www.bodega.example/es/', publica)).hostname === 'www.bodega.example');
comprueba('los enlaces de Drive y Dropbox se convierten en el fichero',
  directa('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing') === 'https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp'
  && directa('https://www.dropbox.com/s/abc/dossier.pdf?dl=0') === 'https://www.dropbox.com/s/abc/dossier.pdf?dl=1');

/* --- 4 · La web: datos estructurados, enlaces y frases ------------------------- */
const HTML = `<!doctype html><html><head><title>Celler de Prova · Vins del Penedès</title>
<meta property="og:site_name" content="Celler de Prova">
<meta name="description" content="Bodega familiar en las Muntanyes d&#39;Ordal desde 1902, con viñas viejas y una cava modernista abierta a visitas y eventos.">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Winery","name":"Celler de Prova",
 "telephone":"+34 938 99 20 03","address":{"@type":"PostalAddress","streetAddress":"Carrer de les Vinyes 3","addressLocality":"Sant Pau d'Ordal","postalCode":"08739"}}</script>
<style>.x{color:red}</style><script>var no = "hasta 999 personas de pie";</script></head>
<body><nav><a href="/es/eventos-empresa">Eventos de empresa</a> <a href="/es/tienda">Tienda</a> <a href="https://otra.example/eventos">Otra</a>
<a href="/docs/dossier-eventos-2026.pdf">Dossier</a> <a href="tel:+34938992003">Llamar</a></nav>
<p>Nuestro jardín admite cócteles de hasta 250 personas de pie.</p></body></html>`;
const p = leerHtml(HTML, 'https://www.celler.example/es/');
comprueba('lee schema.org, metas y enlaces', p.jsonld[0]?.name === 'Celler de Prova' && p.metas['og:site_name'] === 'Celler de Prova' && p.enlaces.length === 5);
comprueba('el texto no lleva scripts ni estilos', !/999/.test(p.texto) && !/color:red/.test(p.texto) && /250 personas de pie/.test(p.texto));
const c = candidatos(p.enlaces, 'https://www.celler.example/es/');
comprueba('elige las páginas de eventos de la misma web y el dossier en PDF',
  c.paginas.join() === 'https://www.celler.example/es/eventos-empresa' && c.pdfs.join() === 'https://www.celler.example/docs/dossier-eventos-2026.pdf');
const r = validar(reglas({ url: 'https://www.celler.example/es/', paginas: [p], textos: [{ de: 'web', texto: p.texto }] }));
comprueba('las reglas sacan nombre, tipo, dirección y teléfono de schema.org',
  r.datos.nombre === 'Celler de Prova' && r.datos.tipo === 'bodega' && r.datos.cp === '08739'
  && r.datos.poblacion === "Sant Pau d'Ordal" && r.datos.telefono === '+34 938 99 20 03');
comprueba('el aforo sale solo con su formato y su frase', r.datos.aforo_coctel === '250' && /250 personas de pie/.test(r.origen.aforo_coctel));
comprueba('la web es la que nos dan', r.datos.web === 'https://www.celler.example/');

/* --- 5 · Todo junto, sin Claude: web + página de eventos + PDF enlazado -------- */
const red = (mapa) => async (url) => {
  const x = mapa[url];
  if (!x) { return new Response('no', { status: 404 }); }
  if (x.redirige) { return new Response(null, { status: 302, headers: { location: x.redirige } }); }
  return new Response(x.cuerpo, { headers: { 'content-type': x.tipo } });
};
const WEB = {
  'https://www.celler.example/es/': { cuerpo: HTML, tipo: 'text/html' },
  'https://www.celler.example/es/eventos-empresa': { cuerpo: '<p>Convenciones y cenas de gala para empresas.</p>', tipo: 'text/html' },
  'https://www.celler.example/docs/dossier-eventos-2026.pdf': { cuerpo: PDF, tipo: 'application/pdf' },
};
const sinClaude = await importar({ url: 'https://www.celler.example/es/', fetch: red(WEB), lookup: publica });
comprueba('sin clave, importa con reglas y lo dice', sinClaude.metodo === 'reglas');
comprueba('lee la portada, la página de eventos y el dossier', sinClaude.fuentes.length === 3);
comprueba('del dossier saca aforo sentado, comisión y catas',
  sinClaude.datos.aforo_banquete === '120' && sinClaude.datos.comision === '10' && sinClaude.datos.comision_tipo === 'porcentaje'
  && sinClaude.datos.cata_tipos_visita === 'si' && sinClaude.datos.cata_tipos_vinos === 'si' && sinClaude.datos.ofrece_cata === 'si');
comprueba('de la página de eventos, los tipos de evento', sinClaude.datos.eventos_gala === 'si' && sinClaude.datos.eventos_convencion === 'si');
comprueba('una redirección a la red interna se corta',
  await lanza(() => importar({ url: 'https://www.celler.example/x', fetch: red({ 'https://www.celler.example/x': { redirige: 'http://10.0.0.7/' } }), lookup: async h => (h === '10.0.0.7' ? [{ address: h }] : [{ address: '93.184.216.34' }]) })));

/* --- 6 · Con Claude: la petición y la respuesta ------------------------------- */
const peticiones = [];
const claude = (respuesta, extra = {}) => async (url, op) => {
  const u = String(url);
  if (u.startsWith('https://api.anthropic.com/')) {
    peticiones.push({ url: u, op, cuerpo: op?.body && typeof op.body === 'string' ? JSON.parse(op.body) : op?.body });
    if (u.endsWith('/v1/files') && op.method === 'POST') { return Response.json({ id: 'file_123' }); }
    if (/\/v1\/files\//.test(u)) { return Response.json({ id: 'file_123', type: 'file_deleted' }); }
    return Response.json(respuesta, extra);
  }
  return red(WEB)(url, op);
};
const RESPUESTA = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify({
    campos: [
      { campo: 'nombre', valor: 'Celler de Prova', cita: 'p. 1: Celler de Prova' },
      { campo: 'sala1_nombre', valor: 'Sala de barricas', cita: 'p. 1: La sala de barricas' },
      { campo: 'sala1_banquete', valor: '120', cita: 'p. 1: banquetes de hasta 120 personas sentadas' },
      { campo: 'extra1_comision', valor: '10', cita: 'COMISIÓN: 10%' },
      { campo: 'extra2_comision', valor: '4,5', cita: '4,50 € por comensal' },
      { campo: 'extra2_comision_tipo', valor: 'importe', cita: '4,50 € por comensal' },
      { campo: 'autoriza', valor: 'si', cita: 'inventado' },
    ],
    avisos: ['Los precios no dicen si llevan IVA.'],
  }) }],
};
peticiones.length = 0;
const conC = await importar({ url: 'https://www.celler.example/es/', apiKey: 'sk-prueba', fetch: claude(RESPUESTA), lookup: publica });
const pet = peticiones.find(x => x.url.endsWith('/v1/messages'));
comprueba('con clave, lee con Claude', conC.metodo === 'claude' && !!pet);
comprueba('la petición: modelo, salida con esquema y el PDF entero como documento',
  pet.cuerpo.model === 'claude-opus-5-5' && pet.cuerpo.output_config.format.type === 'json_schema'
  && pet.cuerpo.messages[0].content.some(b => b.type === 'document' && b.source.media_type === 'application/pdf')
  && pet.cuerpo.messages[0].content.filter(b => b.type === 'document' && b.source.type === 'text').length === 2);
comprueba('el esquema solo admite nombres de campo importables',
  pet.cuerpo.output_config.format.schema.properties.campos.items.properties.campo.enum.length === definiciones().size
  && !pet.cuerpo.output_config.format.schema.properties.campos.items.properties.campo.enum.includes('autoriza'));
comprueba('cabeceras de la API', pet.op.headers['x-api-key'] === 'sk-prueba' && pet.op.headers['anthropic-version'] === '2023-06-01');
comprueba('lo que devuelve Claude pasa por la lista blanca',
  conC.datos.sala1_banquete === '120' && conC.datos.extra1_comision === '10' && !('autoriza' in conC.datos) && conC.datos.web === 'https://www.celler.example/');
comprueba('una comisión en euros entra con decimales y con su tipo', conC.datos.extra2_comision === '4.5' && conC.datos.extra2_comision_tipo === 'importe');
comprueba('los avisos de Claude llegan al espacio', conC.avisos.includes('Los precios no dicen si llevan IVA.'));

const negado = await importar({ url: 'https://www.celler.example/es/', apiKey: 'sk', fetch: claude({ stop_reason: 'refusal', content: [] }), lookup: publica });
comprueba('si Claude no lee, quedan las reglas y se avisa', negado.metodo === 'reglas' && negado.datos.aforo_banquete === '120' && negado.avisos.some(a => /reglas fijas/.test(a)));
const caido = await importar({ url: 'https://www.celler.example/es/', apiKey: 'sk', fetch: claude({ error: { message: 'overloaded' } }, { status: 529 }), lookup: publica });
comprueba('si la API falla, también', caido.metodo === 'reglas' && caido.avisos.some(a => /529/.test(a)));

peticiones.length = 0;
const grande = Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024, 32)]);
await conClaude({ pdfs: [{ nombre: 'grande.pdf', cuerpo: grande }], apiKey: 'sk', fetch: claude(RESPUESTA) });
await new Promise(res => setTimeout(res, 10));
const msg = peticiones.find(x => x.url.endsWith('/v1/messages'));
comprueba('un PDF de más de 20 MB va por la API de ficheros y se borra después',
  peticiones[0].url.endsWith('/v1/files') && msg.cuerpo.messages[0].content[0].source.file_id === 'file_123'
  && peticiones.some(x => x.url.endsWith('/v1/files/file_123') && x.op.method === 'DELETE'));

/* --- 7 · La función ------------------------------------------------------------- */
const llamar = (cuerpo, cab = {}) => handler(new Request('https://eventspenedes.com/api/importar-catalogo', {
  method: 'POST', headers: { 'content-type': 'application/json', ...cab }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
}));
delete process.env.ANTHROPIC_API_KEY;
comprueba('un GET se rechaza', (await handler(new Request('https://eventspenedes.com/api/importar-catalogo'))).status === 405);
comprueba('desde otra web se rechaza', (await llamar({ url: 'https://x.example' }, { origin: 'https://otra.example' })).status === 403);
comprueba('sin web ni PDF se rechaza', (await llamar({})).status === 400);
comprueba('un cuerpo ilegible se rechaza', (await llamar('{no')).status === 400);
comprueba('un PDF de más de 4 MB se rechaza y dice qué hacer',
  (await (await llamar({ pdf: Buffer.alloc(4.5 * 1024 * 1024).toString('base64') })).json()).error.includes('Drive'));
const resp = await llamar({ pdf: PDF.toString('base64'), nombre: 'dossier.pdf' }, { origin: 'https://eventspenedes.com' });
const j = await resp.json();
comprueba('con un PDF subido devuelve la ficha, sin guardar nada',
  resp.status === 200 && j.ok && j.datos.aforo_banquete === '120' && j.fuentes[0] === 'dossier.pdf' && resp.headers.get('cache-control') === 'no-store');
comprueba('una dirección interna se rechaza en la función', (await llamar({ url: 'http://127.0.0.1/' })).status === 422);

console.log(fallos ? `\n❌ ${fallos} comprobaciones fallan.\n` : '\n✅ La importación solo pone lo que la fuente dice.\n');
process.exit(fallos ? 1 : 0);
