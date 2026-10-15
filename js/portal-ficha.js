/* =============================================================================
   Events Penedès — la ficha abierta desde el portal de partners

   Cuando un partner edita su ficha desde /acceso, el envío llega como siempre
   (a nosotros y a Zoho) y además queda en el portal como cambio pendiente de
   validar. Las fotos no están en el formulario: se conservan las que tenía.
   ========================================================================== */
import { sb, datosActuales, proponer } from './portal-cliente.js';

export async function enviadaDesdePortal(partnerId, datos) {
  const { data } = await sb.auth.getSession();
  if (!data.session) { throw new Error('La sesión del portal ha caducado: entra otra vez en /acceso.'); }
  const actual = await datosActuales(partnerId);
  const base = actual.pendiente || actual.publicada || {};
  const nuevos = { ...datos };
  if (Array.isArray(base.imagenes)) { nuevos.imagenes = base.imagenes; }
  delete nuevos.consentimiento;
  await proponer(partnerId, nuevos);
}
