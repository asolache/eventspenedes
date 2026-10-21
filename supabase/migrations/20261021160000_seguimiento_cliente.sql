-- El enlace de seguimiento de un evento, sin entrar
--
-- El cliente abre desde el correo /seguimiento/<id>/<clave> y ve cómo van sus
-- propuestas sin pedir el enlace de acceso. La clave es aleatoria, una por
-- evento: el enlace se revoca cambiándola. Lo sirve netlify/functions/
-- seguimiento.mjs con la clave de servicio y solo enseña el título, la fecha,
-- las personas y las propuestas (sin precios).

alter table public.eventos_cliente
  add column clave text not null default replace(gen_random_uuid()::text, '-', '')
  check (clave ~ '^[a-f0-9]{32}$');
