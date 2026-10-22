# Fotos de los espacios aliados

Cedidas por los propios espacios. El nombre dice a qué espacio pertenece cada
una, igual que en `assets/fotos/`.

| Fichero | Qué se ve | Asignación |
|---|---|---|
| `torreblanca-sala.jpg` | Sala de banquete con mesas redondas | Confirmada |
| `torreblanca-galeria.jpg` | Galería de arcos de piedra | Confirmada |
| `torreblanca-piscina.jpg` | Pérgola junto a la piscina | Confirmada |
| `torre-del-gall-jardi-nit.jpg` | Jardín de noche con guirnaldas | Confirmada |
| `torre-del-gall-aeria.jpg` | Vista aérea entre viñedos | Confirmada |
| `torre-del-gall-vinya.jpg` | Viñedo con Montserrat al fondo | Confirmada |
| `bellesguart-facana.jpg` | Fachada con puertas de madera | Confirmada |
| `bellesguart-torre.jpg` | Torre modernista sobre el estanque | Confirmada |
| `bellesguart-menjador.jpg` | Mesa larga bajo lámparas de cristal | Confirmada |
| `dolicios-arbequina.jpg` | Botella de arbequina apoyada en un olivo | Confirmada |
| `albet-i-noya-catering.jpg` | Jardín con mesas redondas y viñas al fondo | Confirmada |
| `albet-i-noya-sala-xarello.jpg` | Sala Xarel·lo con proyector y barricas | Confirmada (Álvaro, 22/10) |
| `albet-i-noya-jardi.jpg` | Mesa larga entre pinos frente a las viñas | Confirmada |
| `albet-i-noya-mur-vinyes.jpg` | Muro de piedra con puerta, cipreses y viñas | Confirmada |
| `albet-i-noya-jardi-taules.jpg` | Mesas redondas en el jardín, a la sombra, con viñas al fondo | Confirmada |
| `albet-i-noya-taula-capvespre.jpg` | Mesa larga al atardecer ante el muro y las viñas | Confirmada |

Las de Albet i Noya las cedió Virginia Vacarisas por correo el 21/10/2026, en
respuesta a nuestra petición de fotos «per publicar-les a la nostra web», y
Álvaro las pasó el 22/10; las dos últimas se bajaron del Drive de su correo
ese mismo día. Reducidas a 1600 px y sin metadatos.

La torre y el comedor se asignaron primero por lectura de la propia imagen —el
comedor es el mismo que se ve por la puerta en `bellesguart-facana.jpg`, y la
torre modernista encaja con el edificio de 1889— y **Álvaro las confirmó el
02/10/2026**. No queda ninguna asignación pendiente de confirmar.

El viñedo con Montserrat estuvo un rato en Bellesguart por error; es de La
Torre del Gall. **La lección: una foto de viña se parece a otra foto de viña.**
Cuando llegue una tanda sin nombre, se pregunta antes de publicarla.

**Antes de publicarlas hace falta el permiso del espacio.** Una foto cedida para
un dossier no está cedida para una web; se pide por escrito, aunque sea un
correo de dos líneas, y se anota aquí quién la cedió y cuándo.

## Provisionales: Albet i Noya

Quedan dos fotos **de su propia web, sin permiso escrito**, porque Virginia no
ha cedido ninguna de visita entre viñas. Cada `<img>` las pide a
`/.netlify/images?url=…` y el Image CDN de Netlify las trae, las reduce a 1200
px y las sirve desde eventspenedes.com; la ruta permitida está en
`netlify.toml`, en `[images]`. Cada una lleva un comentario `PROVISIONAL` con
su origen:

| Origen | Dónde sale |
|---|---|
| `albetinoya.cat/imatges/enotur2020/visita-estandar1.jpg` | Actividad: visita entre viñas |
| `albetinoya.cat/imatges/enotur2020/ruta_vinyes.jpg` | Actividad: maridaje de paisaje |

Si su web cambia una ruta, la foto desaparece. Cuando lleguen fotos cedidas de
la visita, se guardan aquí como `albet-i-noya-*.jpg`, se cambia cada `src`, se
quita el comentario y, cuando no quede ninguna, se borra `[images]`.
