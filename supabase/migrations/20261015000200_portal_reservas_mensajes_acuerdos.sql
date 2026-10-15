-- =============================================================================
-- Portal de partners · reservas, conversación y acuerdos con historial
--
-- Una reserva es lo que pedimos a un partner para un evento: fecha, horas,
-- personas, qué y bajo qué acuerdo. El partner confirma, propone otra cosa o
-- la rechaza, y cada paso queda en la conversación de ese partner, que es
-- también lo que pasa a Zoho como nota. Nada cambia de estado sin pasar por
-- una función que comprueba quién la llama.
--
-- Los acuerdos ganan historial: cada versión sabe de cuál viene, desde cuándo
-- vale, quién la firmó o la rechazó y por qué. La versión la pone la base de
-- datos, no quien la propone.
--
-- Aquí tampoco hay datos personales de clientes: una reserva lleva un título
-- que escribimos nosotros («Comida de empresa · 40 pax») y el id del trato en
-- Zoho, donde están el cliente y sus datos.
-- =============================================================================

-- --- La conversación de cada partner ------------------------------------------
-- Una sola línea de tiempo por partner: cambios de ficha, acuerdos, reservas y
-- comentarios. Las notas internas solo las ve un administrador.

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  sobre text not null default 'general' check (sobre in ('general', 'ficha', 'acuerdo', 'reserva')),
  ref uuid,
  autor uuid references auth.users (id) default auth.uid(),
  tipo text not null check (tipo in (
    'comentario', 'nota_interna',
    'cambio_propuesto', 'cambio_aprobado', 'cambio_rechazado',
    'acuerdo_propuesto', 'acuerdo_aceptado', 'acuerdo_validado', 'acuerdo_vigente', 'acuerdo_rechazado',
    'reserva_solicitada', 'reserva_confirmada', 'reserva_alternativa', 'reserva_rechazada',
    'reserva_modificada', 'reserva_cancelada')),
  texto text check (texto is null or length(texto) <= 4000),
  datos jsonb,
  interno boolean not null default false,
  zoho_nota_id text,
  creado_en timestamptz not null default now()
);
create index mensajes_partner_idx on public.mensajes (partner_id, creado_en desc);
create index mensajes_ref_idx on public.mensajes (ref) where ref is not null;
alter table public.mensajes enable row level security;

create policy "lee su conversacion" on public.mensajes for select to authenticated
  using ((select public.es_admin()) or (public.es_miembro(partner_id) and not interno));
revoke all on public.mensajes from anon, authenticated;
grant select on public.mensajes to authenticated;

-- Escribir en la conversación desde dentro de las funciones
create function public.apuntar(p_partner uuid, p_sobre text, p_ref uuid, p_tipo text,
                               p_texto text default null, p_datos jsonb default null,
                               p_interno boolean default false)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare nuevo uuid;
begin
  insert into public.mensajes (partner_id, sobre, ref, autor, tipo, texto, datos, interno)
  values (p_partner, p_sobre, p_ref, auth.uid(), p_tipo, nullif(trim(p_texto), ''), p_datos, p_interno)
  returning id into nuevo;
  return nuevo;
end $$;
revoke execute on function public.apuntar(uuid, text, uuid, text, text, jsonb, boolean) from public, anon, authenticated;

-- Un comentario sobre la relación, una ficha, un acuerdo o una reserva.
-- La nota interna solo la escribe (y la ve) un administrador.
create function public.comentar(p_partner uuid, p_texto text, p_sobre text default 'general',
                                p_ref uuid default null, p_interno boolean default false)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare dueno uuid;
begin
  if coalesce(trim(p_texto), '') = '' then raise exception 'El comentario está vacío'; end if;
  if not (public.es_admin() or public.es_miembro(p_partner)) then raise exception 'No puedes escribir aquí'; end if;
  if p_interno and not public.es_admin() then raise exception 'Solo un administrador escribe notas internas'; end if;
  if p_ref is not null then
    dueno := case p_sobre
      when 'acuerdo' then (select partner_id from public.acuerdos where id = p_ref)
      when 'reserva' then (select partner_id from public.reservas where id = p_ref)
      when 'ficha' then (select partner_id from public.cambios_ficha where id = p_ref)
    end;
    if dueno is distinct from p_partner then raise exception 'Eso no es de este partner'; end if;
  end if;
  return public.apuntar(p_partner, p_sobre, p_ref,
    case when p_interno then 'nota_interna' else 'comentario' end, p_texto, null, p_interno);
end $$;

-- --- Reservas -----------------------------------------------------------------

