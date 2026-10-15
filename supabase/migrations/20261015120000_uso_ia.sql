-- Uso de la IA · cada vez que la plataforma llama a Claude, con lo que cuesta
--
-- Es el contador con el que se mide y, cuando toque, se cobra el uso de la API:
-- qué operación, con qué modelo, cuántos tokens y cuántos dólares, y a qué
-- registro de Zoho o a qué partner se refiere. Sin datos personales: ni nombre,
-- ni correo, ni lo que se escribió. Las importaciones de catálogos siguen en su
-- tabla (`importaciones`); aquí va todo lo demás, empezando por la respuesta
-- preparada a cada petición de la web.
--
-- La escriben las funciones del sitio con la clave de servicio; la lee solo el
-- administrador.

create table public.uso_ia (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  operacion text not null,
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_salida integer not null default 0,
  tokens_cache integer not null default 0,
  coste_usd numeric(10, 5) not null default 0,
  zoho_modulo text,
  zoho_id text,
  partner_id uuid references public.partners (id) on delete set null
);
alter table public.uso_ia enable row level security;
create policy "admin lee el uso de IA" on public.uso_ia for select to authenticated
  using ((select public.es_admin()));
create index uso_ia_fecha_idx on public.uso_ia (creado_en desc);
create index uso_ia_partner_idx on public.uso_ia (partner_id, creado_en desc);
