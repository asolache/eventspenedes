/* =============================================================================
   Events Penedès · las fotos de un evento y el permiso para publicarlas

   El correo de cierre lleva a /fotos/<clave>. La página deja hacer dos cosas,
   independientes entre sí:

   1. Subir fotos. El navegador pide aquí un enlace firmado por foto y la sube
      directamente al cubo privado fotos-evento de Supabase: las fotos de un
      móvil no caben en una función. Solo imágenes, hasta 20 MB y 40 por clave.

   2. Dar el permiso para publicarlas, marcando para qué (web y blog, redes,
      decir el nombre de la empresa). Queda en autorizaciones_fotos con el
      texto exacto que vio, quién lo firma, la hora, la IP resumida y el
      navegador; se puede retirar, y retirar no borra: apunta la hora.

   Como en «Recibido», la clave es la de una persona y no abre nada más que el
   título y el día de su evento. Nada de lo subido se ve desde aquí.

   Variables de entorno: SUPABASE_SECRET_KEY (ver netlify/portal/supabase.mjs)
   ========================================================================== */
import { createHash, randomUUID } from 'node:crypto';
import { configurado, rest, URL_PORTAL } from '../portal/supabase.mjs';
import { pagina, esc, SITIO } from '../portal/pagina.mjs';
import { autorizacion, textosAutorizacion, ALCANCES } from '../portal/cierre.mjs';

const CLAVE = /^[a-f0-9]{32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' };
export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_FOTOS = 40;
const CUBO = 'fotos-evento';
const CABECERAS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'referrer-policy': 'no-referrer',
};

const T = {
  es: { locale: 'es-ES', titulo: 'Tus fotos del evento', subir: 'Sube las fotos', elegir: 'Elegir fotos', enviar: 'Subir', subiendo: 'Subiendo…',
    ok: n => `${n} foto(s) recibida(s). ¡Gracias!`, mal: 'Alguna foto no se ha podido subir. Vuelve a probar o responde al correo con ella.',
    limite: 'Solo imágenes (JPG, PNG, WebP o HEIC) de hasta 20 MB.', sinjs: 'Si no puedes subirlas aquí, responde al correo con las fotos.',
    permiso: '¿Podemos publicarlas?', firmante: 'Tu nombre', empresa: 'Empresa o entidad (si firmas en su nombre)', guardar: 'Guardar el permiso',
    guardado: 'Permiso guardado el', nada: 'Solo uso interno: no se publican.', retirar: 'Retirar el permiso', retirado: 'Permiso retirado. No publicaremos más fotos y quitaremos las publicadas.',
    falta: 'Para publicar, confirma que las personas que salen están de acuerdo.', recibidas: n => `Ya nos has enviado ${n} foto(s).` },
  ca: { locale: 'ca-ES', titulo: "Les teves fotos de l'esdeveniment", subir: 'Puja les fotos', elegir: 'Triar fotos', enviar: 'Pujar', subiendo: 'Pujant…',
    ok: n => `${n} foto(s) rebuda(es). Gràcies!`, mal: "Alguna foto no s'ha pogut pujar. Torna-ho a provar o respon el correu amb la foto.",
    limite: 'Només imatges (JPG, PNG, WebP o HEIC) de fins a 20 MB.', sinjs: 'Si no les pots pujar aquí, respon el correu amb les fotos.',
    permiso: 'Les podem publicar?', firmante: 'El teu nom', empresa: "Empresa o entitat (si signes en nom seu)", guardar: 'Desar el permís',
    guardado: 'Permís desat el', nada: "Només ús intern: no es publiquen.", retirar: 'Retirar el permís', retirado: 'Permís retirat. No publicarem més fotos i traurem les publicades.',
    falta: "Per publicar, confirma que les persones que hi surten hi estan d'acord.", recibidas: n => `Ja ens has enviat ${n} foto(s).` },
  en: { locale: 'en-GB', titulo: 'Your photos from the event', subir: 'Upload your photos', elegir: 'Choose photos', enviar: 'Upload', subiendo: 'Uploading…',
    ok: n => `${n} photo(s) received. Thank you!`, mal: 'Some photos could not be uploaded. Try again or reply to the email with them.',
    limite: 'Images only (JPG, PNG, WebP or HEIC), up to 20 MB.', sinjs: 'If you cannot upload them here, reply to the email with the photos.',
    permiso: 'May we publish them?', firmante: 'Your name', empresa: 'Company or organisation (if signing on its behalf)', guardar: 'Save permission',
    guardado: 'Permission saved on', nada: 'Internal use only: not published.', retirar: 'Withdraw permission', retirado: 'Permission withdrawn. We will not publish more photos and will remove those published.',
    falta: 'To publish, please confirm that the people in the photos agree.', recibidas: n => `You have already sent us ${n} photo(s).` },
};

