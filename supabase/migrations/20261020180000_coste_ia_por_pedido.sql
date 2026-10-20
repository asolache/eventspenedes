-- Coste de la IA por pedido · lo que gasta cada cliente, venga de donde venga
--
-- La respuesta preparada a un pedido ya se anota en `uso_ia` con su trato de
-- Zoho. Lo que faltaba: cuando un proveedor nos manda su propuesta o su
-- catálogo para ese pedido y la IA lo lee, la importación también es coste de
-- ese cliente. `importaciones` gana el mismo par zoho_modulo / zoho_id, y la
-- vista suma las dos tablas por registro de Zoho para el margen del evento.
-- Sin datos personales: solo el id del trato.

alter table public.importaciones add column zoho_modulo text, add column zoho_id text;
create index importaciones_zoho_idx on public.importaciones (zoho_id) where zoho_id is not null;
create index uso_ia_zoho_idx on public.uso_ia (zoho_id) where zoho_id is not null;

create view public.coste_ia_por_registro with (security_invoker = true) as
select zoho_modulo, zoho_id,
       count(*) as llamadas,
       sum(tokens_entrada) as tokens_entrada,
       sum(tokens_salida) as tokens_salida,
       sum(tokens_cache) as tokens_cache,
       sum(coste_usd) as coste_usd,
       max(creado_en) as ultima
from (
  select zoho_modulo, zoho_id, tokens_entrada, tokens_salida, tokens_cache, coste_usd, creado_en from public.uso_ia
  union all
  select zoho_modulo, zoho_id, tokens_entrada, tokens_salida, tokens_cache, coste_usd, creado_en from public.importaciones
) t
where zoho_id is not null
group by zoho_modulo, zoho_id;
