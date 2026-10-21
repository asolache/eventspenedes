/* =============================================================================
   Prueba de la respuesta preparada a cada petición de la web

   Lo que importa: que salga siempre (con Claude o con la plantilla), en el
   idioma de quien escribe, con el siguiente paso; que Claude no vea su correo,
   su teléfono ni sus restricciones; que un importe o un enlace ajeno queden
   avisados, que por la pasarela de Netlify no se pida nada que vaya detrás
   de una cabecera beta, y que una clave que no es de un solo workspace
   funcione.

   Uso:  node tools/test-respuesta.mjs
   ========================================================================== */
import { preparar, revisar, quienEs, enlaces, notaTexto, tarea, AGENDA, GUIA, FORMULARIOS, TITULO_NOTA } from '../netlify/respuesta/respuesta.mjs';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};

console.log('\nPrueba de la respuesta preparada\n');

const CUANDO = '2026-10-03T19:00:00.000Z';   // sábado: la llamada, el lunes
const MARTA = { idioma: 'ca', persona: 'Marta Puig', empresa: 'Acme SL', correo: 'marta@acme.example',
  telefono: '+34 600 000 000', pax: '60', fecha: '2026-05-14' };

/* 1 · Sin clave: la plantilla, en su idioma y con el siguiente paso */
for (const form of FORMULARIOS) {
  for (const idioma of ['es', 'ca', 'en']) {
    const r = await preparar({ form, d: { ...MARTA, idioma }, cuando: CUANDO });
    const ok = r.modo === 'plantilla' && r.asunto && r.cuerpo.includes('Álvaro Solache')
      && (form === 'red' ? r.cuerpo.includes('/alta-proveedor') : r.cuerpo.includes(AGENDA))
      && !revisar(r).length;
    comprueba(`${form} · ${idioma}: sale de la plantilla, firmada, con el siguiente paso y sin nada que avisar`, ok);
  }
}
const ca = await preparar({ form: 'propuesta', d: MARTA, cuando: CUANDO });
comprueba('en catalán, con su nombre, sus personas y su fecha',
  /^Hola, Marta,/.test(ca.cuerpo) && /60 persones, 14 de maig/.test(ca.cuerpo));
const red = await preparar({ form: 'red', d: { perfil: 'localizacion', empresa: 'Celler' }, cuando: CUANDO });
comprueba('un espacio que quiere entrar va a la ficha de localización', red.cuerpo.includes('/alta-localizacion') && /^Hola:/.test(red.cuerpo));
const msg = await preparar({ form: 'contacto', d: { nombre: 'Ana', correo: 'ana@example.com', mensaje: '¿Hacéis bodas?' }, cuando: CUANDO });
comprueba('la plantilla no contesta lo que preguntan: lo deja pendiente', msg.pendiente.some(p => p.includes('¿Hacéis bodas?')));
comprueba('una agencia: recuerda adjuntar el catálogo', (await preparar({ form: 'agencia', d: MARTA, cuando: CUANDO })).avisos.some(a => /catálogo para agencias/.test(a)));

/* 2 · Los enlaces: Gmail escrito, el correo y la llamada */
const e = ca.enlaces;
comprueba('Gmail se abre con el destinatario, el asunto y el texto',
  e.gmail.startsWith('https://mail.google.com/mail/?view=cm') && e.gmail.includes('to=marta%40acme.example')
  && e.gmail.includes(`su=${encodeURIComponent(ca.asunto)}`) && e.gmail.includes(`body=${encodeURIComponent(ca.cuerpo)}`));
comprueba('el mailto lleva lo mismo', e.correo.startsWith('mailto:marta@acme.example?subject='));
comprueba('la llamada, el siguiente día laborable a las 10:00 en Madrid, con su correo de invitado',
  /dates=20261005T100000%2F20261005T102000/.test(e.calendario) && /ctz=Europe%2FMadrid/.test(e.calendario) && /add=marta%40acme\.example/.test(e.calendario));
