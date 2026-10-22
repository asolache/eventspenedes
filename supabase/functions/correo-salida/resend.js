/* La petición a Resend de un correo de public.correos_salida. Sin Deno ni
   Node: lo usa la función (index.ts) y lo prueba tools/test-correo-salida.mjs.

   Lo que no depende de quien escribe la fila: Álvaro va siempre en CCO y las
   respuestas le llegan a él; un enlace google.com/url es un error (es lo que
   este envío viene a evitar). */
export const ALVARO = 'asolache@gmail.com';
export const REMITENTE = 'Álvaro Solache · Events Penedès <alvaro@eventspenedes.com>';
const CORREO = /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i;

export function errores(f) {
  const fallos = [];
  if (f.estado !== 'enviando') { fallos.push(`estado «${f.estado}»: solo se envía lo aprobado`); }
  for (const c of [...(f.para || []), ...(f.cco || [])]) { if (!CORREO.test(c)) { fallos.push(`«${c}» no es un correo`); } }
  if (!(f.para || []).length) { fallos.push('sin destinatario'); }
  if (/google\.[a-z.]+\/url\?/i.test(`${f.html} ${f.texto}`)) { fallos.push('lleva un enlace envuelto en google.com/url: pon el directo'); }
  if (!String(f.asunto || '').trim() || !String(f.html || '').trim() || !String(f.texto || '').trim()) { fallos.push('falta asunto, html o texto'); }
  return fallos;
}

export function peticion(f, { remitente = REMITENTE } = {}) {
  const cco = [...new Set([...(f.cco || []), ALVARO].map(c => c.toLowerCase()))];
  const p = { from: remitente, to: f.para, bcc: cco, reply_to: ALVARO, subject: f.asunto, html: f.html, text: f.texto };
  if (f.responder_a) { p.headers = { 'In-Reply-To': f.responder_a, References: f.responder_a }; }
  return p;
}
