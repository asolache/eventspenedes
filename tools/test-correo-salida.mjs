/* =============================================================================
   Prueba del envío propio (supabase/functions/correo-salida)

   Lo que importa: que solo salga lo aprobado, que Álvaro vaya siempre en CCO
   y reciba las respuestas, que un enlace envuelto en google.com/url no salga,
   y que una respuesta vaya en el mismo hilo.

   Uso:  node tools/test-correo-salida.mjs
   ========================================================================== */
import { errores, peticion, ALVARO } from '../supabase/functions/correo-salida/resend.js';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};

console.log('\nPrueba del envío propio\n');

const FILA = { estado: 'enviando', para: ['cliente@empresa.example'], cco: [], asunto: 'Vuestra comida',
  html: '<p><a href="https://eventspenedes.com/seguimiento/x/y">Ver</a></p>', texto: 'Ver: https://eventspenedes.com/seguimiento/x/y' };

comprueba('una fila aprobada y bien escrita sale', errores(FILA).length === 0);
comprueba('un borrador no sale', errores({ ...FILA, estado: 'borrador' }).length > 0);
comprueba('un enlace google.com/url no sale', errores({ ...FILA, html: '<a href="https://www.google.com/url?q=https://x">x</a>' }).some(f => f.includes('google.com/url')));
comprueba('un enlace google.com/url en el texto tampoco', errores({ ...FILA, texto: 'Entra en https://www.google.com/url?q=https://eventspenedes.com&sa=E' }).length > 0);
comprueba('un hueco «[ÁLVARO: PEGA AQUÍ EL ENLACE]» no sale', errores({ ...FILA, texto: "Us deixo l'enllaç: [ÁLVARO: PEGA AQUÍ EL ENLACE A MANO]" }).some(f => f.includes('hueco')));
comprueba('un «Hola [nombre]» no sale', errores({ ...FILA, html: '<p>Hola [nombre],</p>' }).some(f => f.includes('hueco')));
comprueba('un enlace con http:// no sale', errores({ ...FILA, html: '<a href="http://eventspenedes.com">web</a>' }).some(f => f.includes('https')));
comprueba('los corchetes normales sí salen', errores({ ...FILA, texto: 'Precio [sin IVA]: 20 €' }).length === 0);
comprueba('un destinatario que no es un correo no sale', errores({ ...FILA, para: ['a@b.example, c@d.example'] }).length > 0);
comprueba('sin destinatario no sale', errores({ ...FILA, para: [] }).length > 0);

const p = peticion(FILA);
comprueba('Álvaro va siempre en CCO y recibe las respuestas', p.bcc.includes(ALVARO) && p.reply_to === ALVARO);
comprueba('sale desde eventspenedes.com', /@eventspenedes\.com>$/.test(p.from));
comprueba('Álvaro no va dos veces en CCO', peticion({ ...FILA, cco: ['ASOLACHE@gmail.com'] }).bcc.length === 1);
comprueba('una respuesta va en el mismo hilo', peticion({ ...FILA, responder_a: '<abc@mail.gmail.com>' }).headers['In-Reply-To'] === '<abc@mail.gmail.com>');
comprueba('el html y el texto pasan tal cual, sin tocar los enlaces', p.html === FILA.html && p.text === FILA.texto);

console.log('');
if (fallos) { console.log(`❌ ${fallos} fallo${fallos > 1 ? 's' : ''}.`); process.exit(1); }
console.log('✅ Solo sale lo aprobado, con Álvaro en CCO y los enlaces intactos.\n');