const colado = quienEs({ correo: 'a@b.example?bcc=espia@otro.example' });
comprueba('un correo que intenta colar destinatarios no entra en los enlaces', colado.correo === '' && colado.correoMalo);
const sinCorreo = await preparar({ form: 'contacto', d: { correo: 'x?bcc=y@z.example' }, cuando: CUANDO });
comprueba('y la nota lo avisa', sinCorreo.avisos.some(a => /no parece válido/.test(a)) && !sinCorreo.enlaces.gmail.includes('bcc'));

/* 3 · La nota y la tarea de Zoho */
const nota = notaTexto(ca);
comprueba('la nota dice cómo se escribió, que no se ha enviado y trae los tres enlaces',
  /plantilla fija, en catalán/.test(nota) && /No se ha enviado nada/.test(nota)
  && nota.includes(e.gmail) && nota.includes(e.correo) && nota.includes(e.calendario) && nota.endsWith(ca.cuerpo));
const t = tarea(ca, CUANDO);
comprueba('la tarea: responder hoy, con prioridad, y dónde está el texto',
  t.Subject.startsWith('Responder a Marta Puig (Acme SL)') && t.Due_Date === '2026-10-03' && t.Priority === 'High' && t.Description.includes(TITULO_NOTA));

/* 4 · La revisión: importes y enlaces ajenos */
comprueba('un importe se avisa', revisar({ asunto: 'x', cuerpo: 'Desde 45 € por persona' }).some(a => /importe/.test(a)));
comprueba('en cualquier forma', revisar({ asunto: 'x', cuerpo: 'unos 1.200 euros' }).length === 1 && revisar({ asunto: 'x', cuerpo: '€90' }).length === 1);
comprueba('un enlace ajeno se avisa; los nuestros no',
  revisar({ asunto: 'x', cuerpo: `Mira https://otra.example/x y ${AGENDA} y https://eventspenedes.com/espacios.` }).join().includes('https://otra.example/x')
  && !revisar({ asunto: 'x', cuerpo: `${AGENDA} · https://eventspenedes.com/kit-agencias.` }).length);
comprueba('un dominio que solo empieza como el nuestro es ajeno', revisar({ asunto: 'x', cuerpo: 'https://eventspenedes.com.otra.example' }).length === 1);

/* 5 · Con Claude: lo que ve, lo que se pide y lo que cuesta */
const peticiones = [];
const claude = (salida, extra = {}) => async (url, op) => {
  peticiones.push({ url: String(url), op, cuerpo: JSON.parse(op.body) });
  return Response.json(salida, extra);
};
const ESCRITA = { model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 1500, output_tokens: 300 },
  content: [{ type: 'text', text: JSON.stringify({ asunto: 'La vostra jornada al Penedès', cuerpo: `Hola, Marta,\n\nGràcies...\n\n${AGENDA}\n\nÁlvaro Solache · Events Penedès`, pendiente: ['Pregunta si hi ha pàrquing per a autocars'] }) }] };
const PETICION = 'Nombre: Marta\nEmpresa: Acme SL\nPersonas: 60\nMensaje: ¿Hay parking para autocares?';

delete process.env.ANTHROPIC_BASE_URL;
peticiones.length = 0;
const cl = await preparar({ form: 'propuesta', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'sk-prueba', fetch: claude(ESCRITA) });
const p = peticiones[0];
comprueba('con clave la escribe Claude, con lo que deja pendiente', cl.modo === 'claude' && cl.asunto === 'La vostra jornada al Penedès' && cl.pendiente.length === 1);
comprueba('y se sabe lo que ha costado', cl.uso?.modelo === 'claude-opus-5-5' && cl.uso.usd === 0.012);
comprueba('la petición: el modelo por defecto, salida con esquema y esfuerzo bajo',
  p.url === 'https://api.anthropic.com/v1/messages' && p.cuerpo.model === 'claude-opus-5-5'
  && p.cuerpo.output_config.format.type === 'json_schema' && p.cuerpo.output_config.effort === 'low');
