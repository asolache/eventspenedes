-- Los correos que salen desde nuestro dominio, con los enlaces intactos
--
-- El conector de Gmail reescribe los enlaces a google.com/url y quita fondos
-- e imágenes (21/10/2026). Los correos a clientes y partners salen ahora por
-- Resend desde eventspenedes.com: se escriben aquí como «borrador», Álvaro los
-- lee enteros en el hilo y, con su OK, pasan a «aprobado». Ese cambio, y solo
-- ese, dispara el envío (supabase/functions/correo-salida). Álvaro va siempre
-- en CCO. La escriben las sesiones de Claude con la clave de servicio; nadie
-- la lee desde la web.

create extension if not exists pg_net with schema extensions;

create table public.correos_salida (
  id uuid primary key default gen_random_uuid(),
  para text[] not null check (cardinality(para) between 1 and 10),
  cco text[] not null default array['asolache@gmail.com'],
  asunto text not null check (length(asunto) between 1 and 200),
  html text not null,
  texto text not null,
  responder_a text,                 -- Message-ID del correo al que contesta, para que vaya en el mismo hilo
  estado text not null default 'borrador'
    check (estado in ('borrador', 'aprobado', 'enviando', 'enviado', 'error')),
  aprobado_por text,                -- el mensaje del hilo con el OK de Álvaro
  resend_id text,
  error text,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz
);

-- 1 · RLS siempre. Sin políticas: solo la clave de servicio
alter table public.correos_salida enable row level security;

-- 2 · Permisos
revoke all on public.correos_salida from anon, authenticated;
grant all on public.correos_salida to service_role;
-- sin acceso authenticated: correos_salida

-- 3 · Al aprobarse, se avisa a la función de envío. Solo lleva el id: la
--     función vuelve a leer la fila y solo envía lo que sigue «aprobado»
create function public.correo_aprobado() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform net.http_post(
    url := 'https://kigjhtnwfhbujsotrqiu.supabase.co/functions/v1/correo-salida',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb);
  return new;
end $$;
revoke all on function public.correo_aprobado() from public, anon, authenticated;

create trigger correo_aprobado after insert or update of estado on public.correos_salida
  for each row when (new.estado = 'aprobado') execute function public.correo_aprobado();
