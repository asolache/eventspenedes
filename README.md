# eventspenedes.com

Web provisional de **Events Penedès** — producción de eventos, localizaciones y
actividades en el Alt Penedès, para agencias, espacios y empresas finales.

Sitio estático (HTML + CSS + JS vanilla, sin frameworks ni build). Se publica con
Netlify sobre el dominio `eventspenedes.com`.

---

## Estructura

```
/
├── index.html          Landing en castellano (fuente de verdad)
├── dj.html             Perfil de DJ en castellano (fuente de verdad)
├── agencias.html       Programa de agencias y DMC en castellano (fuente de verdad)
├── alta-localizacion.html  Ficha de un espacio, de uso interno (no se indexa)
├── recursos.html       Recursos públicos por temas. La lista se genera de data/recursos.json
├── data/recursos.json  GENERADO · copia de la capa pública del índice del repositorio privado
├── tools/build-recursos.mjs  Generador de la lista de recursos
├── ca/, en/            Versiones generadas — no se editan a mano
├── tools/build-i18n.mjs  Generador de las versiones por idioma
├── 404.html            Página de error
├── netlify.toml        Publicación, cabeceras, URLs limpias y redirección de www
├── netlify/functions/  Las funciones: leads a Zoho y la página del borrador
├── netlify/propuesta/  GENERADO · copia de los módulos del repositorio privado
├── robots.txt          Acceso de rastreadores, incluidos los de IA
├── llms.txt            Resumen del negocio en texto plano para asistentes de IA
├── site.webmanifest    Nombre, colores e iconos de la aplicación web
├── sitemap.xml
├── css/styles.css      Hoja de estilos única (tokens Antigravity)
├── js/site.js          Correo protegido, navegación móvil e idioma del formulario
├── js/lang-home.js     Textos CA / EN de la portada (fuente del generador)
├── js/lang-dj.js       Textos CA / EN de la página de DJ (fuente del generador)
├── js/lang-agencias.js Textos CA / EN de la página de agencias
└── assets/
    ├── favicon.svg
    ├── icon-256.png    Icono PNG (favicon alternativo y apple-touch-icon)
    ├── icon-512.png    Icono grande, también usado como logo en los datos estructurados
    ├── og-image.png    Imagen para redes sociales (1200×630)
    ├── og-dj.png       Imagen para redes sociales de la página de DJ
    ├── arte/           Ilustraciones de marca en SVG, para lo que no hay foto
    ├── fotos/          Fotografías de los espacios (ver su propio README)
    ├── dj/             Fotografías y carteles de Álvaro Solache como DJ
    └── partners/       Logotipos de los partners
```

## Idiomas

Cada idioma tiene **su propia URL**, que es lo que los buscadores necesitan para
indexar los tres:

| Idioma     | Portada  | DJ             | Agencias             |
|------------|----------|----------------|----------------------|
| Castellano | `/`      | `/dj.html`     | `/agencias.html`     |
| Catalán    | `/ca/`   | `/ca/dj.html`  | `/ca/agencias.html`  |
| Inglés     | `/en/`   | `/en/dj.html`  | `/en/agencias.html`  |

El castellano es la **fuente de verdad**: vive en `index.html`, `dj.html` y
`agencias.html`. Las traducciones viven en los `js/lang-*.js`, como diccionarios
de clave → texto. Las carpetas `ca/` y `en/` se **generan**, no se editan a mano.

Para añadir una página nueva basta con registrarla en el array `PAGINAS` de
`tools/build-i18n.mjs`: de ahí sale tanto la generación como la reescritura de
los enlaces internos al idioma correspondiente.

Para tocar un texto:

1. En castellano → edita el HTML y vuelve a generar.
2. En catalán o inglés → edita la clave en el `lang-*.js` y vuelve a generar.

```bash
node tools/build-i18n.mjs
```

