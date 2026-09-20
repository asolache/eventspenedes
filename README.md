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
├── gracias.html        Confirmación tras enviar el formulario
├── 404.html            Página de error
├── netlify.toml        Publicación, cabeceras y redirección de www
├── robots.txt
├── sitemap.xml
├── css/styles.css      Hoja de estilos única (tokens Antigravity)
├── js/i18n.js          Traducciones CA / ES / EN + navegación móvil
└── assets/
    ├── favicon.svg
    └── og-image.png    Imagen para redes sociales (1200×630)
```

## Idiomas

El HTML está escrito en castellano. `js/i18n.js` guarda un diccionario de catalán
e inglés y sustituye los nodos con `data-i18n`. Para tocar un texto:

1. En castellano → edita directamente el `index.html`.
2. En catalán o inglés → edita la clave correspondiente en `js/i18n.js`.

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

Usa **Netlify Forms**: el formulario lleva `data-netlify="true"`, un campo oculto
`form-name` y un honeypot `bot-field`. Netlify lo detecta en el despliegue y guarda
los envíos en `Site configuration → Forms`.

Para recibir aviso por correo: `Forms → Form notifications → Add notification →
Email notification`, con la dirección de destino. La dirección **no aparece en el
repositorio ni en el HTML**: queda solo en la configuración de Netlify.

El enlace de correo visible en la web se compone en el navegador (`js/i18n.js`,
función `revealMail`) a partir de una cadena codificada, de modo que los
recolectores de direcciones que no ejecutan JavaScript no la leen.

## Dominio

En Netlify: `Domain management → Add a domain → eventspenedes.com`.

**Opción A — nameservers de Netlify (recomendada).** En el registrador, sustituir los
servidores de nombres por los cuatro `dnsX.p0X.nsone.net` que indique Netlify. El
certificado HTTPS y el `www` se configuran solos.

**Opción B — mantener el DNS del registrador.** Crear estos registros:

| Tipo  | Nombre | Valor                          |
|-------|--------|--------------------------------|
| A     | `@`    | `75.2.60.5`                    |
| CNAME | `www`  | `<nombre-del-sitio>.netlify.app.` |

La propagación tarda de minutos a 24 h. Cuando termine, activar **HTTPS →
Verify DNS configuration** para emitir el certificado de Let's Encrypt.

## Pendiente antes de dar la web por definitiva

- Fotografías reales de La Masia y del Taller de Castells.
- Datos concretos de los espacios: dirección, aforo, accesos, aparcamiento.
- Notificación por correo de Netlify Forms configurada hacia el buzón definitivo.
- Aviso legal, política de privacidad y cookies si se añade analítica.

---

© 2026 Events Penedès · Un proyecto de TeamTowers Humà
