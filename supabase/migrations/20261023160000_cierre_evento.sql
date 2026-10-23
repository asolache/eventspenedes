-- El cierre del evento: gracias, fotos y permiso para publicarlas
--
-- El día laborable siguiente a cada evento, a cada persona interesada le
-- llega un correo de agradecimiento (al cliente, con la propuesta de una
-- llamada de repaso) que le pide las fotos. El enlace /fotos/<clave> deja
-- subirlas y marcar si nos autoriza a publicarlas: esa autorización queda
-- aquí con su texto exacto, su hora y quién la dio, y se puede retirar.
--
-- Como el recordatorio de la víspera, netlify/functions/recordatorios.mjs
-- prepara cada correo como «borrador» en correos_salida; no sale nada sin el
-- OK de Álvaro en el hilo. La nota de Zoho y el cobro del 25 % pendiente (la
-- factura del 100 % ya se emitió al confirmar) se proponen en cierres_evento y las hace una sesión de Claude con su OK.
-- Nadie lee estas tablas desde la web: todo pasa por netlify/functions/fotos.mjs.

-- 1 · El aviso de cierre es otro tipo de aviso, con su propia clave
alter table public.avisos_evento drop constraint avisos_evento_tipo_check;
alter table public.avisos_evento add constraint avisos_evento_tipo_check
  check (tipo in ('recordatorio_24h', 'cierre'));

-- 2 · El cierre de cada evento: lo que falta por hacer tras los correos.
--     `automatico = false`: el cierre se hizo a mano y la función no prepara nada.
create table public.cierres_evento (
  evento_id text primary key references public.eventos_cliente (id) on delete cascade,
  automatico boolean not null default true,
  nota_zoho text,                    -- propuesta de nota de éxito para el trato
  nota_zoho_en timestamptz,          -- escrita en Zoho, con el OK de Álvaro
  cobro_final_en timestamptz,        -- cobrado el 25 % que faltaba de la factura
  notas text,
  creado_en timestamptz not null default now()
);

-- 3 · Cada foto que llega por /fotos/<clave>, en el cubo privado fotos-evento
create table public.fotos_evento (
  id uuid primary key default gen_random_uuid(),
  evento_id text not null references public.eventos_cliente (id) on delete cascade,
  aviso_id uuid not null references public.avisos_evento (id) on delete cascade,
  ruta text not null unique check (ruta ~ '^[a-z0-9-]+/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|heic|heif)$'),
  nombre_original text check (nombre_original is null or length(nombre_original) <= 200),
  tipo text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  bytes integer not null check (bytes between 1 and 20971520),
  subida_en timestamptz,             -- null: se pidió el enlace de subida pero no llegó
  creado_en timestamptz not null default now()
);
create index fotos_evento_evento_idx on public.fotos_evento (evento_id);
create index fotos_evento_aviso_idx on public.fotos_evento (aviso_id);

-- 4 · Cada autorización para publicar, tal como se dio. No se borra ni se
--     cambia: retirarla apunta revocada_en, y una nueva es otra fila.
create table public.autorizaciones_fotos (
  id uuid primary key default gen_random_uuid(),
  evento_id text not null references public.eventos_cliente (id) on delete cascade,
  aviso_id uuid not null references public.avisos_evento (id) on delete cascade,
  firmante text not null check (length(firmante) between 2 and 120),
  en_nombre_de text check (en_nombre_de is null or length(en_nombre_de) <= 160),
  alcance text[] not null default '{}' check (alcance <@ array['web', 'redes', 'nombre']),
  personas_de_acuerdo boolean not null,
  version text not null,             -- la versión del texto aceptado (netlify/portal/cierre.mjs)
  texto text not null,               -- el texto exacto que vio, en su idioma
  texto_sha256 text not null check (texto_sha256 ~ '^[a-f0-9]{64}$'),
  idioma text not null check (idioma in ('es', 'ca', 'en')),
  ip_sha256 text check (ip_sha256 is null or ip_sha256 ~ '^[a-f0-9]{64}$'),  -- la IP, solo resumida
  navegador text check (navegador is null or length(navegador) <= 300),
  via text not null default 'web' check (via in ('web', 'correo')),        -- 'correo': respondió con las fotos
  aceptada_en timestamptz not null default now(),
  revocada_en timestamptz,
  check (cardinality(alcance) = 0 or personas_de_acuerdo)
);
create index autorizaciones_fotos_evento_idx on public.autorizaciones_fotos (evento_id);
create index autorizaciones_fotos_aviso_idx on public.autorizaciones_fotos (aviso_id, aceptada_en desc);

alter table public.cierres_evento enable row level security;
alter table public.fotos_evento enable row level security;
alter table public.autorizaciones_fotos enable row level security;
create policy "admin gestiona cierres" on public.cierres_evento for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin ve fotos de eventos" on public.fotos_evento for select to authenticated
  using ((select public.es_admin()));
create policy "admin ve autorizaciones" on public.autorizaciones_fotos for select to authenticated
  using ((select public.es_admin()));

grant all on public.cierres_evento to service_role;
grant all on public.fotos_evento to service_role;
grant select, insert, update on public.autorizaciones_fotos to service_role;   -- nunca delete
grant select, insert, update, delete on public.cierres_evento to authenticated;  -- solo el admin, por la política
grant select on public.fotos_evento to authenticated;                          -- el tablero las lista
grant select on public.autorizaciones_fotos to authenticated;

-- 5 · El cubo de las fotos de los eventos: privado; se sube con un enlace
--     firmado que da la función y solo el admin las ve.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-evento', 'fotos-evento', false, 20971520,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create policy "admin ve fotos-evento" on storage.objects for select to authenticated
  using (bucket_id = 'fotos-evento' and (select public.es_admin()));
