/* =============================================================================
   Prueba de la función que lleva los formularios a Zoho

   Firma un aviso igual que lo firma Netlify y comprueba las dos mitades: que
   un aviso legítimo se convierte en el lead correcto, y que los ilegítimos se
   rechazan. Lo segundo importa más: un endpoint que acepta cualquier cosa
   llena el CRM de basura.

   Uso:  node tools/test-lead.mjs
   ========================================================================== */
import { createHmac, createHash } from 'node:crypto';

process.env.NETLIFY_WEBHOOK_JWS_SECRET = 'secreto-de-prueba-no-usar';
process.env.ZOHO_DRY_RUN = '1';

const { default: handler } = await import('../netlify/functions/lead.mjs');

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');

function firmar(cuerpo, secreto = process.env.NETLIFY_WEBHOOK_JWS_SECRET, alg = 'HS256') {
  const cabecera = b64({ typ: 'JWT', alg });
  const carga = b64({ iss: 'netlify', sha256: createHash('sha256').update(cuerpo, 'utf8').digest('hex') });
  const firma = createHmac('sha256', secreto).update(`${cabecera}.${carga}`).digest('base64url');
  return `${cabecera}.${carga}.${firma}`;
}

const peticion = (cuerpo, firma) => new Request('https://eventspenedes.com/.netlify/functions/lead', {
  method: 'POST',
  headers: firma ? { 'x-webhook-signature': firma, 'content-type': 'application/json' }
                 : { 'content-type': 'application/json' },
  body: cuerpo,
});

const AVISO = JSON.stringify({
  form_name: 'propuesta',
  created_at: '2026-10-03T19:00:00.000Z',
  data: {
    idioma: 'ca', empresa: 'Acme SL', persona: 'Marta Puig',
    correo: 'marta@acme.example', telefono: '+34 600 000 000',
    tipo: 'convencion', pax: '60', fecha: '2026-05-14', fecha_firme: 'aproximada',
    duracion: 'jornada', objetivo: 'Celebrar el cierre de año y que los dos equipos se conozcan.',
    espacio: 'torre-del-gall', exp_castells: 'si', exp_cata_aceite: 'si',
    catering: 'coctel', movilidad: 'microbus', origen_transporte: 'Barcelona, Plaça Catalunya',
    idioma_evento: 'ca', presupuesto_orientativo: '15-40k',
    restricciones: 'Dos celíacos', quien_decide: 'Dirección', cuando_decide: 'Antes de Navidad',
    consentimiento: 'si',
  },
});

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};

console.log('\nPrueba de la función de leads\n');

/* 1 · El camino bueno */
const ok = await handler(peticion(AVISO, firmar(AVISO)));
const cuerpoOk = await ok.json();
comprueba('un aviso bien firmado se acepta', ok.status === 200 && cuerpoOk.ok);
comprueba('el nombre va a Last_Name', cuerpoOk.lead?.Last_Name === 'Marta Puig');
comprueba('la empresa va a Company', cuerpoOk.lead?.Company === 'Acme SL');
comprueba('el correo va a Email', cuerpoOk.lead?.Email === 'marta@acme.example');
comprueba('la ficha lleva el objetivo', /Celebrar el cierre de año/.test(cuerpoOk.lead?.Description || ''));
comprueba('la ficha lleva las experiencias marcadas',
  /Taller de castells, Cata de aceite/.test(cuerpoOk.lead?.Description || ''));
comprueba('la ficha NO inventa las no marcadas',
  !/Gincana/.test(cuerpoOk.lead?.Description || ''));
comprueba('queda constancia del consentimiento con su fecha',
  /Consentimiento .* 2026-10-03/.test(cuerpoOk.lead?.Description || ''));
comprueba('sin ZOHO_CAMPO_MARCA no se inventa el campo',
  !('Marca' in (cuerpoOk.lead || {})));

/* 1b · El formulario de contacto, que tiene otras opciones y menos campos */
const CONTACTO = JSON.stringify({
  form_name: 'contacto',
  created_at: '2026-10-03T21:50:51.363Z',
  data: { idioma: 'es', nombre: 'Álvaro Rodríguez', correo: 'a@example.com',
          telefono: '+34629867715', tipo: 'team-building', fecha: '2026-10-31',
          personas: '45', mensaje: 'tees', consentimiento: 'si' },
});
const c = await (await handler(peticion(CONTACTO, firmar(CONTACTO)))).json();
comprueba('el nombre del formulario corto también llega', c.lead?.Last_Name === 'Álvaro Rodríguez');
comprueba('sin empresa, Company es «Particular» y no el nombre de la persona',
  c.lead?.Company === 'Particular');
comprueba('las opciones del formulario de contacto se traducen',
  /Jornada de equipo \/ team building/.test(c.lead?.Description || ''));

