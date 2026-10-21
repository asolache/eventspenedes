# Protocolo de desarrollo · eventspenedes

Repositorio público de la web eventspenedes.com, publicada en Netlify.

## Comunicación

- No narrar exploraciones ni planes intermedios: solo el resumen final de lo
  implementado, en lista breve.

## Despliegues y créditos de Netlify

Cada despliegue a producción (cada merge a `main`) gasta créditos de Netlify;
las previews de PR y de rama son gratis.

- **Se revisa en la preview antes de mergear**, y se le pasa a Álvaro el
  enlace de la preview para que lo mire ahí.
- **Se mergea al momento solo lo que afecta a clientes** (un formulario roto,
  un dato equivocado, una página que un cliente va a abrir). El resto espera
  y entra en tanda, varios PR juntos.
- **Las previews no se desactivan nunca.**

### Las tandas: 13:00 y 20:00

Decidido por Álvaro el 21/10/2026.

- Los PR listos (CI verde) se juntan en una rama `tanda/<AAAA-MM-DD>-<hh>` con
  una sola preview.
- Una hora antes (12:00 y 19:00) se le avisa en el hilo con el enlace de esa
  preview y una línea por PR.
- A la hora se mergean los PR de la tanda, todos seguidos. Lo que no esté
  listo pasa a la siguiente.
- Lo urgente para clientes no espera: sale al momento con su propia preview.
