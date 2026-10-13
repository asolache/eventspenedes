/* =============================================================================
   Events Penedès · B2Brouter para el tablero interno

   La hermana de `tablero.mjs`, para la facturación. La clave de B2Brouter vive
   aquí, en Netlify, marcada como secreta. El tablero, que corre en el
   ordenador de quien lo usa, pide las facturas a esta función con su propia
   clave y nunca ve la de B2Brouter.

   **Lee, y solo crea borradores.** Contra B2Brouter hay GET de las facturas
   y los contactos de la cuenta configurada, y un único POST: un borrador de
   factura (estado «new»), sin emitir ni enviar. Emitirlo, enviarlo, cambiarlo
   o borrarlo se hace en B2Brouter, a mano. Y el borrador solo se crea en el
   sandbox (clave test_) salvo que `B2BROUTER_ESCRITURA=si` diga lo contrario.

   **Solo con su clave.** Sin `TABLERO_CLAVE` (32 caracteres o más) responde
   503. Con ella, cada petición trae `Authorization: Bearer <clave>`, que se
   compara en tiempo constante. Lo que devuelve son datos de clientes: no se
   cachea en ningún sitio.

   Peticiones:
     GET ?estado=1                       ¿llega a B2Brouter? ¿es el sandbox?
     GET ?ruta=invoices?type=…&limit=…   la lista de facturas de la cuenta
     GET ?ruta=contacts?…                los contactos, para elegir a quién
     POST ?borrador=1                    un borrador de factura:
       { contact_id, fecha?, lineas: [{ concepto, unidades, precio, iva }] }

   Variables de entorno (en Netlify, nunca en el repositorio):
     TABLERO_CLAVE          la clave del tablero, la misma que usa tablero.mjs
     B2BROUTER_API_KEY      Developers → API Keys. Si empieza por test_, es el
                            sandbox: misma URL, sin tocar la cuenta real
     B2BROUTER_CUENTA       el id de la cuenta
     B2BROUTER_API_BASE     por defecto https://api.b2brouter.net
     B2BROUTER_API_VERSION  por defecto 2026-06-26
     B2BROUTER_WEB          por defecto https://app.b2brouter.net (enlaces)
     B2BROUTER_ESCRITURA    «si» para crear borradores fuera del sandbox
   ========================================================================== */
import { createHash, timingSafeEqual } from 'node:crypto';

const CABECERAS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
};
const responder = (cuerpo, estado = 200) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS });

/* Lo único que se puede leer: las facturas y los contactos, siempre de la
   cuenta configurada. La cuenta no la elige quien pregunta. */
const RUTA = /^(invoices|contacts)(\?[A-Za-z0-9_=,&.%-]*)?$/;

