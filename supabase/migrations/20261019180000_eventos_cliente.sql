-- =============================================================================
-- La página del cliente: su evento, en privado, en /evento
--
-- Cada evento vendido tiene aquí su versión para el cliente: programa, lugar,
-- personas y lo que aún nos falta de él. Sale de eventos/<id>.json con
-- tools/evento-cliente.mjs, que deja fuera precios, costes, comisiones,
-- proveedores y notas internas. El cliente solo la lee.
--
-- Lo que el cliente pide va a peticiones_cliente y lo atiende Álvaro: el
-- cliente nunca habla directamente con un espacio o un proveedor.
-- =============================================================================

create table public.eventos_cliente (
  id text primary key check (id ~ '^[a-z0-9-]{3,80}$'),
  titulo text not null check (length(titulo) between 1 and 160),
  fecha date,
  estado text not null default 'confirmado' check (estado in ('propuesta', 'confirmado', 'hecho', 'cancelado')),
  datos jsonb not null default '{}' check (jsonb_typeof(datos) = 'object'),
  actualizado_en timestamptz not null default now()
);

-- Quién puede verlo: un correo invitado, que se une a su cuenta al entrar.
create table public.evento_invitados (
  evento_id text not null references public.eventos_cliente (id) on delete cascade,
  correo text not null check (correo = lower(correo) and position('@' in correo) > 1),
  user_id uuid references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (evento_id, correo)
);
create index evento_invitados_user_idx on public.evento_invitados (user_id);

create table public.peticiones_cliente (
  id uuid primary key default gen_random_uuid(),
  evento_id text not null references public.eventos_cliente (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  texto text not null check (length(texto) between 1 and 2000),
  estado text not null default 'nueva' check (estado in ('nueva', 'vista', 'respondida')),
  respuesta text check (respuesta is null or length(respuesta) <= 2000),
  creado_en timestamptz not null default now(),
  respondida_en timestamptz
);
create index peticiones_cliente_evento_idx on public.peticiones_cliente (evento_id, creado_en desc);

create function public.es_cliente(e text) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.evento_invitados where evento_id = e and user_id = (select auth.uid())) $$;
revoke execute on function public.es_cliente(text) from anon, public;
grant execute on function public.es_cliente(text) to authenticated;

alter table public.eventos_cliente enable row level security;
alter table public.evento_invitados enable row level security;
alter table public.peticiones_cliente enable row level security;

create policy "lee su evento" on public.eventos_cliente for select to authenticated
  using ((select public.es_admin()) or public.es_cliente(id));
create policy "admin gestiona eventos" on public.eventos_cliente for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "admin gestiona invitados" on public.evento_invitados for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

create policy "lee sus peticiones" on public.peticiones_cliente for select to authenticated
  using ((select public.es_admin()) or public.es_cliente(evento_id));
create policy "pide en su evento" on public.peticiones_cliente for insert to authenticated
  with check (public.es_cliente(evento_id) and user_id = (select auth.uid())
              and estado = 'nueva' and respuesta is null and respondida_en is null);
create policy "admin responde" on public.peticiones_cliente for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

revoke all on public.eventos_cliente, public.evento_invitados, public.peticiones_cliente from anon, authenticated;
grant select, insert, update on public.eventos_cliente to authenticated;
grant select, insert, update on public.evento_invitados to authenticated;
grant select, insert, update on public.peticiones_cliente to authenticated;

-- --- La invitación se une a la cuenta -------------------------------------------
-- Al verificar el correo (cuenta nueva) o al invitar a alguien que ya tiene cuenta.

create function public.unir_cliente() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.email is null or new.email_confirmed_at is null then return new; end if;
  update public.evento_invitados set user_id = new.id
   where correo = lower(new.email) and user_id is null;
  return new;
end $$;
revoke execute on function public.unir_cliente() from anon, public, authenticated;

create trigger unir_cliente
after insert or update of email_confirmed_at on auth.users
for each row execute function public.unir_cliente();

create function public.invitado_con_cuenta() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is null then
    select u.id into new.user_id from auth.users u
     where lower(u.email) = new.correo and u.email_confirmed_at is not null limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.invitado_con_cuenta() from anon, public, authenticated;

create trigger invitado_con_cuenta
before insert on public.evento_invitados
for each row execute function public.invitado_con_cuenta();

comment on table public.eventos_cliente is
  'Versión para el cliente de cada evento (programa, lugar, personas, lo que falta). Sin precios, costes, comisiones, proveedores ni notas internas: sale de tools/evento-cliente.mjs.';
comment on table public.peticiones_cliente is
  'Lo que el cliente pide desde /evento. Lo atiende Events Penedès; nunca llega directo a un partner.';
