-- Plantilla de migración · copiar a supabase/migrations/AAAAMMDDhhmmss_<tema>.sql
--
-- Desde el 30/10/2026 Supabase no da permisos por defecto a las tablas nuevas
-- de public: sin GRANT, ni el portal ni las funciones del sitio las ven.
-- tools/check-permisos.mjs falla en CI si una tabla o vista se queda sin ellos.
--
-- Qué dice el comentario de arriba: para qué es la tabla, quién la escribe y
-- quién la lee. Lo que no se sabe va a null; nada de datos personales.

create table public.ejemplo (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  creado_en timestamptz not null default now()
);

-- 1 · RLS siempre: quién ve cada fila
alter table public.ejemplo enable row level security;
create policy "admin gestiona ejemplo" on public.ejemplo for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "el partner lee lo suyo" on public.ejemplo for select to authenticated
  using ((select public.es_miembro(partner_id)));

-- 2 · Permisos: obligatorios. anon, nada salvo que la web pública lo lea.
grant all on public.ejemplo to service_role;
grant select, insert, update, delete on public.ejemplo to authenticated;   -- solo lo que use el portal

-- 3 · Funciones: security definer con search_path vacío, y execute solo a quien la llame
-- create function public.hacer_algo(p uuid) returns void language plpgsql security definer set search_path = '' as $$ … $$;
-- revoke all on function public.hacer_algo(uuid) from public, anon;
-- grant execute on function public.hacer_algo(uuid) to authenticated;