El generador traduce los nodos con `data-i18n` y los textos alternativos con
`data-i18n-alt`, cambia el `lang` del documento, pone el título, la descripción
y las etiquetas sociales del idioma, ajusta el `canonical`, convierte las rutas
en absolutas y marca el idioma activo en el conmutador. Si falta alguna clave la
nombra y devuelve código de salida 1, así que se puede encadenar en CI.

Las páginas generadas se **commitean**: no hay paso de build en Netlify.

Cada página declara sus `hreflang` (`es`, `ca`, `en` y `x-default`), y el
conmutador de idioma son enlaces reales, no botones de JavaScript.

## Desarrollo local

No hay build. Basta con servir la carpeta:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Publicación (Netlify)

1. En Netlify: **Add new site → Import an existing project → GitHub** y elegir
   `asolache/eventspenedes`.
2. Build command: *vacío*. Publish directory: `.` (ya lo fija `netlify.toml`).
3. **Deploy**. Cada push a `main` vuelve a publicar automáticamente.

## Formularios

Los tres formularios del sitio —contacto de la portada, alta de agencia
(`agencias.html#alta`) y briefing de propuesta (`propuesta.html`)— van por
**Netlify Forms**: `data-netlify="true"`, campo oculto `form-name`, honeypot y
aviso por correo. El envío queda guardado en Netlify, así que no se pierde nada
si el correo falla.

Antes se componía un `mailto:` en el navegador. Se cambió por una razón concreta:
en un portátil de empresa con webmail, un `mailto:` sin cliente de correo
asociado **no envía nada y no avisa**, así que el lead se perdía sin que nadie se
enterara. Está en el historial, por si hace falta mirarlo.

### De ahí a Zoho, y al borrador de la propuesta

Netlify avisa a `netlify/functions/lead.mjs` en cada envío (*Forms →
Notifications → HTTP POST request*, con el **JWS secret** puesto). La función
comprueba la firma —y también el `sha256` del cuerpo que va dentro del JWS, para
que no valga reenviar un aviso viejo con el cuerpo cambiado—, arma la ficha y la
mete en **Zoho CRM** con `upsert` por correo, así que quien ya escribió no se
duplica.

Y cuando el formulario es el de propuesta hace una segunda cosa: **monta el
borrador de la propuesta** y deja en una nota del lead un enlace privado para leerlo
(`/p?d=…`, que sirve `netlify/functions/borrador.mjs`).

El borrador **no se guarda en ninguna parte**: el evento viaja dentro del propio
enlace, comprimido y cifrado con `PROPUESTA_SECRET`. Es la decisión de
privacidad, no una optimización —un borrador lleva el nombre, el correo y el
teléfono de un cliente, y lo que no se guarda no hay que protegerlo, respaldarlo
ni vaciarlo a los 24 meses—. El enlace caduca solo, porque la caducidad va
firmada dentro, y se revoca entero rotando la clave.

El PDF lo genera **el navegador de quien lo envía**: Chromium no cabe en una
función de Netlify, pero no hace falta. En la página del borrador, «Preparar la
versión para el cliente» abre el documento sin avisos (`&vista=cliente`), se
elige idioma y marca, se retoca el texto en la propia página y «Guardar PDF»
abre el diálogo de imprimir. Los retoques no se guardan en ningún sitio. El
correo que lo lleva adjunto lo escribe una persona.

```
netlify/functions/lead.mjs       del formulario a Zoho, y monta el borrador
netlify/functions/borrador.mjs   sirve la página privada del borrador
netlify/propuesta/*.mjs          GENERADO · copia del repositorio privado
tools/test-lead.mjs              prueba la función de leads
tools/test-borrador.mjs          prueba el borrador: lo que abre y lo que no
```

Lo de `netlify/propuesta/` **no se edita aquí**. Es una copia del repositorio
privado `eventspenedes-tarifas`, que es donde está el catálogo y donde corren
las guardas; allí se edita y se pasa con `node tools/sync-web.mjs --web
../eventspenedes`. Así la página privada y el PDF son literalmente el mismo
documento: si fueran dos códigos, el día que se cambie un párrafo se cambiaría
en uno de los dos.