const sha = s => createHash('sha256').update(String(s)).digest('hex');
const vigente = auts => (auts || []).filter(a => !a.revocada_en).sort((a, b) => b.aceptada_en.localeCompare(a.aceptada_en))[0] || null;

export function paginaFotos(aviso, clave, { aviso: mensaje = null } = {}) {
  const idioma = T[aviso.evento_interesados?.idioma] ? aviso.evento_interesados.idioma : 'es';
  const t = T[idioma];
  const a = textosAutorizacion(idioma);
  const ev = aviso.eventos_cliente || {};
  const dia = ev.fecha ? new Date(`${ev.fecha}T12:00:00Z`).toLocaleDateString(t.locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }) : '';
  const actual = vigente(aviso.autorizaciones_fotos);
  const subidas = (aviso.fotos_evento || []).filter(f => f.subida_en).length;
  const nombre = aviso.evento_interesados?.nombre || '';
  const marca = (k, txt, req = false) => `<label style="display:flex;gap:.6rem;align-items:flex-start;margin:.4rem 0"><input type="checkbox" name="${k}" value="si"${req ? ' data-personas' : ''} style="margin-top:.3rem"> <span>${esc(txt)}</span></label>`;
  const permiso = actual
    ? `<p class="lead">${esc(t.guardado)} ${esc(new Date(actual.aceptada_en).toLocaleString(t.locale, { timeZone: 'Europe/Madrid', dateStyle: 'long', timeStyle: 'short' }))}.</p>
  <pre style="white-space:pre-wrap;font:inherit;font-size:.9rem" class="card">${esc(actual.texto)}</pre>
  <form method="post" action="/fotos/${clave}"><input type="hidden" name="accion" value="retirar"><button class="btn btn--ghost" type="submit">${esc(t.retirar)}</button></form>`
    : `<form method="post" action="/fotos/${clave}" class="form" id="permiso">
  <input type="hidden" name="accion" value="autorizar">
  <p>${esc(a.intro('', ev.titulo || ''))}</p>
  ${ALCANCES.map(k => marca(k, a[k])).join('\n  ')}
  ${marca('personas', a.personas, true)}
  <p class="form__note">${esc(a.nada)} ${esc(a.retirar)}</p>
  <div class="field"><label for="firmante">${esc(t.firmante)}</label><input id="firmante" name="firmante" required minlength="2" maxlength="120" value="${esc(nombre)}" autocomplete="name"></div>
  <div class="field"><label for="empresa">${esc(t.empresa)}</label><input id="empresa" name="empresa" maxlength="160" autocomplete="organization"></div>
  <p><button class="btn btn--primary" type="submit">${esc(t.guardar)}</button></p>
</form>`;

  const cuerpo = `<section class="section"><div class="wrap" style="max-width:40rem">
  <p class="eyebrow">${esc(dia)}</p>
  <h1>${esc(ev.titulo || 'Events Penedès')}</h1>
  ${mensaje ? `<p class="lead" role="status">${esc(mensaje)}</p>` : ''}
  <h2>${esc(t.subir)}</h2>
  ${subidas ? `<p>${esc(t.recibidas(subidas))}</p>` : ''}
  <form id="subida" class="form" hidden>
    <div class="field"><label for="archivos">${esc(t.elegir)}</label><input id="archivos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple></div>
    <p class="form__note">${esc(t.limite)}</p>
    <p><button class="btn btn--primary" type="submit">${esc(t.enviar)}</button></p>
    <p id="estado" role="status" aria-live="polite"></p>
  </form>
  <noscript><p>${esc(t.sinjs)}</p></noscript>
  <h2>${esc(t.permiso)}</h2>
  ${permiso}
</div></section>
<script>
(() => {
  const f = document.getElementById('subida'); f.hidden = false;
  const estado = document.getElementById('estado');
  const TIPOS = ${JSON.stringify(Object.keys(TIPOS))}, MAX = ${MAX_BYTES};
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const fotos = [...document.getElementById('archivos').files].filter(x => TIPOS.includes(x.type) && x.size <= MAX);
    if (!fotos.length) { estado.textContent = ${JSON.stringify(t.limite)}; return; }
    let bien = 0, mal = 0;
    for (const x of fotos) {
      estado.textContent = ${JSON.stringify(t.subiendo)} + ' ' + (bien + mal + 1) + '/' + fotos.length;
      try {
        const r = await fetch(location.pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'subir', nombre: x.name, tipo: x.type, bytes: x.size }) });
        const j = await r.json(); if (!r.ok) throw 0;
        const s = await fetch(j.url, { method: 'PUT', headers: { 'content-type': x.type }, body: x }); if (!s.ok) throw 0;
        await fetch(location.pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'subida', id: j.id }) });
        bien++;
      } catch { mal++; }
    }
    estado.textContent = (bien ? ${JSON.stringify(t.ok('§'))}.replace('§', bien) : '') + (mal ? ' ' + ${JSON.stringify(t.mal)} : '');
  });
  const p = document.getElementById('permiso');
  if (p) p.addEventListener('submit', e => {
    const algo = ['web', 'redes', 'nombre'].some(k => p.elements[k].checked);
    if (algo && !p.elements.personas.checked) { e.preventDefault(); alert(${JSON.stringify(t.falta)}); }
  });
})();
</script>`;
  return pagina({ titulo: `${ev.titulo || 'Fotos'} · Events Penedès`, descripcion: t.titulo, canonica: SITIO, estructurados: [], cuerpo, indexar: false });
}

