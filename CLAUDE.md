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