create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  zoho_deal_id text,
  titulo text not null check (length(titulo) between 3 and 160),
  concepto text check (concepto is null or length(concepto) <= 300),
  fecha date not null,
  hora_inicio time,
  hora_fin time,
  personas integer check (personas is null or personas > 0),
  detalles text check (detalles is null or length(detalles) <= 4000),
  importe numeric(10, 2) check (importe is null or importe >= 0),
  iva_incluido boolean not null default false,
  acuerdo_id uuid references public.acuerdos (id),
  responder_antes date,
  estado text not null default 'solicitada'
    check (estado in ('solicitada', 'confirmada', 'alternativa', 'rechazada', 'cancelada')),
  creada_por uuid references auth.users (id) default auth.uid(),
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
create index reservas_partner_idx on public.reservas (partner_id, fecha);
create index reservas_estado_idx on public.reservas (estado) where estado in ('solicitada', 'alternativa');
alter table public.reservas enable row level security;

create policy "lee sus reservas" on public.reservas for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));
create policy "admin pide reservas" on public.reservas for insert to authenticated
  with check ((select public.es_admin()) and estado = 'solicitada');
revoke all on public.reservas from anon, authenticated;
grant select, insert on public.reservas to authenticated;

-- Al pedirla: el acuerdo que vale ese día, si no se ha dicho otro, y el
-- primer mensaje de la conversación.
create function public.reserva_nueva() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.acuerdo_id is null then
    select id into new.acuerdo_id from public.acuerdos
     where partner_id = new.partner_id and estado = 'vigente' limit 1;
  elsif not exists (select 1 from public.acuerdos where id = new.acuerdo_id and partner_id = new.partner_id) then
    raise exception 'Ese acuerdo no es de este partner';
  end if;
  new.creada_por := auth.uid();
  return new;
end $$;
create trigger reserva_nueva before insert on public.reservas
for each row execute function public.reserva_nueva();

create function public.reserva_creada() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.apuntar(new.partner_id, 'reserva', new.id, 'reserva_solicitada', new.detalles,
    jsonb_build_object('titulo', new.titulo, 'fecha', new.fecha, 'hora_inicio', new.hora_inicio,
                       'hora_fin', new.hora_fin, 'personas', new.personas, 'concepto', new.concepto));
  return new;
end $$;
create trigger reserva_creada after insert on public.reservas
for each row execute function public.reserva_creada();
revoke execute on function public.reserva_nueva(), public.reserva_creada() from public, anon, authenticated;

-- El partner contesta: confirma, propone otra cosa o no puede.
-- Una reserva ya confirmada solo se puede rechazar, y con motivo.
create function public.responder_reserva(p_reserva uuid, p_respuesta text, p_texto text default null,
                                         p_propuesta jsonb default null)
returns text language plpgsql security definer set search_path = ''
as $$
declare r public.reservas;
begin
  select * into r from public.reservas where id = p_reserva for update;
  if not found or not public.es_miembro(r.partner_id) then raise exception 'No puedes contestar esta reserva'; end if;
  if p_respuesta not in ('confirmada', 'alternativa', 'rechazada') then raise exception 'Respuesta no válida'; end if;
  if r.estado = 'confirmada' and p_respuesta <> 'rechazada' then raise exception 'Ya está confirmada'; end if;
  if r.estado not in ('solicitada', 'confirmada') then raise exception 'Esta reserva no espera respuesta'; end if;
  if p_respuesta in ('alternativa', 'rechazada') and coalesce(trim(p_texto), '') = '' and p_propuesta is null then
    raise exception 'Cuéntanos qué propones o por qué no puede ser';
  end if;
  update public.reservas set estado = p_respuesta, actualizada_en = now() where id = p_reserva;
  perform public.apuntar(r.partner_id, 'reserva', r.id, 'reserva_' || p_respuesta, p_texto,
    case when p_respuesta = 'alternativa' then p_propuesta end);
  return p_respuesta;
end $$;