/* Lo que llega del formulario del permiso → la fila que se guarda */
export function filaAutorizacion(aviso, campos, { ip, navegador } = {}) {
  const idioma = T[aviso.evento_interesados?.idioma] ? aviso.evento_interesados.idioma : 'es';
  const firmante = String(campos.firmante || '').trim().slice(0, 120);
  const enNombreDe = String(campos.empresa || '').trim().slice(0, 160) || null;
  const alcance = ALCANCES.filter(k => campos[k] === 'si');
  const personas = campos.personas === 'si';
  if (firmante.length < 2) { return { error: 'firmante' }; }
  if (alcance.length && !personas) { return { error: 'personas' }; }
  const { version, texto } = autorizacion({ idioma, titulo: aviso.eventos_cliente?.titulo || '', enNombreDe, alcance, personas });
  return { fila: {
    evento_id: aviso.evento_id, aviso_id: aviso.id, firmante, en_nombre_de: enNombreDe, alcance, personas_de_acuerdo: personas,
    version, texto, texto_sha256: sha(texto), idioma, ip_sha256: ip ? sha(`${aviso.evento_id}:${ip}`) : null,
    navegador: navegador ? String(navegador).slice(0, 300) : null, via: 'web',
  } };
}

/* Una foto que se va a subir: dónde va y si cabe */
export function rutaFoto(aviso, { tipo, bytes }) {
  const ext = TIPOS[tipo];
  if (!ext || !Number.isInteger(bytes) || bytes < 1 || bytes > MAX_BYTES) { return null; }
  return `${aviso.evento_id}/${aviso.id}/${randomUUID()}.${ext}`;
}

