-- =============================================================================
-- Liquidaciones: lo que el partner ha facturado y cobrado por cada evento
--
-- Sale de la venta del evento (tools/liquidaciones.mjs la convierte en filas),
-- no de un programa de facturación: si mañana se cambia B2Brouter por otro,
-- esto no cambia. Solo las líneas del partner. Nunca comisiones ni márgenes:
-- es su dato, según su acuerdo.
-- El partner la lee; la escribe administración.
-- =============================================================================

create table public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  evento text not null check (evento ~ '^[a-z0-9-]{3,80}$'),
  fecha date,
  concepto text not null check (length(concepto) between 1 and 300),
  factura text not null default 'partner' check (factura in ('partner', 'nosotros')),
  importe numeric(10, 2) check (importe is null or importe >= 0),
  iva_incluido boolean not null default false,
  facturado_en date,
  cobrado_en date,
  nota text check (nota is null or length(nota) <= 500),
  actualizada_en timestamptz not null default now(),
  unique (partner_id, evento, concepto)
);
create index liquidaciones_partner_idx on public.liquidaciones (partner_id, fecha desc);
alter table public.liquidaciones enable row level security;

create policy "lee sus liquidaciones" on public.liquidaciones for select to authenticated
  using ((select public.es_admin()) or public.es_miembro(partner_id));
create policy "admin escribe liquidaciones" on public.liquidaciones for insert to authenticated
  with check ((select public.es_admin()));
create policy "admin cambia liquidaciones" on public.liquidaciones for update to authenticated
  using ((select public.es_admin())) with check ((select public.es_admin()));
revoke all on public.liquidaciones from anon, authenticated;
grant select, insert, update on public.liquidaciones to authenticated;

comment on table public.liquidaciones is
  'Por partner y evento: concepto, quién factura al cliente, importe sin IVA (salvo iva_incluido), cuándo se facturó y cuándo se cobró. Sin comisiones.';
