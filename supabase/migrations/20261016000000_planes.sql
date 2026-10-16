-- El plan de cada partner en el canal: ficha (gratis), página o web propia.
-- Lo cambia solo administración; el partner lo ve y pide el cambio en la
-- conversación. Qué incluye cada plan y su cuota están en data/planes.json.
alter table public.partners
  add column if not exists plan text not null default 'ficha'
    constraint partners_plan_valido check (plan in ('ficha', 'pagina', 'web')),
  add column if not exists plan_desde date,
  add column if not exists tester boolean not null default false;

comment on column public.partners.plan is 'Plan del canal: ficha, pagina o web (data/planes.json)';
comment on column public.partners.tester is 'Uno de los primeros partners que prueban los planes con la oferta de lanzamiento';
