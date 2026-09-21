# Fotografías

Aquí van las imágenes reales de los espacios. Nombres esperados por la web:

| Fichero                      | Qué es                                  | Tamaño recomendado |
|------------------------------|-----------------------------------------|--------------------|
| `cal-segue-exterior.jpg`    | Exterior de Cal Segue (foto principal) | 1600 × 1000 px     |
| `cal-segue-interior.jpg`    | Interior / espacio de trabajo           | 1600 × 1000 px     |
| `taller-castells.jpg`        | El Taller de Castells en uso            | 1600 × 1000 px     |

Criterios:

- **JPG** para fotografía, calidad 80. Por debajo de 400 KB por imagen.
- Formato apaisado 16:10. La web recorta al centro, así que el motivo principal
  no debe quedar en un borde.
- Con gente trabajando o en actividad mejor que vacío, pero sin caras
  identificables si no hay consentimiento por escrito.
- Nada de marcas de agua ni fotos de banco de imágenes.

Para sustituir el dibujo por la foto, en `index.html` se cambia el bloque
`<div class="venue__media">…</div>` del espacio por:

```html
<div class="venue__media">
  <img src="assets/fotos/cal-segue-exterior.jpg" alt="Exterior de Cal Segue" loading="lazy" width="1600" height="1000">
</div>
```
