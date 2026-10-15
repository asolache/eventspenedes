-- =============================================================================
-- Portal de partners · esquema y permisos
--
-- Los partners (espacios y proveedores de la red) proponen; Alvaro valida.
-- Nada de lo que escribe un partner pasa a su ficha publicada ni a un acuerdo
-- vigente sin que lo apruebe un administrador. Cada partner ve solo lo suyo.
-- Aquí no hay datos personales de clientes: los leads se guardan sin nombre,
-- correo ni teléfono; esos viven en Zoho.
-- =============================================================================

-- Quién administra: se añade a mano desde el SQL editor tras el primer acceso.
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now()
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique
    check (codigo ~ '^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$'),
  nombre text not null,
  tipo text not null check (tipo in ('localizacion', 'proveedor')),
  zoho_account_id text,
  estado text not null default 'invitado' check (estado in ('invitado', 'activo', 'pausado')),
  creado_en timestamptz not null default now()
);

create table public.miembros (
  partner_id uuid not null references public.partners (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rol text not null default 'editor' check (rol in ('titular', 'editor')),
  creado_en timestamptz not null default now(),
  primary key (partner_id, user_id)
);
create index miembros_user_idx on public.miembros (user_id);

-- La invitación se hace por correo. Quien entra con ese correo ya verificado
-- (GitHub o correo y contraseña confirmado) queda unido al partner.
create table public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  correo text not null check (correo = lower(correo)),
  rol text not null default 'editor' check (rol in ('titular', 'editor')),
  creado_en timestamptz not null default now(),
  aceptada_en timestamptz,
  unique (partner_id, correo)
);

-- La ficha validada: lo que se publica. Solo la escribe una aprobación.
create table public.fichas (
  partner_id uuid primary key references public.partners (id) on delete cascade,
  datos jsonb not null default '{}'::jsonb,
  version integer not null default 0,
  actualizada_en timestamptz not null default now()
);

-- Lo que propone el partner, pendiente hasta que se revisa.
create table public.cambios_ficha (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  autor uuid not null default auth.uid() references auth.users (id),
  datos jsonb not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobado', 'rechazado')),
  nota_revision text,
  revisado_por uuid references auth.users (id),
  revisado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index cambios_ficha_partner_idx on public.cambios_ficha (partner_id, creado_en desc);

-- Las condiciones del acuerdo, por versiones. Está vigente solo cuando lo ha
-- aceptado el partner Y lo ha validado un administrador.
create table public.acuerdos (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  version integer not null,
  condiciones jsonb not null,
  propuesto_por uuid not null default auth.uid() references auth.users (id),
  aceptado_por uuid references auth.users (id),
  aceptado_en timestamptz,
  validado_por uuid references auth.users (id),
  validado_en timestamptz,
  estado text not null default 'propuesto'
    check (estado in ('propuesto', 'vigente', 'sustituido', 'rechazado')),
  creado_en timestamptz not null default now(),
  unique (partner_id, version)
);

-- Los leads que trajo cada partner, sin datos personales del cliente.
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  zoho_modulo text check (zoho_modulo in ('Leads', 'Deals')),
  zoho_id text,
  tipo_evento text,
  personas integer check (personas is null or personas > 0),
  fecha_evento date,
  estado text not null default 'nuevo',
  creado_en timestamptz not null default now(),
  unique (zoho_modulo, zoho_id)
);
create index leads_partner_idx on public.leads (partner_id, creado_en desc);

-- Cuánto se ve cada partner en la web, por día.
create table public.impresiones (
  partner_id uuid not null references public.partners (id) on delete cascade,
  dia date not null,
  vistas integer not null default 0 check (vistas >= 0),
  clics integer not null default 0 check (clics >= 0),
  primary key (partner_id, dia)
);

-- --- Quién es quién -----------------------------------------------------------

create function public.es_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins where user_id = (select auth.uid())) $$;

create function public.es_miembro(p uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.miembros where partner_id = p and user_id = (select auth.uid())) $$;

-- --- Permisos -----------------------------------------------------------------

alter table public.admins enable row level security;
alter table public.partners enable row level security;
alter table public.miembros enable row level security;
alter table public.invitaciones enable row level security;
alter table public.fichas enable row level security;
alter table public.cambios_ficha enable row level security;
alter table public.acuerdos enable row level security;
alter table public.leads enable row level security;
alter table public.impresiones enable row level security;