### La ficha de una localización

`alta-localizacion.html` (`/alta-localizacion`) es la ficha de un espacio:
salas con su aforo por formato, cocina y catering, mobiliario, equipo técnico,
acceso, y los bloques de **visita y cata** y de **alojamiento**, que se abren
solos para bodegas, hoteles y casas rurales. Está pensada para rellenarse
**con el móvil durante la visita**: se guarda sola en el dispositivo, se envía
sin salir de la página y, si no hay cobertura, lo dice y no borra nada.

Los campos **no se editan en el HTML**: salen de
`netlify/localizacion/esquema.mjs` con `node tools/build-localizacion.mjs`, y
la función arma la ficha de Zoho con el mismo esquema. CI falla si el HTML no es
el que sale del esquema.

En Zoho el espacio entra como **cuenta** con las etiquetas «Localización» y su
tipo («Bodega», «Hotel»…), la persona como **contacto** de esa cuenta y la
ficha entera como **nota**. Cada envío deja su nota, así que una segunda visita
no borra la primera. Nada se publica desde aquí: la página pública de un
espacio sale de la ficha **aprobada** en el repositorio privado.

La ficha la puede rellenar **el propio espacio**: lo que rellenamos nosotros
en la visita (la relación y las notas de la visita) solo aparece con
`?interno=1`, y el dispositivo lo recuerda. Las **tarifas** van en números
—todo el espacio por franja, cada sala, por persona según el tamaño del grupo,
suplementos y comisión— para poder calcular franjas de precio más adelante; van
a Zoho y nunca a la web. La **autorización de publicar** la da el espacio en la
propia ficha y entra también como etiqueta («Web autorizada», «Web por
revisar», «Web no autorizada»): es el filtro para pasar una ficha a la web.

Se puede abrir con campos ya rellenos (`/alta-localizacion?nombre=…&tipo=bodega`),
que solo llenan lo vacío y desaparecen de la barra de direcciones.

### Variables de entorno

En *Site configuration → Environment variables*, marcadas como **secretas** y con
alcance que incluya las funciones. No van en el repositorio ni se pegan en un
chat.

| Variable | Qué es |
|---|---|
| `NETLIFY_WEBHOOK_JWS_SECRET` | el mismo secreto que en la notificación del formulario |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | el cliente propio de Zoho |
| `ZOHO_DC` | `eu` o `com`. Por defecto `eu` |
| `ZOHO_LEAD_SOURCE`, `ZOHO_CAMPO_MARCA` | opcionales · un valor y un campo que ya existan en tu Zoho |
| `PROPUESTA_SECRET` | 32 caracteres aleatorios o más. Cierra y abre el enlace del borrador |
| `BORRADOR_DIAS` | opcional · días que vale el enlace. Por defecto 30 |
| `ZOHO_ETIQUETA_LOCALIZACION` | opcional · etiqueta de las cuentas de espacios. Por defecto `Localización` |
| `ZOHO_ETAPA_PROPUESTA` | opcional · nombre EXACTO de la etapa de una oportunidad nueva. Con ella, una petición de propuesta entra como cuenta + contacto + oportunidad, y el borrador cuelga de la oportunidad. Necesita un token con permiso sobre cuentas, contactos, oportunidades y notas. Si Zoho rechaza la oportunidad, entra como lead |

Cambiar una variable **no** aplica hasta el siguiente despliegue.

Si falta `PROPUESTA_SECRET`, el sitio sigue funcionando: entra el lead y llega el
aviso por correo, y lo único que falta es el borrador. Si falta
`NETLIFY_WEBHOOK_JWS_SECRET`, la función **rechaza** los avisos a propósito: un
endpoint abierto es una vía para llenar el CRM de basura.

## Posicionamiento premium

La web se dirige a **agencias, DMC, dirección de empresa y cliente corporate de
gama alta**, y el diseño va antes que el texto: lo primero que se ve es una era
entre viñas, no un listado de servicios.