const huella = t => createHash('sha256').update(String(t)).digest();
function autorizado(req) {
  const clave = process.env.TABLERO_CLAVE;
  const m = (req.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  return Boolean(m) && timingSafeEqual(huella(m[1]), huella(clave));
}

const api = () => (process.env.B2BROUTER_API_BASE || 'https://api.b2brouter.net').replace(/\/$/, '');
const version = () => process.env.B2BROUTER_API_VERSION || '2026-06-26';
const web = () => (process.env.B2BROUTER_WEB || 'https://app.b2brouter.net').replace(/\/$/, '');
const sandbox = () => String(process.env.B2BROUTER_API_KEY).startsWith('test_');
const escritura = () => sandbox() || /^(si|sí|1|true)$/i.test(String(process.env.B2BROUTER_ESCRITURA ?? '').trim());

const cabeceras = () => ({
  'X-B2B-API-Key': process.env.B2BROUTER_API_KEY,
  'X-B2B-API-Version': version(),
  accept: 'application/json',
});
const cuenta = () => encodeURIComponent(process.env.B2BROUTER_CUENTA);

async function leer(ruta) {
  const [camino, consulta] = ruta.split('?');
  const r = await fetch(`${api()}/accounts/${cuenta()}/${camino}${consulta ? '?' + consulta : ''}`, { headers: cabeceras() });
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
}

/* El borrador, comprobado campo a campo. Solo pasa lo que aquí se nombra:
   ni `send_after_import` ni `issue_after_import`, así que queda en «new». */
const IVAS = new Set([0, 4, 10, 21]);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
function borrador(b) {
  if (!/^\d{1,20}$/.test(String(b?.contact_id ?? ''))) { throw new Error('Falta el contacto (contact_id)'); }
  if (b.fecha != null && !FECHA.test(String(b.fecha))) { throw new Error('Fecha no válida'); }
  const lineas = Array.isArray(b.lineas) ? b.lineas : [];
  if (!lineas.length || lineas.length > 30) { throw new Error('Entre 1 y 30 líneas'); }
  return {
    invoice: {
      type: 'IssuedInvoice',
      contact_id: Number(b.contact_id),
      ...(b.fecha ? { date: b.fecha } : {}),
      currency: 'EUR',
      invoice_lines_attributes: lineas.map((l, i) => {
        const unidades = Number(l?.unidades);
        const precio = Number(l?.precio);
        const iva = Number(l?.iva);
        const concepto = String(l?.concepto ?? '').trim();
        if (!concepto || concepto.length > 500) { throw new Error(`Línea ${i + 1}: falta el concepto`); }
        if (!(unidades > 0) || !Number.isFinite(precio) || precio < 0) { throw new Error(`Línea ${i + 1}: unidades o precio no válidos`); }
        if (!IVAS.has(iva)) { throw new Error(`Línea ${i + 1}: IVA no válido`); }
        return { description: concepto, quantity: unidades, price: precio, taxes_attributes: [{ name: 'IVA', category: 'S', percent: iva }] };
      }),
    },
  };
}

export default async (req) => {
  if (req.method !== 'GET' && req.method !== 'POST') { return responder({ error: 'Método no permitido' }, 405); }
  if ((process.env.TABLERO_CLAVE || '').length < 32) { return responder({ error: 'No configurado' }, 503); }
  if (!autorizado(req)) {
    console.warn('tablero-b2b: petición sin clave válida');
    return responder({ error: 'No autorizado' }, 401);
  }
  if (!process.env.B2BROUTER_API_KEY || !process.env.B2BROUTER_CUENTA) {
    return responder({ error: 'Faltan B2BROUTER_API_KEY y B2BROUTER_CUENTA en Netlify' }, 503);
  }

  const url = new URL(req.url);
  try {
    if (req.method === 'POST') {
      if (!url.searchParams.has('borrador')) { return responder({ error: 'Solo se crean borradores' }, 400); }
      if (!escritura()) { return responder({ error: 'Fuera del sandbox, crear borradores necesita B2BROUTER_ESCRITURA=si en Netlify' }, 403); }
      let cuerpo;
      try { cuerpo = borrador(await req.json()); } catch (e) { return responder({ error: e.message }, 400); }
      const r = await fetch(`${api()}/accounts/${cuenta()}/invoices`, {
        method: 'POST',
        headers: { ...cabeceras(), 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { return responder({ error: j.error ?? j }, r.status); }
      const id = j.invoice?.id ?? j.id ?? null;
      return responder({ ok: true, id, estado: j.invoice?.state ?? j.state ?? null, sandbox: sandbox(), enlace: id ? `${web()}/invoices/${id}` : web() }, 201);
    }

    if (url.searchParams.has('estado')) {
      const r = await leer('invoices?limit=1');
      return responder({ ok: r.estado === 200, sandbox: sandbox(), escritura: escritura(), web: web(), ...(r.estado === 200 ? {} : { error: r.datos }) },
        r.estado === 200 ? 200 : 502);
    }

    const ruta = url.searchParams.get('ruta') || '';
    if (!RUTA.test(ruta)) { return responder({ error: 'Ruta no permitida' }, 400); }
    const r = await leer(ruta);
    return responder(r.datos, r.estado);
  } catch (e) {
    console.error('tablero-b2b:', e.message);
    return responder({ error: e.message }, 502);
  }
};

/* El mismo tope que la lectura de Zoho */
export const config = {
  path: '/api/tablero-b2b',
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
