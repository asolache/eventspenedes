-- La marca de cada partner: el portal es el paso 2 de todas las marcas.
-- Los valores son los de la regla de la marca de Zoho (eventspenedes-tarifas,
-- tablero/online/red-real.js, MARCAS). Los partners de hoy son de Events Penedès.
-- Aplicada en producción el 22/10/2026 con el sí de Álvaro. Solo añade; se
-- deshace con `alter table public.partners drop column marcas;` y la
-- restricción de tipo como estaba.
alter table public.partners
  add column marcas text[] not null default array['Events Penedès'],
  add constraint partners_marcas_validas check (
    cardinality(marcas) >= 1 and marcas <@ array['Events Penedès', 'TeamTowers']
  );
comment on column public.partners.marcas is 'Marcas del partner, con los valores de la regla de Zoho (Events Penedès, TeamTowers). El portal habla con la suya.';
-- Quien no es espacio ni proveedor: un cliente que sube al paso 2.
alter table public.partners drop constraint partners_tipo_check;
alter table public.partners add constraint partners_tipo_check
  check (tipo = any (array['localizacion', 'proveedor', 'cliente']));