/* Y que «agencia» no signifique lo mismo en los dos formularios */
const AG = JSON.stringify({ form_name: 'agencia', created_at: '2026-10-03T21:00:00.000Z',
  data: { empresa: 'DMC Example', persona: 'Nuria', correo: 'n@example.com', tipo: 'agencia' } });
const a = await (await handler(peticion(AG, firmar(AG)))).json();
comprueba('«agencia» se lee según el formulario del que viene',
  /Tipo de evento: Agencia de eventos/.test(a.lead?.Description || ''));

/* 1c · La propuesta con borrador: el lead tiene que caber en Zoho */
process.env.PROPUESTA_SECRET = 'clave-de-prueba-no-usar-0123456789abcdef';
const LARGA = JSON.stringify({ ...JSON.parse(AVISO),
  data: { ...JSON.parse(AVISO).data, pax: '445', espacio: 'cal-segue' } });
const pb = await (await handler(peticion(LARGA, firmar(LARGA)))).json();
comprueba('con borrador, la descripción cabe en los 2.000 caracteres de Zoho',
  (pb.lead?.Description || '').length <= 2000);
comprueba('el enlace del borrador NO va en la descripción', !/\/p\?d=/.test(pb.lead?.Description || ''));
comprueba('el enlace del borrador va en la nota', /\/p\?d=v1\./.test(pb.nota || ''));

const enorme = JSON.stringify({ ...JSON.parse(AVISO),
  data: { ...JSON.parse(AVISO).data, objetivo: 'x'.repeat(5000) } });
const pe = await (await handler(peticion(enorme, firmar(enorme)))).json();
comprueba('un briefing enorme se recorta en vez de perder el lead',
  pe.lead?.Description.length <= 2000 && /recortado/.test(pe.lead.Description));

/* 1d · Contra Zoho de verdad, con fetch simulado */
delete process.env.ZOHO_DRY_RUN;
const fetchReal = globalThis.fetch;
const llamadas = [];
const simular = upsert => {
  llamadas.length = 0;
  globalThis.fetch = async (url, op) => {
    llamadas.push({ url: String(url), cuerpo: op?.body });
    if (/oauth/.test(url)) { return Response.json({ access_token: 't', expires_in: 3600 }); }
    if (/upsert/.test(url)) { return upsert(); }
    return Response.json({ data: [{ status: 'success', details: { id: 'nota1' } }] }, { status: 201 });
  };
};

simular(() => Response.json({ data: [{ status: 'success', details: { id: '123' } }] }));
const z = await (await handler(peticion(LARGA, firmar(LARGA)))).json();
const aNota = llamadas.find(x => /Leads\/123\/Notes/.test(x.url));
comprueba('con el lead creado, el borrador se cuelga como nota de ESE lead', z.ok && !!aNota);
comprueba('la nota lleva el enlace', /\/p\?d=v1\./.test(aNota?.cuerpo || ''));

simular(() => Response.json({ data: [{ status: 'error', code: 'MAX_LENGTH_EXCEEDED' }] }, { status: 202 }));
const zerr = await (await handler(peticion(LARGA, firmar(LARGA)))).json();
comprueba('un error de Zoho dentro de un 2xx NO se da por bueno',
  zerr.ok === false && /MAX_LENGTH_EXCEEDED/.test(zerr.error));

globalThis.fetch = fetchReal;
process.env.ZOHO_DRY_RUN = '1';
delete process.env.PROPUESTA_SECRET;

/* 2 · Los caminos malos, que son los que de verdad hay que probar */
comprueba('sin firma se rechaza', (await handler(peticion(AVISO, null))).status === 401);
comprueba('con otro secreto se rechaza',
  (await handler(peticion(AVISO, firmar(AVISO, 'otro-secreto')))).status === 401);

/* El cuerpo cambiado después de firmar: la firma sigue siendo válida, pero el
   sha256 ya no cuadra. Es el ataque que una comprobación a medias deja pasar. */
const manipulado = AVISO.replace('marta@acme.example', 'atacante@example.com');
comprueba('el cuerpo manipulado se rechaza',
  (await handler(peticion(manipulado, firmar(AVISO)))).status === 401);

comprueba('alg=none se rechaza',
  (await handler(peticion(AVISO, firmar(AVISO, process.env.NETLIFY_WEBHOOK_JWS_SECRET, 'none')))).status === 401);
comprueba('un GET se rechaza',
  (await handler(new Request('https://x/.netlify/functions/lead'))).status === 405);

/* 3 · Y el caso de un sitio mal configurado */
delete process.env.NETLIFY_WEBHOOK_JWS_SECRET;
comprueba('sin secreto configurado no se acepta nada',
  (await handler(peticion(AVISO, firmar(AVISO, 'secreto-de-prueba-no-usar')))).status === 503);

console.log('');
if (fallos) { console.log(`❌ ${fallos} fallo${fallos > 1 ? 's' : ''}.`); process.exit(1); }
console.log('✅ La función acepta lo legítimo y rechaza lo demás.\n');
