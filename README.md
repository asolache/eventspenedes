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
├── ca/, en/            Versiones generadas — no se editan a mano
├── tools/build-i18n.mjs  Generador de las versiones por idioma
├── 404.html            Página de error
├── netlify.toml        Publicación, cabeceras y redirección de www
├── robots.txt          Acceso de rastreadores, incluidos los de IA
├── llms.txt            Resumen del negocio en texto plano para asistentes de IA
├── site.webmanifest    Nombre, colores e iconos de la aplicación web
├── sitemap.xml
├── css/styles.css      Hoja de estilos única (tokens Antigravity)
├── js/site.js          Correo protegido, navegación móvil e idioma del formulario
├── js/lang-home.js     Textos CA / EN de la portada (fuente del generador)
├── js/lang-dj.js       Textos CA / EN de la página de DJ (fuente del generador)
├── js/form.js          Envío del formulario por correo
└── assets/
    ├── favicon.svg
    ├── icon-256.png    Icono PNG (favicon alternativo y apple-touch-icon)
    ├── icon-512.png    Icono grande, también usado como logo en los datos estructurados
    ├── og-image.png    Imagen para redes sociales (1200×630)
    ├── og-dj.png       Imagen para redes sociales de la página de DJ
    ├── fotos/          Fotografías de los espacios (ver su propio README)
    ├── dj/             Fotografías y carteles de Álvaro Solache como DJ
    └── partners/       Logotipos de los partners
```

## Idiomas

Cada idioma tiene **su propia URL**, que es lo que los buscadores necesitan para
indexar los tres:

| Idioma     | Portada  | DJ             |
|------------|----------|----------------|
| Castellano | `/`      | `/dj.html`     |
| Catalán    | `/ca/`   | `/ca/dj.html`  |
| Inglés     | `/en/`   | `/en/dj.html`  |

El castellano es la **fuente de verdad**: vive en `index.html` y `dj.html`. Las
traducciones viven en `js/lang-home.js` y `js/lang-dj.js`, como diccionarios de
clave → texto. Las carpetas `ca/` y `en/` se **generan**, no se editan a mano.

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

## Formulario de contacto

No hay servidor ni servicio de formularios: al enviar, `js/form.js` compone un
`mailto:` con los datos y abre el programa de correo de quien escribe, que solo
tiene que pulsar enviar. Cero configuración y cero dependencias.

La dirección de destino **no está en el HTML en claro**: viaja codificada en el
atributo `data-m` del formulario, igual que los enlaces de correo, y se compone
en el navegador.

El correo llega con los campos etiquetados y en el idioma que la persona estaba
viendo. El `<textarea>` tiene `maxlength="1200"` a propósito: algunos clientes
de correo truncan un `mailto:` muy largo, así que es mejor limitarlo de forma
visible que perder texto en silencio.

Si el navegador no tiene cliente de correo asociado no pasa nada visible, así
que tras enviar aparece bajo el formulario una nota con la dirección y el
teléfono.

**Qué tiene de malo esta vía**, para cuando toque decidir: quien use webmail en
el móvil puede acabar en una app que no usa, no queda registro de los envíos en
ninguna parte, y no hay protección antispam. Si el formulario empieza a ser una
vía real de entrada, conviene pasar a **Netlify Forms** (`data-netlify="true"`,
campo oculto `form-name`, honeypot y una notificación por correo en
`Site configuration → Forms`), que además guarda los envíos y avisa igual por
correo. Está en el historial del repositorio, en el commit anterior a este.

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
