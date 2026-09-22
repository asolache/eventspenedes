# eventspenedes.com

Web provisional de **Events Penedès** — producción de eventos, localizaciones y
actividades en el Alt Penedès, para agencias, espacios y empresas finales.

Sitio estático (HTML + CSS + JS vanilla, sin frameworks ni build). Se publica con
Netlify sobre el dominio `eventspenedes.com`.

---

## Estructura

```
/
├── index.html          Landing (one-page, ES por defecto)
├── dj.html             Perfil de Álvaro Solache como DJ
├── 404.html            Página de error
├── netlify.toml        Publicación, cabeceras y redirección de www
├── robots.txt          Acceso de rastreadores, incluidos los de IA
├── llms.txt            Resumen del negocio en texto plano para asistentes de IA
├── site.webmanifest    Nombre, colores e iconos de la aplicación web
├── sitemap.xml
├── css/styles.css      Hoja de estilos única (tokens Antigravity)
├── js/i18n.js          Motor de idiomas, correo protegido y navegación móvil
├── js/lang-home.js     Textos CA / EN de la portada
├── js/lang-dj.js       Textos CA / EN de la página de DJ
├── js/form.js          Envío del formulario por correo
└── assets/
    ├── favicon.svg
    ├── icon-256.png    Icono PNG (favicon alternativo y apple-touch-icon)
    ├── icon-512.png    Icono grande, también usado como logo en los datos estructurados
    ├── og-image.png    Imagen para redes sociales (1200×630)
    └── fotos/          Fotografías de los espacios (ver su propio README)
```

## Idiomas

El HTML de cada página está escrito en castellano. Cada página carga su fichero
`js/lang-<página>.js`, que define `window.EP_I18N` (catalán e inglés) y
`window.EP_META` (título y descripción por idioma); después, `js/i18n.js`
sustituye los nodos con `data-i18n`. Para tocar un texto:

1. En castellano → edita directamente el HTML de la página.
2. En catalán o inglés → edita la clave en el `lang-*.js` de esa página.

Una página nueva necesita su propio `lang-*.js` y cargarlo **antes** de
`js/i18n.js`.

El idioma inicial se detecta del navegador y se recuerda en `localStorage`.

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

Todo vive en el `<head>` de `index.html`:

- Título y descripción por idioma, `canonical`, `author` y `robots` con
  `max-snippet:-1` y `max-image-preview:large`, que es lo que permite a
  buscadores y asistentes citar la página con un fragmento largo.
- Open Graph y Twitter Cards completos, con dimensiones y texto alternativo de
  la imagen, y `og:locale:alternate` para catalán e inglés.
- Un único grafo JSON-LD con `Organization`, `WebSite`, el negocio como
  `ProfessionalService` + `LocalBusiness` con su catálogo de servicios, y una
  ficha `EventVenue` por espacio.
- `js/i18n.js` reescribe título, descripción, Open Graph y Twitter al cambiar de
  idioma, para que lo que se comparte coincida con lo que se está viendo.

Fuera del `<head>`:

- `robots.txt` declara explícitamente el acceso de los rastreadores de IA
  (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Applebot…).
- `llms.txt` resume el negocio en texto plano, que es lo que consumen los
  asistentes cuando no quieren interpretar el maquetado.

Al validar: [Rich Results Test](https://search.google.com/test/rich-results) y
[validator.schema.org](https://validator.schema.org/) para el JSON-LD;
[opengraph.xyz](https://www.opengraph.xyz/) para la tarjeta social.

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
