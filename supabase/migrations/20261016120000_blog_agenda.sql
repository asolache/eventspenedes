-- =============================================================================
-- Blog y agenda de la red
--
-- El blog (eventspenedes.com/blog) cuenta las experiencias auténticas del
-- Penedès. Las entrevistas a partners salen de un cuestionario que el partner
-- contesta desde su panel; Alvaro escribe el artículo con sus respuestas, el
-- partner da el visto bueno al texto y solo entonces Alvaro lo publica. Una
-- entrevista no se publica sin el permiso del partner para salir con su nombre
-- (y, si lleva fotos, para sus fotos).
--
-- La agenda (eventspenedes.com/agenda) son las acciones del año con fecha:
-- vendimia, catas, calçotades, talleres. Un partner propone una acción desde su
-- panel y queda pendiente, como su ficha, hasta que un administrador la
-- aprueba; aprobada, sale en la agenda y en su página como oferta nueva. Lo
-- público no lleva precios: el precio de la acción es para nosotros.
--
-- Nada cambia de estado sin pasar por una función que comprueba quién la
-- llama. Aquí no hay datos de clientes.
-- =============================================================================

-- --- Artículos ------------------------------------------------------------------

create table public.articulos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'entrevista' check (tipo in ('entrevista', 'guia')),
  -- Una guía la escribimos nosotros y puede no tener partner
  partner_id uuid references public.partners (id) on delete cascade,
  estado text not null default 'cuestionario' check (estado in (
    'cuestionario',  -- el partner está contestando
    'enviado',       -- el partner ha enviado sus respuestas
    'propuesto',     -- hemos escrito el artículo; espera el visto bueno del partner
    'publicado', 'retirado')),
  respuestas jsonb not null default '{}'::jsonb,
  permiso_nombre boolean not null default false,
  permiso_fotos boolean not null default false,
  ok_partner_en timestamptz,
  titulo text check (titulo is null or length(titulo) <= 140),
  slug text unique check (slug is null or slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  entradilla text check (entradilla is null or length(entradilla) <= 400),
  cuerpo text check (cuerpo is null or length(cuerpo) <= 30000),
  temas text[] not null default '{}',
  -- Rutas del bucket `fotos` (carpeta del partner) que salen en el artículo
  fotos jsonb not null default '[]'::jsonb check (jsonb_typeof(fotos) = 'array'),
  autor uuid references auth.users (id) default auth.uid(),
  publicado_en timestamptz,
  publicado_por uuid references auth.users (id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (tipo = 'guia' or partner_id is not null),
  -- Lo que se publica tiene título, dirección y texto
  check (estado <> 'publicado' or (titulo is not null and slug is not null and cuerpo is not null)),
  -- Una entrevista se publica solo con el permiso del partner y su visto bueno
  check (estado <> 'publicado' or tipo <> 'entrevista' or (permiso_nombre and ok_partner_en is not null)),
  check (estado <> 'publicado' or jsonb_array_length(fotos) = 0 or tipo = 'guia' or permiso_fotos)
);
create index articulos_partner_idx on public.articulos (partner_id, creado_en desc);
create index articulos_publicados_idx on public.articulos (publicado_en desc) where estado = 'publicado';
-- Una sola entrevista abierta por partner
create unique index articulos_entrevista_abierta on public.articulos (partner_id)
  where tipo = 'entrevista' and estado in ('cuestionario', 'enviado', 'propuesto');

-- Si cambiamos el texto después del visto bueno, el partner tiene que volver a
-- darlo: su permiso es para el texto que leyó.
create function public.articulo_al_cambiar() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.actualizado_en := now();
  if new.estado <> 'publicado' and (new.titulo is distinct from old.titulo or new.entradilla is distinct from old.entradilla
      or new.cuerpo is distinct from old.cuerpo or new.fotos is distinct from old.fotos) then
    new.ok_partner_en := null;
  end if;
  return new;
end $$;
create trigger articulo_al_cambiar before update on public.articulos
for each row execute function public.articulo_al_cambiar();

alter table public.articulos enable row level security;
revoke all on public.articulos from anon, authenticated;
grant select on public.articulos to authenticated;
grant insert, update on public.articulos to authenticated;

create policy "lee sus articulos" on public.articulos for select to authenticated
  using ((select public.es_admin()) or (partner_id is not null and public.es_miembro(partner_id)));
-- Escribe el artículo y lo publica solo un administrador; el partner, por las funciones
create policy "admin escribe articulos" on public.articulos for insert to authenticated
  with check ((select public.es_admin()));
create policy "admin edita articulos" on public.articulos for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

-- El partner guarda sus respuestas y, cuando quiere, las envía. Mientras no
-- hayamos escrito el artículo puede seguir cambiándolas.
create function public.guardar_entrevista(p_partner uuid, p_respuestas jsonb, p_permiso_nombre boolean,
                                          p_permiso_fotos boolean, p_enviar boolean default false)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare a public.articulos;
begin
  if not public.es_miembro(p_partner) then raise exception 'No puedes contestar por este partner'; end if;
  if jsonb_typeof(p_respuestas) <> 'object' or length(p_respuestas::text) > 20000 then
    raise exception 'Las respuestas no son válidas o son demasiado largas';
  end if;
  select * into a from public.articulos
   where partner_id = p_partner and tipo = 'entrevista' and estado in ('cuestionario', 'enviado', 'propuesto')
   for update;
  if found and a.estado = 'propuesto' then raise exception 'Ya hemos escrito tu artículo: revísalo o escríbenos'; end if;
  if not found then
    insert into public.articulos (tipo, partner_id, estado, autor)
    values ('entrevista', p_partner, 'cuestionario', auth.uid()) returning * into a;
  end if;
  update public.articulos
     set respuestas = p_respuestas, permiso_nombre = coalesce(p_permiso_nombre, false),
         permiso_fotos = coalesce(p_permiso_fotos, false),
         estado = case when p_enviar then 'enviado' else estado end
   where id = a.id;
  return a.id;
end $$;

-- El partner da su visto bueno al texto que hemos escrito, o lo retira
create function public.visto_bueno_articulo(p_articulo uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.articulos;
begin
  select * into a from public.articulos where id = p_articulo for update;
  if not found or a.tipo <> 'entrevista' or not public.es_miembro(a.partner_id) then raise exception 'No encontrado'; end if;
  if a.estado <> 'propuesto' then raise exception 'El artículo no está esperando tu visto bueno'; end if;
  if not a.permiso_nombre then raise exception 'Falta tu permiso para publicar con vuestro nombre'; end if;
  update public.articulos set ok_partner_en = now() where id = p_articulo;
end $$;

-- Publicar o retirar: solo un administrador. Retirar lo puede pedir también el
-- partner, que siempre puede quitar su entrevista de la web.
create function public.publicar_articulo(p_articulo uuid, p_publicar boolean)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.articulos;
begin
  select * into a from public.articulos where id = p_articulo for update;
  if not found then raise exception 'No encontrado'; end if;
  if p_publicar then
    if not public.es_admin() then raise exception 'Solo un administrador publica'; end if;
    update public.articulos set estado = 'publicado', publicado_en = coalesce(publicado_en, now()), publicado_por = auth.uid()
     where id = p_articulo;
  else
    if not (public.es_admin() or (a.partner_id is not null and public.es_miembro(a.partner_id))) then
      raise exception 'No puedes retirar este artículo';
    end if;
    update public.articulos set estado = 'retirado' where id = p_articulo;
  end if;
end $$;

-- --- Agenda ---------------------------------------------------------------------

create table public.agenda (
  id uuid primary key default gen_random_uuid(),
  -- Sin partner: una acción nuestra
  partner_id uuid references public.partners (id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 3 and 120),
  descripcion text check (descripcion is null or length(descripcion) <= 2000),
  categoria text not null default 'otro' check (categoria in (
    'vino', 'gastronomia', 'taller', 'castells', 'cultura', 'naturaleza', 'musica', 'otro')),
  fecha_inicio date not null,
  fecha_fin date,
  -- Se repite cada año en las mismas fechas (la vendimia, la calçotada)
  cada_ano boolean not null default false,
  hora_inicio time,
  hora_fin time,
  plazas_min integer check (plazas_min is null or plazas_min > 0),
  plazas_max integer check (plazas_max is null or plazas_max > 0),
  -- Interno: no sale nunca en la web. Sin IVA salvo que diga lo contrario.
  precio numeric(10, 2) check (precio is null or precio >= 0),
  precio_unidad text check (precio_unidad is null or precio_unidad in ('persona', 'grupo', 'hora')),
  iva_incluido boolean not null default false,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'aprobada', 'rechazada', 'retirada', 'sustituida')),
  -- Un cambio en una acción aprobada es una propuesta nueva que la sustituye
  sustituye uuid references public.agenda (id),
  nota_revision text,
  revisado_por uuid references auth.users (id),
  revisado_en timestamptz,
  autor uuid references auth.users (id) default auth.uid(),
  creado_en timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio),
  check (fecha_fin is null or fecha_fin - fecha_inicio <= 92),
  check (plazas_min is null or plazas_max is null or plazas_max >= plazas_min)
);
create index agenda_fecha_idx on public.agenda (fecha_inicio) where estado = 'aprobada';
create index agenda_partner_idx on public.agenda (partner_id, creado_en desc);