comprueba('las instrucciones: su idioma, el siguiente paso y lo que nunca se dice',
  p.cuerpo.system.includes('Escribe en catalán') && p.cuerpo.system.includes(AGENDA) && /precios, importes/.test(p.cuerpo.system));
comprueba('Claude lee lo que se pidió y nada más', p.cuerpo.messages[0].content.includes(PETICION)
  && !/marta@acme|600 000 000/.test(JSON.stringify(p.cuerpo)));
comprueba('directo a la API: con el modelo de reserva y su cabecera',
  p.cuerpo.fallbacks === 'default' && p.op.headers['anthropic-beta'] === 'server-side-fallback-2026-07-01' && p.op.headers['x-api-key'] === 'sk-prueba');

process.env.ANTHROPIC_BASE_URL = 'https://pasarela.example/anthropic/';
peticiones.length = 0;
await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'nfy-prueba', fetch: claude(ESCRITA) });
comprueba('por la pasarela de Netlify: a su dirección, sin campos ni cabeceras beta',
  peticiones[0].url === 'https://pasarela.example/anthropic/v1/messages' && !('fallbacks' in peticiones[0].cuerpo)
  && !('anthropic-beta' in peticiones[0].op.headers));
delete process.env.ANTHROPIC_BASE_URL;

const conPrecio = { ...ESCRITA, content: [{ type: 'text', text: JSON.stringify({ asunto: 'Hola', cuerpo: 'Sale a 45 € por persona. Mira https://otra.example', pendiente: [] }) }] };
const av = await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, apiKey: 'sk', fetch: claude(conPrecio) });
comprueba('si Claude pone un importe o un enlace ajeno, la nota lo avisa', av.modo === 'claude'
  && av.avisos.some(a => /importe/.test(a)) && av.avisos.some(a => /otra\.example/.test(a)));

const caida = await preparar({ form: 'propuesta', d: MARTA, cuando: CUANDO, apiKey: 'sk', fetch: claude({ error: { message: 'overloaded' } }, { status: 529 }) });
comprueba('si la API falla, sale la plantilla y se dice por qué', caida.modo === 'plantilla' && /^Hola, Marta,/.test(caida.cuerpo)
  && caida.avisos.some(a => /529/.test(a)) && caida.uso === null);
const vacia = await preparar({ form: 'propuesta', d: MARTA, cuando: CUANDO, apiKey: 'sk',
  fetch: claude({ ...ESCRITA, content: [{ type: 'text', text: JSON.stringify({ asunto: '', cuerpo: '', pendiente: [] }) }] }) });
comprueba('una respuesta vacía no se da por buena', vacia.modo === 'plantilla');

/* 6 · Una clave que no es de un solo workspace pide decir en cuál actúa: se
   busca el de por defecto de la organización, una vez, y se repite */
const SIN_WORKSPACE = { type: 'error', error: { type: 'invalid_request_error',
  message: 'This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header.' } };
const organizacion = lista => {
  const vistas = [];
  return { vistas, fetch: async (url, op) => {
    const u = new URL(String(url));
    vistas.push({ ruta: u.pathname, ws: op.headers['anthropic-workspace-id'] ?? null });
    if (u.pathname === '/v1/organizations/workspaces') { return lista(u.searchParams.get('include_default') === 'true'); }
    return op.headers['anthropic-workspace-id'] ? Response.json(ESCRITA) : Response.json(SIN_WORKSPACE, { status: 400 });
  } };
};
const LISTA = conDefecto => Response.json({ data: [...(conDefecto ? [{ id: 'wrkspc_defecto' }] : []), { id: 'wrkspc_otro' }], has_more: false });
const listados = vs => vs.filter(v => v.ruta === '/v1/organizations/workspaces').length;

