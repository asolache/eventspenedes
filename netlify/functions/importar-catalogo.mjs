/* =============================================================================
   Events Penedès · importar el catálogo de un espacio o un proveedor a su ficha

   El botón «Importar» de /alta-localizacion y /alta-proveedor llama aquí con
   la web o el catálogo en PDF, y esto devuelve los campos de la ficha que
   salen de ahí (ver `netlify/ficha/importar.mjs`). Solo devuelve: no guarda
   nada, no escribe en Zoho y no publica. La ficha vuelve al navegador, el
   espacio la revisa y es su envío el que nos llega, como siempre.

   POST /api/importar-catalogo   JSON { url } o { pdf: base64, nombre }, y
                                 `ficha`: 'localizacion' (por defecto) o 'proveedor'
     → { ok, datos, origen, fuentes, metodo, avisos }

   Variables de entorno (en Netlify, nunca en el repositorio):
     ANTHROPIC_API_KEY   opcional · sin ella se importa con reglas fijas, que
                         sacan menos (dirección, teléfono, aforos con frase
                         clara, servicios con nombre)
     ANTHROPIC_MODEL     opcional · por defecto claude-opus-5-5
     ANTHROPIC_WORKSPACE_ID  opcional · el workspace (wrkspc_…) de una clave
                         que no es de un solo workspace. Sin ella, se usa el
                         de por defecto
     ANTHROPIC_BASE_URL  la pone la AI Gateway de Netlify junto con la clave;
                         ver `netlify/ia/claude.mjs`
     SUPABASE_SECRET_KEY opcional · con ella, cada importación queda anotada
                         en el portal con sus tokens y su coste en dólares

   Leer webs ajenas y gastar tokens desde un formulario público tiene dos
   riesgos, y los dos se acotan aquí: solo direcciones públicas (urlSegura),
   un límite por IP (config.rateLimit) y solo desde la propia página.
   ========================================================================== */
import { importar } from '../ficha/importar.mjs';
import { FICHAS } from '../ficha/fichas.mjs';
import { configurado, anotar } from '../portal/supabase.mjs';

const CABECERAS = { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' };
const responder = (cuerpo, status = 200) => Response.json(cuerpo, { status, headers: CABECERAS });

/* El PDF subido viaja en base64 dentro de un límite de 6 MB por petición */
const MAX_PDF = 4 * 1024 * 1024;

export default async (req) => {
  if (req.method !== 'POST') { return responder({ ok: false, error: 'Solo POST' }, 405); }

  /* Solo desde la propia ficha. El Origin lo pone el navegador y una página
     ajena no lo puede falsear; quien llame sin navegador topa con el límite. */
  const origen = req.headers.get('origin');
  if (origen && new URL(origen).host !== new URL(req.url).host) {
    return responder({ ok: false, error: 'Origen no permitido' }, 403);
  }

  let p;
  try { p = await req.json(); } catch { return responder({ ok: false, error: 'Cuerpo ilegible' }, 400); }
  const url = typeof p.url === 'string' && p.url.trim() ? p.url.trim() : null;
  let pdf = null;
  if (typeof p.pdf === 'string' && p.pdf) {
    pdf = Buffer.from(p.pdf, 'base64');
    if (pdf.length > MAX_PDF) { return responder({ ok: false, error: 'El PDF pesa más de 4 MB: subidlo a Drive o Dropbox y pegad aquí el enlace.' }, 413); }
  }
  if (!url && !pdf) { return responder({ ok: false, error: 'Falta la web o el PDF' }, 400); }
  const ficha = p.ficha === undefined ? 'localizacion' : p.ficha;
  /* El trato de Zoho del pedido para el que un proveedor manda su propuesta:
     así lo que cuesta leerla suma en el coste de ese cliente. Solo un id. */
  const pedido = typeof p.pedido === 'string' && /^\d{10,25}$/.test(p.pedido) ? p.pedido : null;
  if (!Object.hasOwn(FICHAS, ficha)) { return responder({ ok: false, error: 'Ficha desconocida' }, 400); }

  try {
    const r = await importar({
      url, pdf,
      nombrePdf: typeof p.nombre === 'string' ? p.nombre.slice(0, 120) : undefined,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL,
      esquema: FICHAS[ficha],
    });
    /* Al registro, cuántos campos y de dónde; los datos no: pueden llevar
       el móvil de una persona. */
    const { uso, ...resto } = r;
    const usd = uso?.usd ?? null;
    console.log(`importar · ${ficha} · ${r.metodo} · ${Object.keys(r.datos).length} campos · ${r.fuentes.length} fuentes`
      + (uso ? ` · ${uso.modelo} · ${uso.tokens.entrada}+${uso.tokens.salida} tokens · ${usd ?? '?'} USD` : ''));
    /* Lo que ha costado, al portal, para sumarlo. Solo la web de origen, sin
       ruta: una URL de Drive lleva su clave. Si falla, la importación sigue. */
    if (configurado()) {
      let fuente = null;
      try { fuente = url ? new URL(url).host : 'pdf subido'; } catch { fuente = null; }
      await anotar('importaciones', {
        ficha, metodo: r.metodo, modelo: uso?.modelo || null,
        tokens_entrada: uso?.tokens.entrada || 0, tokens_salida: uso?.tokens.salida || 0,
        tokens_cache: uso?.tokens.cache || 0, coste_usd: usd || 0, fuente,
        zoho_modulo: pedido ? 'Deals' : null, zoho_id: pedido,
      }).catch(e => console.error('importar · no se pudo anotar el coste:', e.message));
    }
    return responder({ ok: true, ...resto });
  } catch (e) {
    console.error('importar:', e.message);
    return responder({ ok: false, error: `No se ha podido leer: ${e.message}` }, 422);
  }
};

/* Seis importaciones por minuto y por IP: de sobra para un espacio que
   prueba su web y su PDF, y un tope para quien quiera usarlo de lector. */
export const config = {
  path: '/api/importar-catalogo',
  method: 'POST',
  rateLimit: { windowLimit: 6, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
