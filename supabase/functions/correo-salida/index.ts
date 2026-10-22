// Envía un correo de public.correos_salida cuando pasa a «aprobado».
// La llama el disparador correo_aprobado con el id; se puede llamar de nuevo
// sin riesgo: solo envía la fila que sigue «aprobado», y la marca «enviando»
// antes de hablar con Resend para que no salga dos veces.
//
// Secretos (Supabase → Edge Functions → Secrets): RESEND_API_KEY, y
// CORREO_REMITENTE si el remitente no es el de resend.js.
import { errores, peticion } from './resend.js';

const URL_DB = Deno.env.get('SUPABASE_URL')!;
const SERVICIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = (ruta: string, init: RequestInit = {}) => fetch(`${URL_DB}/rest/v1/${ruta}`, {
  ...init,
  headers: { apikey: SERVICIO, Authorization: `Bearer ${SERVICIO}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
});
const marcar = (id: string, cambios: Record<string, unknown>) =>
  db(`correos_salida?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(cambios) });

Deno.serve(async (req) => {
  const { id } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/.test(id || '')) { return Response.json({ ok: false, error: 'sin id' }, { status: 400 }); }
  const r = await db(`correos_salida?id=eq.${id}&estado=eq.aprobado`, { method: 'PATCH', body: JSON.stringify({ estado: 'enviando' }) });
  const [fila] = await r.json();
  if (!fila) { return Response.json({ ok: true, nada: 'no está aprobado' }); }

  const fallos = errores(fila);
  const clave = Deno.env.get('RESEND_API_KEY');
  if (!clave) { fallos.push('falta RESEND_API_KEY en los secretos de la función'); }
  if (fallos.length) {
    await marcar(id, { estado: 'error', error: fallos.join(' · ') });
    return Response.json({ ok: false, fallos });
  }
  const remitente = Deno.env.get('CORREO_REMITENTE') || undefined;
  const envio = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(peticion(fila, remitente ? { remitente } : {})),
  });
  const j = await envio.json().catch(() => ({}));
  if (!envio.ok) {
    await marcar(id, { estado: 'error', error: `Resend ${envio.status}: ${j.message || 'sin detalle'}` });
    return Response.json({ ok: false, error: j.message });
  }
  await marcar(id, { estado: 'enviado', resend_id: j.id, enviado_en: new Date().toISOString(), error: null });
  return Response.json({ ok: true, resend_id: j.id });
});