**El eje es el intangible.** La sección `#intangibles` existe porque lo que se
vende aquí no es el metro cuadrado: es el vino con quien lo elabora, el aceite
recién molido, la masía en privado y la hora dorada sobre la viña. Una sala de
hotel compite en precio; esto no compite con nada.

Los servicios premium —chef de autor, relaciones públicas y protocolo,
microbuses de lujo— van marcados con `.card--premium` y su sello, y entran
también en los datos estructurados como `Service`.

### Las imágenes

Cada sección con contenido visual lleva foto real. Donde no hay fotografía, en
lugar de rellenar con un banco de imágenes genérico hay **ilustración propia en
SVG** (`assets/arte/`), hecha con los tokens de la marca: pesa unos 3 KB,
escala sin pixelarse y no se parece a la web de ningún competidor.

**Una foto mala hace más daño que ninguna foto.** Por eso la fotografía de la
barbacoa, con sillas de plástico apiladas al fondo, no se usa en ninguna parte:
contradice todo lo que dice la página.

## Precios: por qué no están en la web

En la web **no hay ni una tarifa**, y es una decisión, no un olvido:

- Un evento no tiene precio de catálogo. Depende del espacio, de cuánta gente
  va y de la fecha. Un número suelto en una página solo sirve para que te
  comparen mal.
- Las **tarifas de agencia** son precios netos con comisión. Publicarlas es
  enseñárselas al cliente final de esa misma agencia, y a la competencia.

En su lugar, [`agencias.html`](agencias.html) explica **qué puede vender una
agencia** y cómo funciona el alta, y el formulario `#alta` pide los datos para
mandar el catálogo **en PDF, por correo, tras el alta**.

**El PDF no se sube a este repositorio ni al sitio.** Una web estática no puede
proteger un fichero: no hay sesiones ni control de acceso, cualquier ruta es
adivinable, y basta con que alguien comparta el enlace una vez para que acabe
indexado. Lo que no está alojado no se filtra. El PDF se adjunta al correo de
respuesta y vive en el repositorio privado `eventspenedes-tarifas`.

Lo mismo vale para los asistentes de IA: `llms.txt` dice explícitamente que no
hay precios publicados y que el catálogo se pide desde la página de agencias,
para que no se inventen cifras ni insinúen que existe una lista pública.

## Dominio

En Netlify: `Domain management → Add a domain → eventspenedes.com`.

**Opción A — DNS en el registrador (la que usamos).** No hace falta Netlify DNS.
Crear estos dos registros en el panel del registrador, después de borrar cualquier
registro previo de `@` y `www` (páginas de parking incluidas):

| Tipo  | Nombre | Valor                             |
|-------|--------|-----------------------------------|
| A     | `@`    | `75.2.60.5`                       |
| CNAME | `www`  | `<nombre-del-sitio>.netlify.app.` |

Si el registrador soporta `ALIAS` o `ANAME`, es preferible `ALIAS @ →
apex-loadbalancer.netlify.com` en lugar del registro A: sigue a Netlify si cambia
de IP. Nunca un CNAME normal en `@`.

**Opción B — nameservers de Netlify.** Sustituir en el registrador los servidores de
nombres por los cuatro `dnsX.p0X.nsone.net` que indique Netlify. Netlify pasa a
gestionar todo el DNS del dominio, MX de correo incluidos. Si al activarlo aparece
*«A DNS zone for this domain already exists on NS1»*, hay una zona huérfana en NS1
y hay que localizarla (pestaña `Domains` de cada equipo de Netlify) o pedir a
soporte que la libere; la opción A no se ve afectada por ese error.

### Pasos concretos en Porkbun

1. `porkbun.com` → **Domain Management** → `eventspenedes.com` → **DNS**
   (*Edit DNS Records*).
2. **Borrar** los registros que Porkbun crea por defecto y que apuntan a su página
   de parking: `ALIAS` en el host raíz y `CNAME` en el host `*`, ambos hacia
   `pixie.porkbun.com`. Comprobar también que no haya nada en *URL Forwarding*.
