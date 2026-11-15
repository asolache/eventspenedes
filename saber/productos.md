# Productos · lo que Events Penedès ya automatiza

Las funciones de esta web que podrían servir a cualquier otro negocio. La
matriz (`asolache/teamtowershuma`) las lee con `cervell.js --recull` y las
adopta o las descarta; no entran solas al catálogo. **Son propuestas:** sin
precio y por validar con Álvaro. El coste de cada una es el de la IA por
tarea, cuando la usa (`supabase/migrations/20261015120000_uso_ia.sql`).

Al día el 15/11/2026. Solo entra lo que corre hoy en este repositorio, con el
fichero que lo hace. Las seis primeras ya se adoptaron al catálogo el
17/10/2026 (`teamtowershuma/SOS/knowledge/cervell/pujades.json`); aquí se
dice dónde viven ahora. Las demás son candidatas nuevas.

Cada producto es también un lote del x % automatizable del mapa de valor de
un lead: si su mapa tiene ese entregable, ya hay algo que lo hace.

## Producto — Del formulario a la propuesta

Alguien pide un evento en la web y, sin que nadie lo toque, el lead entra en
el CRM sin duplicarse y se monta el borrador de propuesta. El borrador no se
guarda en ninguna base de datos: viaja cifrado dentro del enlace que queda en
la ficha del CRM. Dominio: gestión de proyectos. Adoptado el 17/10/2026.
Aquí: `netlify/functions/lead.mjs`, `netlify/functions/borrador.mjs`,
`netlify/propuesta/`.

## Producto — Tu día en una pantalla

El CRM, la facturación y lo pendiente en un solo tablero que corre en el
ordenador de quien lo usa. Las claves no salen nunca del servidor: el tablero
pide los datos con su propia clave, lee y solo escribe lo de una lista corta
(las facturas, como borrador). Dominio: gestión de proyectos. Adoptado el
17/10/2026. Aquí: `netlify/functions/tablero.mjs`,
`netlify/functions/tablero-b2b.mjs`.

## Producto — La red que se mantiene sola

Cada partner entra en su portal, cuida su ficha, ve sus reservas y acuerdos y
autoriza su página pública. Cada paso y cada comentario quedan en una línea
de tiempo que pasa al CRM. La base de datos decide fila a fila quién ve qué.
Dominio: mapa de valor. Adoptado el 17/10/2026. Aquí: `acceso.html`,
`netlify/functions/portal.mjs`, `js/portal-*.js`,
`supabase/migrations/20261015000000_portal_partners.sql`.

## Producto — Tu catálogo de partners

El directorio público de espacios y proveedores sale solo de las fichas
aprobadas y autorizadas: nadie maqueta páginas a mano. Los campos del
formulario de alta y los de la ficha del CRM salen del mismo esquema.
Dominio: gestión del conocimiento. Adoptado el 17/10/2026. Aquí:
`netlify/functions/partners.mjs`, `tools/build-fichas.mjs`,
`netlify/localizacion/`, `netlify/proveedor/`.

## Producto — Leads ordenados por potencial

Adoptado el 17/10/2026. El enriquecimiento y la priorización de agencias no
viven en este repositorio: se declaran donde corren.

## Producto — Cada uno cobra lo suyo

De la venta de un evento salen las líneas que factura cada partner, sin
duplicarse si se repite, y el partner las ve en su portal. Las comisiones no
pasan nunca al partner. Dominio: contabilidad de valor. Adoptado el
17/10/2026 (nombrado en el catálogo como «Liquidaciones y comisiones por
partner»). Aquí: `tools/liquidaciones.mjs`, `js/portal-liquidaciones.js`,
`supabase/migrations/20261016180000_liquidaciones.sql`.

## Producto — La ficha que se rellena sola

El espacio o el proveedor da su web o su catálogo en PDF y la IA le devuelve
la ficha rellena para que la revise. No guarda nada ni publica: lo que llega
es lo que él envía. Dominio: gestión del conocimiento. Candidato nuevo.
Aquí: `netlify/functions/importar-catalogo.mjs`, `netlify/ficha/importar.mjs`.

## Producto — El cliente ve su evento

El cliente entra con un enlace de su correo y ve el programa con sus horas,
el lugar y lo que aún nos falta de él, y pide lo que necesite en una caja. Lo
que pide nos llega a nosotros, nunca directamente a un partner. Otro enlace
le enseña cómo van las propuestas de cada espacio, sin entrar en ningún
sitio, y se actualiza solo. Dominio: gestión de proyectos. Candidato nuevo.
Aquí: `evento.html`, `js/evento.js`, `tools/evento-cliente.mjs`,
`netlify/functions/seguimiento.mjs`.

## Producto — El aviso de la víspera, con acuse

Cada hora salen los correos ya aprobados que esperaban su momento y los
recordatorios del día siguiente. El de la víspera lleva un botón «Recibido»
que apunta la hora solo con un clic de verdad, no con la visita automática
de un antivirus. Dominio: gestión de proyectos. Candidato nuevo. Aquí:
`netlify/functions/recordatorios.mjs`, `netlify/functions/rebut.mjs`,
`supabase/functions/correo-salida/`.

## Producto — Las fotos del evento, con permiso

Tras el evento, un enlace deja subir las fotos desde el móvil a un almacén
privado y, aparte, dar o negar el permiso para publicarlas. Sin permiso
escrito no se publica ninguna. Dominio: gestión del conocimiento. Candidato
nuevo. Aquí: `netlify/functions/fotos.mjs`,
`supabase/migrations/20261023160000_cierre_evento.sql`.

## Producto — La valoración tras el evento

Un enlace o un QR con el evento lleva a una valoración corta que llega como
formulario. Dominio: mapa de valor (el intangible que devuelve el cliente).
Candidato nuevo. Aquí: `valoracion.html`.

## Producto — El kit en marca blanca

Las agencias reciben los textos del catálogo sin nada que delate quién lo
hace, generados del mismo catálogo que el borrador: nadie los escribe dos
veces. Dominio: mapa de valor. Candidato nuevo. Aquí: `kit-agencias.html`,
`tools/build-kit.mjs`.

## Producto — La agenda y el blog de la red

Las acciones aprobadas de los partners, los eventos del territorio con su
fuente y las entrevistas, en una agenda, un blog, RSS y mapa del sitio,
enlazados a la página de cada partner. Dominio: gestión del conocimiento.
Candidato nuevo. Aquí: `netlify/functions/blog.mjs`,
`js/agenda-territorio.js`, `js/club.js`.

## Producto — Los clics que piden algo, sin cookies

Cuenta cuántas veces se pulsa «Pedir propuesta» o «Reservar una llamada» y en
qué página, sin cookies ni datos de la persona. Dominio: gestión de
proyectos. Candidato nuevo. Aquí: `netlify/functions/clic.mjs`.

## Lo que no se declara aquí

- «Tu red en el mapa» (el mapa por comarcas) se adoptó el 17/10/2026, pero
  hoy no hay en este repositorio un mapa que lo haga: queda pendiente de que
  se diga dónde corre.
- Las tres versiones por idioma (`tools/build-i18n.mjs`) y la navegación
  común (`tools/build-nav.mjs`) son piezas de la matriz o candidatas a serlo,
  no productos para un cliente.
