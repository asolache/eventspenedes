-- El recordatorio de la víspera, a cada persona interesada del evento
--
-- Cada evento tiene sus personas interesadas: el cliente, el espacio, cada
-- proveedor. A todas les tiene que llegar lo mínimo: un correo unas 24 h
-- antes, en horario laboral, con el lugar, la hora y la previsión del tiempo,
-- y un botón «Recibido» que deja constancia de que lo han leído.
--
-- La función netlify/functions/recordatorios.mjs prepara cada correo en
-- correos_salida como «borrador», con su hora de salida en enviar_en. Álvaro
-- lo lee entero en el hilo y, con su OK, pasa a «programado»; a su hora, la
-- misma función lo pasa a «aprobado» y sale como cualquier otro. Lo escriben
-- las sesiones de Claude y las funciones con la clave de servicio; nadie lo
-- lee desde la web: el botón «Recibido» pasa por netlify/functions/rebut.mjs.

-- 1 · Quién tiene que saber de cada evento. `canal` deja sitio a WhatsApp,
--     que aún no se usa: hoy todo sale por correo.
create table public.evento_interesados (
  id uuid primary key default gen_random_uuid(),
  evento_id text not null references public.eventos_cliente (id) on delete cascade,
  rol text not null check (rol in ('cliente', 'espacio', 'proveedor', 'equipo')),
  nombre text not null check (length(nombre) between 1 and 120),
  correo text check (correo is null or (correo = lower(correo) and position('@' in correo) > 1)),
  idioma text not null default 'es' check (idioma in ('es', 'ca', 'en')),
  canal text not null default 'correo' check (canal in ('correo', 'whatsapp')),
  notas text[] not null default '{}',   -- líneas propias de su recordatorio («los pañuelos los llevamos nosotros»)
  creado_en timestamptz not null default now(),
  unique (evento_id, correo)
);

-- 2 · Cada aviso que sale y si lo han recibido. La clave va en el enlace del
--    botón: sin ella no se marca nada.
create table public.avisos_evento (
  id uuid primary key default gen_random_uuid(),
  evento_id text not null references public.eventos_cliente (id) on delete cascade,
  interesado_id uuid not null references public.evento_interesados (id) on delete cascade,
  tipo text not null default 'recordatorio_24h' check (tipo in ('recordatorio_24h')),
  correo_id uuid references public.correos_salida (id) on delete set null,
  clave text not null unique default replace(gen_random_uuid()::text, '-', '') check (clave ~ '^[a-f0-9]{32}$'),
  enviar_en timestamptz not null,
  recibido_en timestamptz,
  creado_en timestamptz not null default now(),
  unique (interesado_id, tipo)
);
create index avisos_evento_evento_idx on public.avisos_evento (evento_id);

alter table public.evento_interesados enable row level security;
alter table public.avisos_evento enable row level security;
create policy "admin gestiona interesados" on public.evento_interesados for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin gestiona avisos" on public.avisos_evento for all to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));

grant all on public.evento_interesados to service_role;
grant all on public.avisos_evento to service_role;
grant select, insert, update, delete on public.evento_interesados to authenticated;  -- solo el admin, por la política
grant select on public.avisos_evento to authenticated;                                -- el tablero ve quién lo ha recibido

-- 3 · Un correo con hora de salida. «programado»: aprobado por Álvaro, espera
--    a su hora. El disparador de envío no cambia: solo mira «aprobado».
alter table public.correos_salida add column enviar_en timestamptz;
alter table public.correos_salida drop constraint correos_salida_estado_check;
alter table public.correos_salida add constraint correos_salida_estado_check
  check (estado in ('borrador', 'programado', 'aprobado', 'enviando', 'enviado', 'error'));