-- Nosotros: cambiar lo pedido (vuelve a pedir confirmación), aceptar la
-- alternativa del partner o cancelar.
create function public.modificar_reserva(p_reserva uuid, p_cambios jsonb, p_texto text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.reservas;
begin
  if not public.es_admin() then raise exception 'Solo un administrador cambia reservas'; end if;
  select * into r from public.reservas where id = p_reserva for update;
  if not found or r.estado = 'cancelada' then raise exception 'La reserva no se puede cambiar'; end if;
  update public.reservas set
    titulo = coalesce(p_cambios->>'titulo', titulo),
    concepto = case when p_cambios ? 'concepto' then p_cambios->>'concepto' else concepto end,
    fecha = coalesce((p_cambios->>'fecha')::date, fecha),
    hora_inicio = case when p_cambios ? 'hora_inicio' then (p_cambios->>'hora_inicio')::time else hora_inicio end,
    hora_fin = case when p_cambios ? 'hora_fin' then (p_cambios->>'hora_fin')::time else hora_fin end,
    personas = case when p_cambios ? 'personas' then (p_cambios->>'personas')::integer else personas end,
    detalles = case when p_cambios ? 'detalles' then p_cambios->>'detalles' else detalles end,
    importe = case when p_cambios ? 'importe' then (p_cambios->>'importe')::numeric else importe end,
    zoho_deal_id = case when p_cambios ? 'zoho_deal_id' then p_cambios->>'zoho_deal_id' else zoho_deal_id end,
    responder_antes = case when p_cambios ? 'responder_antes' then (p_cambios->>'responder_antes')::date else responder_antes end,
    estado = 'solicitada', actualizada_en = now()
   where id = p_reserva;
  perform public.apuntar(r.partner_id, 'reserva', r.id, 'reserva_modificada', p_texto, p_cambios);
end $$;

create function public.aceptar_alternativa(p_reserva uuid, p_texto text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.reservas; prop jsonb;
begin
  if not public.es_admin() then raise exception 'Solo un administrador acepta alternativas'; end if;
  select * into r from public.reservas where id = p_reserva for update;
  if not found or r.estado <> 'alternativa' then raise exception 'No hay alternativa que aceptar'; end if;
  select datos into prop from public.mensajes
   where ref = p_reserva and tipo = 'reserva_alternativa' order by creado_en desc limit 1;
  prop := coalesce(prop, '{}'::jsonb);
  update public.reservas set
    fecha = coalesce((prop->>'fecha')::date, fecha),
    hora_inicio = coalesce((prop->>'hora_inicio')::time, hora_inicio),
    hora_fin = coalesce((prop->>'hora_fin')::time, hora_fin),
    personas = coalesce((prop->>'personas')::integer, personas),
    importe = coalesce((prop->>'importe')::numeric, importe),
    estado = 'confirmada', actualizada_en = now()
   where id = p_reserva;
  perform public.apuntar(r.partner_id, 'reserva', r.id, 'reserva_confirmada',
    coalesce(nullif(trim(p_texto), ''), 'Aceptamos vuestra propuesta.'), prop);
end $$;

create function public.cancelar_reserva(p_reserva uuid, p_texto text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.reservas;
begin
  if not public.es_admin() then raise exception 'Solo un administrador cancela reservas'; end if;
  select * into r from public.reservas where id = p_reserva for update;
  if not found or r.estado = 'cancelada' then raise exception 'La reserva ya está cancelada'; end if;
  update public.reservas set estado = 'cancelada', actualizada_en = now() where id = p_reserva;
  perform public.apuntar(r.partner_id, 'reserva', r.id, 'reserva_cancelada', p_texto);
end $$;

-- --- Acuerdos con historial ----------------------------------------------------

alter table public.acuerdos
  add column basado_en uuid references public.acuerdos (id),
  add column resumen text check (resumen is null or length(resumen) <= 300),
  add column vigente_desde date,
  add column vigente_hasta date,
  add column rechazado_por uuid references auth.users (id),
  add column rechazado_en timestamptz,
  add column motivo text check (motivo is null or length(motivo) <= 4000);

-- La versión y de cuál viene los pone la base de datos: dos propuestas a la
-- vez no pueden llevar el mismo número ni partir de un acuerdo de otro.
create function public.acuerdo_nuevo() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('acuerdos:' || new.partner_id::text));
  select coalesce(max(version), 0) + 1 into new.version from public.acuerdos where partner_id = new.partner_id;
  if new.basado_en is null then
    select id into new.basado_en from public.acuerdos where partner_id = new.partner_id and estado = 'vigente' limit 1;
  elsif not exists (select 1 from public.acuerdos where id = new.basado_en and partner_id = new.partner_id) then
    raise exception 'Ese acuerdo no es de este partner';
  end if;
  new.rechazado_por := null; new.rechazado_en := null; new.motivo := null;
  return new;
end $$;
create trigger acuerdo_nuevo before insert on public.acuerdos
for each row execute function public.acuerdo_nuevo();

create function public.acuerdo_creado() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.apuntar(new.partner_id, 'acuerdo', new.id, 'acuerdo_propuesto', new.resumen,
                         jsonb_build_object('version', new.version));
  return new;
end $$;
create trigger acuerdo_creado after insert on public.acuerdos
for each row execute function public.acuerdo_creado();
revoke execute on function public.acuerdo_nuevo(), public.acuerdo_creado() from public, anon, authenticated;

create or replace function public.firmar_acuerdo(acuerdo uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare a public.acuerdos;
begin
  select * into a from public.acuerdos where id = acuerdo for update;
  if not found or a.estado <> 'propuesto' then raise exception 'El acuerdo no está propuesto'; end if;
  if public.es_admin() then
    update public.acuerdos set validado_por = auth.uid(), validado_en = now() where id = acuerdo;
    perform public.apuntar(a.partner_id, 'acuerdo', a.id, 'acuerdo_validado', null, jsonb_build_object('version', a.version));
  elsif public.es_miembro(a.partner_id) then
    update public.acuerdos set aceptado_por = auth.uid(), aceptado_en = now() where id = acuerdo;
    perform public.apuntar(a.partner_id, 'acuerdo', a.id, 'acuerdo_aceptado', null, jsonb_build_object('version', a.version));
  else
    raise exception 'No puedes firmar este acuerdo';
  end if;
  select * into a from public.acuerdos where id = acuerdo;
  if a.aceptado_por is not null and a.validado_por is not null then
    update public.acuerdos set estado = 'sustituido', vigente_hasta = coalesce(vigente_hasta, current_date)
     where partner_id = a.partner_id and estado = 'vigente';
    update public.acuerdos set estado = 'vigente', vigente_desde = coalesce(vigente_desde, current_date) where id = acuerdo;
    perform public.apuntar(a.partner_id, 'acuerdo', a.id, 'acuerdo_vigente', null, jsonb_build_object('version', a.version));
    return 'vigente';
  end if;
  return 'propuesto';
end $$;

-- Rechazar una propuesta: lo puede hacer cualquiera de las dos partes, con su
-- motivo, que queda en el historial. Quien la propuso la retira igual.
create function public.rechazar_propuesta(acuerdo uuid, motivo text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.acuerdos;
begin
  select * into a from public.acuerdos where id = acuerdo for update;
  if not found or a.estado <> 'propuesto' then raise exception 'El acuerdo no está propuesto'; end if;
  if not (public.es_admin() or public.es_miembro(a.partner_id)) then raise exception 'No puedes rechazar este acuerdo'; end if;
  update public.acuerdos set estado = 'rechazado', rechazado_por = auth.uid(), rechazado_en = now(),
         motivo = nullif(trim(rechazar_propuesta.motivo), '') where id = acuerdo;
  perform public.apuntar(a.partner_id, 'acuerdo', a.id, 'acuerdo_rechazado', rechazar_propuesta.motivo,
                         jsonb_build_object('version', a.version));
end $$;

-- La de antes, sin motivo, sigue funcionando igual para quien la llame
create or replace function public.rechazar_acuerdo(acuerdo uuid)
returns void language plpgsql security definer set search_path = ''
as $$ begin perform public.rechazar_propuesta(acuerdo, null); end $$;

-- --- Cambios de ficha en la conversación ---------------------------------------

create function public.cambio_creado() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform public.apuntar(new.partner_id, 'ficha', new.id, 'cambio_propuesto');
  return new;
end $$;
create trigger cambio_creado after insert on public.cambios_ficha
for each row execute function public.cambio_creado();
revoke execute on function public.cambio_creado() from public, anon, authenticated;

create or replace function public.revisar_cambio(cambio uuid, aprobar boolean, nota text default null)
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
  perform public.apuntar(c.partner_id, 'ficha', c.id,
    case when aprobar then 'cambio_aprobado' else 'cambio_rechazado' end, nota);
end $$;

-- --- Para el administrador: quién entra por cada partner -----------------------

create function public.miembros_de(p uuid)
returns table (user_id uuid, correo text, rol text, desde timestamptz, ultimo_acceso timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.es_admin() then raise exception 'Solo un administrador'; end if;
  return query
    select m.user_id, u.email::text, m.rol, m.creado_en, u.last_sign_in_at
      from public.miembros m join auth.users u on u.id = m.user_id
     where m.partner_id = p order by m.creado_en;
end $$;

revoke execute on all functions in schema public from anon, public;
grant execute on function public.comentar(uuid, text, text, uuid, boolean),
                          public.responder_reserva(uuid, text, text, jsonb),
                          public.modificar_reserva(uuid, jsonb, text),
                          public.aceptar_alternativa(uuid, text),
                          public.cancelar_reserva(uuid, text),
                          public.rechazar_propuesta(uuid, text),
                          public.rechazar_acuerdo(uuid),
                          public.firmar_acuerdo(uuid),
                          public.revisar_cambio(uuid, boolean, text),
                          public.miembros_de(uuid) to authenticated;
-- Lo que sigue siendo solo para el servidor o los disparadores
revoke execute on function public.apuntar(uuid, text, uuid, text, text, jsonb, boolean),
                           public.sumar_impresion(text, boolean) from authenticated;
