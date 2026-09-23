# Fotografías

Aquí van las imágenes reales de los espacios. Nombres esperados por la web:

| Fichero                     | Qué es                                       | En uso |
|-----------------------------|----------------------------------------------|--------|
| `cal-segue-porxo.jpg`       | Porche cubierto y era (foto principal)       | Sí     |
| `cal-segue-jardi.jpg`       | Jardín y era con las viñas al fondo          | Sí     |
| `cal-segue-barbacoa.jpg`    | Barbacoa bajo el porche                      | Sí     |
| `cal-segue-vistes.jpg`      | Ventana del porche sobre los campos          | Sí     |
| `taller-castells.jpg`       | El Taller de Castells en uso                 | Falta  |

De Cal Segue solo se muestra el espacio exterior, que es lo que se alquila.

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
