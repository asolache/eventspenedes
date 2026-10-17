-- =============================================================================
-- Su lugar en la red: el rol del partner en el flujo de valor de la red
--
-- { estado: 'propuesta' | 'aprobada', rol, aporta: [..], recibe: [..], para: [..] }
-- Lo escribe administración (la política «admin gestiona partners» ya lo
-- limita); la página pública solo lo enseña cuando está aprobado y la ficha
-- está autorizada. Texto público: nada de precios, comisiones ni proyectos
-- internos.
-- =============================================================================

alter table public.partners add column red jsonb
  check (red is null or (jsonb_typeof(red) = 'object' and red->>'estado' in ('propuesta', 'aprobada')));

comment on column public.partners.red is
  'Su lugar en la red (rol, qué aporta, qué recibe, para quién). Público solo con estado aprobada.';
