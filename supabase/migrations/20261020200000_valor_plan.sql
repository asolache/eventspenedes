-- Lo que el plan le ha dado a un partner en los últimos días
--
-- Una cifra por cosa, sin importes ni costes: visitas y clics de su página,
-- clientes por su enlace, reservas pedidas y confirmadas, y lo que la IA ha
-- hecho por él (catálogos leídos para preparar propuestas y textos de su
-- ficha). Las tablas de la IA solo las lee administración; esta función le da
-- al partner sus recuentos, nunca las filas ni lo que han costado.

create function public.valor_plan(p uuid, dias integer default 30)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(dias, 30), 366)));
begin
  if not (public.es_admin() or public.es_miembro(p)) then raise exception 'No puedes ver esto'; end if;
  return jsonb_build_object(
    'dias', greatest(1, least(coalesce(dias, 30), 366)),
    'vistas', (select coalesce(sum(vistas), 0) from public.impresiones where partner_id = p and dia >= desde::date),
    'clics', (select coalesce(sum(clics), 0) from public.impresiones where partner_id = p and dia >= desde::date),
    'clientes', (select count(*) from public.leads where partner_id = p and creado_en >= desde),
    'reservas', (select count(*) from public.reservas where partner_id = p and creada_en >= desde),
    'confirmadas', (select count(*) from public.reservas where partner_id = p and estado = 'confirmada' and actualizada_en >= desde),
    'propuestas_ia', (select count(*) from public.importaciones where partner_id = p and creado_en >= desde),
    'textos_ia', (select count(*) from public.uso_ia where partner_id = p and creado_en >= desde)
  );
end $$;

revoke all on function public.valor_plan(uuid, integer) from public, anon;
grant execute on function public.valor_plan(uuid, integer) to authenticated;