3. Crear los dos registros (TTL mínimo de Porkbun: 600):

   | Type  | Host (Subdomain) | Answer                            |
   |-------|------------------|-----------------------------------|
   | ALIAS | *(vacío)*        | `apex-loadbalancer.netlify.com`   |
   | CNAME | `www`            | `<nombre-del-sitio>.netlify.app`  |

   En Porkbun el host vacío significa el dominio raíz; no se escribe `@`.

La propagación tarda de minutos a 24 h. Cuando termine, activar **HTTPS →
Verify DNS configuration** para emitir el certificado de Let's Encrypt y después
**Force HTTPS**.

**Dominio principal:** marcar `eventspenedes.com` como *Primary domain* en Netlify.
El `netlify.toml` ya redirige `www` al dominio raíz; si se marcara `www` como
principal, las dos redirecciones se anularían en bucle.

## SEO y datos estructurados

La consulta objetivo es **eventos de empresa en el Penedès**, y de ahí cuelgan
los servicios: team building, taller de castells, catas, gincanas, DJ y
localizaciones.

En el `<head>` de `index.html`:

- Título y descripción con la consulta delante y los servicios dentro, por
  idioma; `canonical`, `author`, `publisher`.
- `robots` con `max-snippet:-1` y `max-image-preview:large`, que es lo que
  permite a buscadores y asistentes citar la página con un fragmento largo.
- `geo.region` y `geo.placename`, y un `keywords` con los términos reales de
  búsqueda. Google ignora `keywords`; lo leen algún vertical y varios
  asistentes de IA.
- Open Graph y Twitter Cards completos, con dimensiones y texto alternativo.
- Un grafo JSON-LD de trece nodos: `Organization`, `WebSite`, el negocio como
  `ProfessionalService` + `LocalBusiness` (con `keywords`, `containsPlace` y
  catálogo de ofertas), un `Service` por servicio con su `serviceType` y su
  `areaServed`, un `EventVenue` por espacio con fotos y aforo, la `Person` de
  Álvaro Solache con sus nombres artísticos, y un `WebPage` + `FAQPage` con
  las ocho preguntas frecuentes.
- `js/i18n.js` reescribe título, descripción, Open Graph y Twitter al cambiar
  de idioma.

Fuera del `<head>`:

- Una sección de **preguntas frecuentes** visible, que es de donde sale el
  `FAQPage`: el esquema solo vale si la respuesta está en la página.
- `robots.txt` declara el acceso de los rastreadores de IA (GPTBot, ClaudeBot,
  PerplexityBot, Google-Extended, Applebot…).
- `llms.txt` resume el negocio, los términos de búsqueda y las preguntas
  frecuentes en texto plano.
- `sitemap.xml` incluye las imágenes principales con título.

Al validar: [Rich Results Test](https://search.google.com/test/rich-results) y
[validator.schema.org](https://validator.schema.org/) para el JSON-LD;
[opengraph.xyz](https://www.opengraph.xyz/) para la tarjeta social.

**Lo que falta para competir de verdad** por esa consulta: URLs separadas por
idioma con `hreflang` (ahora los tres idiomas comparten una sola URL y Google
indexa la castellana), coordenadas y dirección postal completa para activar la
ficha de Google Maps, una ficha de Google Business Profile, y reseñas reales.

## Pendiente antes de dar la web por definitiva

- Fotografías reales de La Masia y del Taller de Castells.
- Datos concretos de los espacios: dirección, aforo, accesos, aparcamiento.
- Notificación por correo de Netlify Forms configurada hacia el buzón definitivo.
- Coordenadas y dirección exacta de Cal Segue, para añadir `geo` y `PostalAddress`
  completo a los datos estructurados.
- Dar de alta el dominio en Google Search Console y Bing Webmaster Tools, y
  enviar `sitemap.xml`.
- Aviso legal, política de privacidad y cookies si se añade analítica.

---

© 2026 Events Penedès · Un proyecto de TeamTowers Humà