alter table public.agenda enable row level security;
revoke all on public.agenda from anon, authenticated;
grant select, insert on public.agenda to authenticated;

create policy "lee su agenda" on public.agenda for select to authenticated
  using ((select public.es_admin()) or (partner_id is not null and public.es_miembro(partner_id)));
-- El partner propone; el administrador puede añadir las suyas ya aprobadas
create policy "propone acciones" on public.agenda for insert to authenticated
  with check (
    ((select public.es_admin()) and revisado_por is null)
    or (partner_id is not null and public.es_miembro(partner_id) and estado = 'propuesta'
        and revisado_por is null and revisado_en is null and nota_revision is null
        and autor = (select auth.uid())
        and (sustituye is null or exists (select 1 from public.agenda x where x.id = sustituye and x.partner_id = agenda.partner_id))));

create function public.revisar_accion(p_accion uuid, p_aprobar boolean, p_nota text default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.agenda;
begin
  if not public.es_admin() then raise exception 'Solo un administrador revisa acciones'; end if;
  select * into a from public.agenda where id = p_accion for update;
  if not found or a.estado <> 'propuesta' then raise exception 'La acción no está pendiente'; end if;
  update public.agenda
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         nota_revision = nullif(trim(p_nota), ''), revisado_por = auth.uid(), revisado_en = now()
   where id = p_accion;
  if p_aprobar and a.sustituye is not null then
    update public.agenda set estado = 'sustituida' where id = a.sustituye and estado = 'aprobada';
  end if;
end $$;

-- El partner retira una acción suya (propuesta o ya en la agenda)
create function public.retirar_accion(p_accion uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.agenda;
begin
  select * into a from public.agenda where id = p_accion for update;
  if not found or not (public.es_admin() or (a.partner_id is not null and public.es_miembro(a.partner_id))) then
    raise exception 'No encontrado';
  end if;
  if a.estado not in ('propuesta', 'aprobada') then raise exception 'La acción ya no está activa'; end if;
  update public.agenda set estado = 'retirada' where id = p_accion;
end $$;

revoke execute on function public.articulo_al_cambiar() from public, anon, authenticated;
revoke execute on function public.guardar_entrevista(uuid, jsonb, boolean, boolean, boolean),
                           public.visto_bueno_articulo(uuid),
                           public.publicar_articulo(uuid, boolean),
                           public.revisar_accion(uuid, boolean, text),
                           public.retirar_accion(uuid) from public, anon;
grant execute on function public.guardar_entrevista(uuid, jsonb, boolean, boolean, boolean),
                          public.visto_bueno_articulo(uuid),
                          public.publicar_articulo(uuid, boolean),
                          public.revisar_accion(uuid, boolean, text),
                          public.retirar_accion(uuid) to authenticated;
