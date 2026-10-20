-- Permisos explícitos en cada tabla y vista de public
--
-- Desde el 30/10/2026 Supabase deja de dar permisos por defecto a las tablas
-- nuevas de public: lo que una migración no conceda con GRANT, nadie lo puede
-- leer ni escribir por la API, ni siquiera las funciones con la clave de
-- servicio. Esta migración deja escrito lo que cada tabla tiene hoy, para que
-- montar la base desde cero dé lo mismo, y quita a `authenticated` lo que la
-- API no usa (TRUNCATE, REFERENCES, TRIGGER). Quién ve cada fila lo sigue
-- decidiendo RLS.
--
-- Las tablas nuevas siguen supabase/plantilla-migracion.sql y
-- tools/check-permisos.mjs comprueba en CI que ninguna se queda sin GRANT.

revoke all on
  public.acuerdos, public.admins, public.admins_pendientes, public.agenda, public.articulos,
  public.cambios_ficha, public.coste_ia_por_registro, public.evento_invitados, public.eventos_cliente,
  public.fichas, public.importaciones, public.impresiones, public.invitaciones, public.leads,
  public.liquidaciones, public.mensajes, public.miembros, public.partners, public.peticiones_cliente,
  public.reservas, public.uso_ia
from anon, authenticated;

-- Las funciones del sitio (clave de servicio) pueden con todo
grant all on
  public.acuerdos, public.admins, public.admins_pendientes, public.agenda, public.articulos,
  public.cambios_ficha, public.coste_ia_por_registro, public.evento_invitados, public.eventos_cliente,
  public.fichas, public.importaciones, public.impresiones, public.invitaciones, public.leads,
  public.liquidaciones, public.mensajes, public.miembros, public.partners, public.peticiones_cliente,
  public.reservas, public.uso_ia
to service_role;

-- Quien ha entrado: lo mismo que tenía, filtrado por RLS
grant select, insert, update, delete on
  public.admins, public.admins_pendientes, public.importaciones, public.impresiones,
  public.invitaciones, public.leads, public.miembros, public.partners, public.uso_ia
to authenticated;
grant select, insert, update on
  public.articulos, public.evento_invitados, public.eventos_cliente, public.liquidaciones,
  public.peticiones_cliente
to authenticated;
grant select, insert on public.acuerdos, public.agenda, public.cambios_ficha, public.fichas, public.reservas to authenticated;
grant select on public.mensajes, public.coste_ia_por_registro to authenticated;