async function firmarSubida(ruta, { fetch = globalThis.fetch } = {}) {
  const base = (process.env.SUPABASE_URL || URL_PORTAL).replace(/\/$/, '');
  const clave = process.env.SUPABASE_SECRET_KEY;
  const h = { apikey: clave, 'content-type': 'application/json' };
  if (clave.startsWith('eyJ')) { h.Authorization = `Bearer ${clave}`; }
  const r = await fetch(`${base}/storage/v1/object/upload/sign/${CUBO}/${ruta}`, { method: 'POST', headers: h, body: '{}', signal: AbortSignal.timeout(8000) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j?.url) { throw new Error(`Supabase storage ${r.status}`); }
  return `${base}/storage/v1${j.url}`;
}

const nada = () => new Response('No encontrado', { status: 404, headers: { ...CABECERAS, 'content-type': 'text/plain; charset=utf-8' } });
const json = (o, status = 200) => Response.json(o, { status, headers: { 'cache-control': 'no-store' } });
const CAMPOS = 'select=id,evento_id,tipo,evento_interesados(nombre,idioma),eventos_cliente(titulo,fecha),autorizaciones_fotos(id,texto,aceptada_en,revocada_en),fotos_evento(id,subida_en)';

export default async (req, context = {}) => {
  if (!['GET', 'HEAD', 'POST'].includes(req.method)) { return new Response('Solo GET o POST', { status: 405 }); }
  if (!configurado()) { return nada(); }
  const clave = new URL(req.url).pathname.replace(/\/+$/, '').split('/')[2] || '';
  if (!CLAVE.test(clave)) { return nada(); }
  try {
    const [aviso] = await rest(`avisos_evento?clave=eq.${clave}&tipo=eq.cierre&${CAMPOS}`) || [];
    if (!aviso) { return nada(); }
    const t = T[aviso.evento_interesados?.idioma] || T.es;
    if (req.method !== 'POST') { return new Response(paginaFotos(aviso, clave), { headers: CABECERAS }); }

    if ((req.headers.get('content-type') || '').includes('application/json')) {
      const b = await req.json().catch(() => ({}));
      if (b.accion === 'subir') {
        if ((aviso.fotos_evento || []).length >= MAX_FOTOS) { return json({ error: 'limite' }, 429); }
        const tipo = String(b.tipo || ''), bytes = Number(b.bytes);
        const ruta = rutaFoto(aviso, { tipo, bytes });
        if (!ruta) { return json({ error: 'foto' }, 400); }
        const url = await firmarSubida(ruta);
        const [fila] = await rest('fotos_evento', { method: 'POST', prefer: 'return=representation',
          body: { evento_id: aviso.evento_id, aviso_id: aviso.id, ruta, tipo, bytes, nombre_original: String(b.nombre || '').slice(0, 200) || null } });
        return json({ id: fila.id, url });
      }
      if (b.accion === 'subida' && UUID.test(String(b.id || ''))) {
        await rest(`fotos_evento?id=eq.${b.id}&aviso_id=eq.${aviso.id}&subida_en=is.null`, { method: 'PATCH', body: { subida_en: new Date().toISOString() } });
        return json({ ok: true });
      }
      return json({ error: 'accion' }, 400);
    }

    const campos = Object.fromEntries(new URLSearchParams(await req.text()));
    let mensaje = null;
    if (campos.accion === 'autorizar') {
      if (vigente(aviso.autorizaciones_fotos)) { return Response.redirect(new URL(`/fotos/${clave}`, req.url), 303); }
      const { fila, error } = filaAutorizacion(aviso, campos, { ip: context.ip, navegador: req.headers.get('user-agent') });
      if (error) { mensaje = error === 'personas' ? t.falta : t.firmante; } else { await rest('autorizaciones_fotos', { method: 'POST', body: fila, prefer: 'return=minimal' }); }
    } else if (campos.accion === 'retirar') {
      await rest(`autorizaciones_fotos?aviso_id=eq.${aviso.id}&revocada_en=is.null`, { method: 'PATCH', body: { revocada_en: new Date().toISOString() } });
      mensaje = t.retirado;
    }
    const [nuevo] = await rest(`avisos_evento?clave=eq.${clave}&tipo=eq.cierre&${CAMPOS}`) || [];
    return new Response(paginaFotos(nuevo || aviso, clave, { aviso: mensaje }), { headers: CABECERAS });
  } catch (e) {
    console.error('fotos:', e.message);
    return new Response('No disponible ahora mismo', { status: 503, headers: { 'retry-after': '60', 'content-type': 'text/plain; charset=utf-8' } });
  }
};

export const config = {
  path: ['/fotos/*'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