-- Nada para quien no ha entrado.
revoke all on all tables in schema public from anon;
revoke execute on all functions in schema public from anon, public;
grant execute on function public.es_admin(), public.es_miembro(uuid) to authenticated;

create policy "admin ve admins" on public.admins for select to authenticated using ((select public.es_admin()));

create policy "lee su partner" on public.partners for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(id));
create policy "admin gestiona partners" on public.partners for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "lee sus miembros" on public.miembros for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));
create policy "admin gestiona miembros" on public.miembros for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "admin gestiona invitaciones" on public.invitaciones for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "lee su ficha" on public.fichas for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));

create policy "lee sus cambios" on public.cambios_ficha for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));
create policy "propone cambios" on public.cambios_ficha for insert to authenticated
  with check (public.es_miembro(partner_id) and autor = (select auth.uid())
              and estado = 'pendiente' and revisado_por is null and revisado_en is null);

create policy "lee sus acuerdos" on public.acuerdos for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));
create policy "propone acuerdos" on public.acuerdos for insert to authenticated
  with check (((select public.es_admin()) or public.es_miembro(partner_id))
              and propuesto_por = (select auth.uid()) and estado = 'propuesto'
              and validado_por is null and aceptado_por is null);

create policy "lee sus leads" on public.leads for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));
create policy "admin gestiona leads" on public.leads for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "lee sus impresiones" on public.impresiones for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));

revoke update, delete, truncate on public.cambios_ficha, public.acuerdos, public.fichas from authenticated;

-- --- Acciones -----------------------------------------------------------------
-- Los cambios de estado pasan solo por estas funciones, que comprueban quién
-- las llama. Las tablas no admiten update directo de nadie salvo el servicio.

create function public.revisar_cambio(cambio uuid, aprobar boolean, nota text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare c public.cambios_ficha;
begin
  if not public.es_admin() then raise exception 'Solo un administrador revisa cambios'; end if;
  select * into c from public.cambios_ficha where id = cambio for update;
  if not found or c.estado <> 'pendiente' then raise exception 'El cambio no está pendiente'; end if;
  update public.cambios_ficha
     set estado = case when aprobar then 'aprobado' else 'rechazado' end,
         nota_revision = nota, revisado_por = auth.uid(), revisado_en = now()
   where id = cambio;
  if aprobar then
    insert into public.fichas (partner_id, datos, version, actualizada_en)
    values (c.partner_id, c.datos, 1, now())
    on conflict (partner_id) do update
      set datos = excluded.datos, version = public.fichas.version + 1, actualizada_en = now();
  end if;
end $$;

-- Acepta (partner) o valida (admin) un acuerdo propuesto. Con las dos firmas
-- pasa a vigente y el que lo estaba queda sustituido.
create function public.firmar_acuerdo(acuerdo uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare a public.acuerdos;
begin
  select * into a from public.acuerdos where id = acuerdo for update;
  if not found or a.estado <> 'propuesto' then raise exception 'El acuerdo no está propuesto'; end if;
  if public.es_admin() then
    update public.acuerdos set validado_por = auth.uid(), validado_en = now() where id = acuerdo;
  elsif public.es_miembro(a.partner_id) then
    update public.acuerdos set aceptado_por = auth.uid(), aceptado_en = now() where id = acuerdo;
  else
    raise exception 'No puedes firmar este acuerdo';
  end if;
  select * into a from public.acuerdos where id = acuerdo;
  if a.aceptado_por is not null and a.validado_por is not null then
    update public.acuerdos set estado = 'sustituido'
     where partner_id = a.partner_id and estado = 'vigente';
    update public.acuerdos set estado = 'vigente' where id = acuerdo;
    return 'vigente';
  end if;
  return 'propuesto';
end $$;

create function public.rechazar_acuerdo(acuerdo uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'Solo un administrador rechaza acuerdos'; end if;
  update public.acuerdos set estado = 'rechazado' where id = acuerdo and estado = 'propuesto';
end $$;

grant execute on function public.revisar_cambio(uuid, boolean, text),
                          public.firmar_acuerdo(uuid),
                          public.rechazar_acuerdo(uuid) to authenticated;

-- --- La invitación se cumple al verificar el correo ---------------------------

create function public.unir_invitado() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or new.email_confirmed_at is null then return new; end if;
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
revoke execute on function public.unir_invitado() from authenticated;

create trigger unir_invitado
after insert or update of email_confirmed_at on auth.users
for each row execute function public.unir_invitado();
