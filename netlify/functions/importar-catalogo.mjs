/* =============================================================================
   Events Penedès · importar el catálogo de un espacio a su ficha

   El botón «Importar» de /alta-localizacion llama aquí con la web del espacio
   o su catálogo en PDF, y esto devuelve los campos de la ficha que salen de
   ahí (ver `netlify/localizacion/importar.mjs`). Solo devuelve: no guarda
   nada, no escribe en Zoho y no publica. La ficha vuelve al navegador, el
   espacio la revisa y es su envío el que nos llega, como siempre.

   POST /api/importar-catalogo   JSON { url } o { pdf: base64, nombre }
     → { ok, datos, origen, fuentes, metodo, avisos }

   Variables de entorno (en Netlify, nunca en el repositorio):
     ANTHROPIC_API_KEY   opcional · sin ella se importa con reglas fijas, que
                         sacan menos (dirección, teléfono, aforos con frase
                         clara, servicios con nombre)
     ANTHROPIC_MODEL     opcional · por defecto claude-opus-5-5

   Leer webs ajenas y gastar tokens desde un formulario público tiene dos
   riesgos, y los dos se acotan aquí: solo direcciones públicas (urlSegura),
   un límite por IP (config.rateLimit) y solo desde la propia página.
   ========================================================================== */
import { importar } from '../localizacion/importar.mjs';

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

  try {
    const r = await importar({
      url, pdf,
      nombrePdf: typeof p.nombre === 'string' ? p.nombre.slice(0, 120) : undefined,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL,
    });
    /* Al registro, cuántos campos y de dónde; los datos no: pueden llevar
       el móvil de una persona. */
    console.log(`importar · ${r.metodo} · ${Object.keys(r.datos).length} campos · ${r.fuentes.length} fuentes`);
    return responder({ ok: true, ...r });
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
