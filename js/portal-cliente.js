/* =============================================================================
   Events Penedès — el cliente del portal de partners (Supabase)

   La URL y la clave publicable son públicas a propósito: quien entra solo ve y
   toca lo suyo porque la base de datos lo comprueba fila a fila (ver
   supabase/migrations). La clave secreta no sale nunca del servidor.
   ========================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const URL_PORTAL = 'https://kigjhtnwfhbujsotrqiu.supabase.co';
export const CLAVE_PUBLICA = 'sb_publishable_7YCxw7z4HnU7eGy8HoW7Wg_iS8at7XR';

export const sb = createClient(URL_PORTAL, CLAVE_PUBLICA, {
  auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
});

/* Lo que el partner tiene ahora: lo último que ha enviado (si está pendiente)
   o, si no, lo publicado. Es la base de cualquier cambio nuevo. */
export async function datosActuales(partnerId) {
  const [{ data: pend }, { data: pub }] = await Promise.all([
    sb.from('cambios_ficha').select('datos,creado_en').eq('partner_id', partnerId).eq('estado', 'pendiente')
      .order('creado_en', { ascending: false }).limit(1),
    sb.from('fichas').select('datos,version,actualizada_en').eq('partner_id', partnerId).maybeSingle(),
  ]);
  return { pendiente: pend?.[0]?.datos || null, publicada: pub?.datos || null, version: pub?.version || 0, fecha: pub?.actualizada_en || null };
}

export async function proponer(partnerId, datos) {
  const { error } = await sb.from('cambios_ficha').insert({ partner_id: partnerId, datos });
  if (error) { throw new Error(error.message); }
}