const llamadas400 = [];
const malPedida = await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'sk', fetch: async url => {
  llamadas400.push(String(url));
  return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: 'max_tokens: too large' } }, { status: 400 });
} });
comprueba('otro 400 no busca workspace ni repite: sale la plantilla', malPedida.modo === 'plantilla' && llamadas400.length === 1);
const sinPermiso = organizacion(() => Response.json({ error: { message: 'forbidden' } }, { status: 403 }));
const sp = await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'sk-persona', fetch: sinPermiso.fetch });
comprueba('si no se puede buscar el workspace, sale la plantilla y la nota dice qué poner',
  sp.modo === 'plantilla' && sp.avisos.some(a => /ANTHROPIC_WORKSPACE_ID/.test(a) && /403/.test(a)));
const org = organizacion(LISTA);
const ws = await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'sk-persona', fetch: org.fetch });
const enviadas = org.vistas.filter(v => v.ruta === '/v1/messages');
comprueba('se busca el workspace por defecto y la petición se repite con él',
  ws.modo === 'claude' && listados(org.vistas) === 2 && enviadas.length === 2 && enviadas[0].ws === null && enviadas[1].ws === 'wrkspc_defecto');
org.vistas.length = 0;
await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'sk-persona', fetch: org.fetch });
comprueba('y no se vuelve a buscar: la siguiente lo lleva a la primera', org.vistas.length === 1 && org.vistas[0].ws === 'wrkspc_defecto');
process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_elegido';
org.vistas.length = 0;
await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'sk-persona', fetch: org.fetch });
comprueba('ANTHROPIC_WORKSPACE_ID manda', org.vistas.length === 1 && org.vistas[0].ws === 'wrkspc_elegido');
process.env.ANTHROPIC_BASE_URL = 'https://pasarela.example/anthropic/';
const pasarela = organizacion(LISTA);
await preparar({ form: 'contacto', d: MARTA, cuando: CUANDO, peticion: PETICION, apiKey: 'nfy-prueba', fetch: pasarela.fetch });
comprueba('por la pasarela de Netlify ni va workspace ni se busca: la clave es suya',
  pasarela.vistas.length === 1 && pasarela.vistas[0].ws === null);
delete process.env.ANTHROPIC_BASE_URL;
delete process.env.ANTHROPIC_WORKSPACE_ID;

/* 7 · Las instrucciones son públicas: no traen nada que no pueda leer cualquiera */
const guia = GUIA({ idioma: 'castellano', siguiente: 'x' });
comprueba('las instrucciones no llevan importes ni enlaces', !revisar({ asunto: '', cuerpo: guia }).length);

/* 8 · El enlace de seguimiento del cliente va en la respuesta a una propuesta */
const SEG = 'https://eventspenedes.com/seguimiento/2026-05-14-acme-123456/' + 'a'.repeat(32);
for (const idioma of ['es', 'ca', 'en']) {
  const r = await preparar({ form: 'propuesta', d: { ...MARTA, idioma }, cuando: CUANDO, seguimiento: SEG });
  comprueba(`propuesta (${idioma}): la plantilla lleva el enlace de seguimiento y no lo avisa como ajeno`,
    r.cuerpo.includes(SEG) && !r.avisos.some(a => a.includes('seguimiento') || a.includes('no son nuestros')));
}
const sinSeg = await preparar({ form: 'propuesta', d: MARTA, cuando: CUANDO });
comprueba('sin seguimiento, la respuesta sale igual y sin enlace roto', !/seguimiento\//.test(sinSeg.cuerpo));

console.log('');
if (fallos) { console.log(`❌ ${fallos} fallo${fallos > 1 ? 's' : ''}.`); process.exit(1); }
console.log('✅ La respuesta sale siempre, en su idioma, sin enviarse y sin lo que no toca.\n');
