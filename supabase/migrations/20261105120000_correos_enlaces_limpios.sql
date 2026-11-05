-- Un correo con un enlace roto no llega ni a borrador
--
-- 5/11/2026: el agradecimiento a Penedès Turisme se quedó en Gmail con
-- «[ÁLVARO: PEGA AQUÍ EL ENLACE A MANO]», y otros borradores llevaban enlaces
-- envueltos en google.com/url, que caducan. La función de envío ya los paraba
-- al enviar (correo-salida/resend.js); ahora la tabla no acepta la fila, así
-- que quien escribe el borrador lo ve al momento y lo corrige antes de que
-- Álvaro lo lea. Misma regla que ENVUELTO y HUECO en resend.js.

alter table public.correos_salida
  add constraint correos_enlaces_limpios check (
    (html || ' ' || texto) !~* 'google\.[a-z.]+/url\?'
    and (html || ' ' || texto) !~* '\[\s*([áa]lvaro|nombre|frase|enlace|link)\M[^]]*\]|pega aqu[íi]'
    and html !~* 'href="http://'
  );
