-- =============================================================================
-- Portal de partners · fotos, visitas, leads y coste de las importaciones
-- =============================================================================

-- Las funciones nuevas no las puede llamar quien no ha entrado.
revoke execute on all functions in schema public from anon, public;
revoke execute on function public.unir_invitado() from authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;
alter default privileges in schema public revoke all on tables from anon;

-- Quién será administrador al entrar con su correo verificado. El correo se
-- añade desde el SQL editor, no en el repositorio.
create table public.admins_pendientes (
  correo text primary key check (correo = lower(correo))
);
alter table public.admins_pendientes enable row level security;

create or replace function public.unir_invitado() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or new.email_confirmed_at is null then return new; end if;
  insert into public.admins (user_id)
  select new.id from public.admins_pendientes where correo = lower(new.email)
  on conflict do nothing;
  insert into public.miembros (partner_id, user_id, rol)
  select i.partner_id, new.id, i.rol from public.invitaciones i
   where i.correo = lower(new.email) and i.aceptada_en is null
  on conflict do nothing;
  update public.invitaciones set aceptada_en = now()
   where correo = lower(new.email) and aceptada_en is null;
  update public.partners p set estado = 'activo'
   where p.estado = 'invitado'
     and exists (select 1 from public.miembros m where m.partner_id = p.id and m.user_id = new.id);
  return new;
end $$;
revoke execute on function public.unir_invitado() from anon, public, authenticated;

-- Cada importación de un catálogo (web o PDF) con lo que ha costado. La escribe
-- la función de importar con la clave de servicio; la lee solo el administrador.
create table public.importaciones (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  ficha text not null,
  metodo text not null,
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  tokens_cache integer not null default 0,
  coste_usd numeric(10, 5) not null default 0,
  fuente text,
  partner_id uuid references public.partners (id) on delete set null
);
alter table public.importaciones enable row level security;
create policy "admin lee importaciones" on public.importaciones for select to authenticated
  using ((select public.es_admin()));
create index importaciones_fecha_idx on public.importaciones (creado_en desc);

-- Una visita o un clic más en la página pública de un partner. Solo la llama
-- la web con la clave de servicio.
create function public.sumar_impresion(p_codigo text, p_clic boolean default false)
returns void language sql security definer set search_path = ''
as $$
  insert into public.impresiones (partner_id, dia, vistas, clics)
  select id, current_date, case when p_clic then 0 else 1 end, case when p_clic then 1 else 0 end
    from public.partners where codigo = p_codigo and estado = 'activo'
  on conflict (partner_id, dia) do update
    set vistas = public.impresiones.vistas + excluded.vistas,
        clics = public.impresiones.clics + excluded.clics;
$$;
revoke execute on function public.sumar_impresion(text, boolean) from anon, public, authenticated;
grant execute on function public.sumar_impresion(text, boolean) to service_role;

-- --- Fotos ----------------------------------------------------------------------
-- Cubo privado. Cada partner sube a su carpeta (<id del partner>/...). Lo que se
-- publica son las rutas que lleva la ficha aprobada, y la web las sirve.

create function public.es_miembro_carpeta(ruta text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case when split_part(ruta, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then public.es_miembro(split_part(ruta, '/', 1)::uuid) else false end
$$;
revoke execute on function public.es_miembro_carpeta(text) from anon, public;
grant execute on function public.es_miembro_carpeta(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "partner sube a su carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos'
              and public.es_miembro_carpeta(name));
create policy "partner ve su carpeta" on storage.objects for select to authenticated
  using (bucket_id = 'fotos'
         and ((select public.es_admin()) or public.es_miembro_carpeta(name)));
create policy "partner borra de su carpeta" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos'
         and public.es_miembro_carpeta(name));
