/* =============================================================================
   Prueba de «Tu día» y «Tu semana en la red» (js/portal-dia.js)

   Lo que importa: que lo de los eventos en curso salga siempre arriba, que lo
   que espera al partner diga cuándo vence, que de la ficha salga una sola
   mejora, que la semana se compare bien con la anterior y que el tiempo de
   respuesta cuente desde cada petición hasta su primera respuesta.

   Uso:  node tools/test-dia.mjs
   ========================================================================== */
import { tuDia, tuSemana, tiempoRespuesta, mensajeSinContestar, cuantoFalta, vence, duracion } from '../js/portal-dia.js';

let fallos = 0;
const comprueba = (nombre, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${nombre}`);
  if (!cond) { fallos++; }
};
console.log('\nPrueba de «Tu día» y «Tu semana»\n');

const HOY = '2026-11-14';
const YO = 'socio';
const reservas = [
  { id: 'r1', titulo: 'Comida · 40', estado: 'confirmada', fecha: '2026-11-16', personas: 40 },
  { id: 'r2', titulo: 'Taller · 20', estado: 'solicitada', fecha: '2026-12-11', responder_antes: '2026-11-15' },
  { id: 'r3', titulo: 'Visita · 10', estado: 'solicitada', fecha: '2026-12-01', responder_antes: '2026-11-14' },
  { id: 'r4', titulo: 'Cena · 80', estado: 'confirmada', fecha: '2027-02-01' },
  { id: 'r5', titulo: 'Pasada', estado: 'solicitada', fecha: '2026-11-01' },
  { id: 'r6', titulo: 'Brunch', estado: 'alternativa', fecha: '2026-12-05' },
];
const mensajes = [
  { tipo: 'comentario', autor: YO, texto: 'Hola', interno: false, creado_en: '2026-11-10T09:00:00Z' },
  { tipo: 'comentario', autor: 'admin', texto: '¿Tenéis fotos de la sala?', interno: false, creado_en: '2026-11-12T09:00:00Z' },
  { tipo: 'nota_interna', autor: 'admin', texto: 'interna', interno: true, creado_en: '2026-11-13T09:00:00Z' },
];
const mejoras = [['Subir fotos', 'ficha'], ['Autorizar la página', 'ficha']];
const dia = tuDia({ hoy: HOY, reservas, mensajes, yo: YO, porFirmar: 1, mejoras });

comprueba('lo primero es el evento en curso', dia[0].texto === 'Comida · 40' && dia[0].capa === 0);
comprueba('el evento en curso dice cuánto falta y las personas', dia[0].detalle === 'Faltan 2 días · 16/11 · 40 personas' && dia[0].tono === 'oro');
comprueba('un evento a más de 14 días no sale en el día', !dia.some(f => f.texto === 'Cena · 80'));
comprueba('una reserva de fecha pasada no se pide contestar', !dia.some(f => f.texto.includes('Pasada')));
const r3 = dia.findIndex(f => f.texto === 'Contestar: Visita · 10');
const r2 = dia.findIndex(f => f.texto === 'Contestar: Taller · 20');
comprueba('lo que vence antes va antes', r3 > 0 && r3 < r2);
comprueba('lo que vence hoy va en rojo', dia[r3].tono === 'error' && dia[r3].detalle.startsWith('Contesta hoy'));
comprueba('la propuesta del partner sale como espera, sin contar como pendiente', dia.find(f => f.texto.includes('Brunch'))?.espera === true);
comprueba('el mensaje nuestro sin contestar sale', dia.some(f => f.vista === 'conversacion' && f.detalle.includes('fotos de la sala')));
comprueba('el acuerdo por firmar sale', dia.some(f => f.vista === 'acuerdo'));
const ultima = dia[dia.length - 1];
comprueba('de la ficha sale una sola mejora, al final', dia.filter(f => f.capa === 2).length === 1 && ultima.texto === 'Subir fotos' && ultima.detalle.includes('queda 1 más'));
comprueba('las capas van en orden', dia.every((f, i) => i === 0 || dia[i - 1].capa <= f.capa));

comprueba('si el último mensaje es mío, nada que contestar', mensajeSinContestar([...mensajes, { tipo: 'comentario', autor: YO, creado_en: '2026-11-13T10:00:00Z' }], YO) === null);
comprueba('una nota interna no cuenta como mensaje', mensajeSinContestar([mensajes[0], mensajes[2]], YO) === null);
comprueba('un día vacío no tiene filas', tuDia({ hoy: HOY, yo: YO }).length === 0);

comprueba('cuánto falta: hoy y mañana', cuantoFalta(HOY, HOY) === 'Es hoy' && cuantoFalta(HOY, '2026-11-15') === 'Es mañana');
comprueba('vence: pasado, mañana y sin fecha', vence(HOY, '2026-11-10').tono === 'error' && vence(HOY, '2026-11-15').tono === 'aviso' && vence(HOY, null).texto === null);

const v7 = { vistas: 30, clientes: 1, reservas: 0, confirmadas: 2 };
const v14 = { vistas: 50, clientes: 1, reservas: 0, confirmadas: 2 };
const s = Object.fromEntries(tuSemana(v7, v14).map(([t, v, nota, tono]) => [t, { v, nota, tono }]));
comprueba('visitas: 30 esta semana frente a 20, sube 10', s['Visitas a tu página'].v === 30 && s['Visitas a tu página'].nota === '▲ 10 frente a la semana pasada' && s['Visitas a tu página'].tono === 'ok');
comprueba('clientes: 1 frente a 0', s['Clientes por tu enlace'].nota === '▲ 1 frente a la semana pasada');
comprueba('reservas: 0 y 0 no dice que baja', s['Reservas pedidas'].nota === 'esta semana');
comprueba('sin datos de la semana, sin cifras', tuSemana(null, v14).length === 0);
comprueba('la semana no enseña importes', tuSemana(v7, v14).every(([t]) => !/€|comisi/i.test(t)));

const charla = [
  { sobre: 'reserva', ref: 'a', tipo: 'reserva_solicitada', creado_en: '2026-11-01T08:00:00Z' },
  { sobre: 'reserva', ref: 'a', tipo: 'reserva_confirmada', creado_en: '2026-11-01T10:00:00Z' },
  { sobre: 'reserva', ref: 'b', tipo: 'reserva_solicitada', creado_en: '2026-11-02T08:00:00Z' },
  { sobre: 'reserva', ref: 'b', tipo: 'reserva_alternativa', creado_en: '2026-11-02T11:00:00Z' },
  { sobre: 'reserva', ref: 'b', tipo: 'reserva_modificada', creado_en: '2026-11-03T08:00:00Z' },
  { sobre: 'reserva', ref: 'b', tipo: 'reserva_confirmada', creado_en: '2026-11-04T08:00:00Z' },
  { sobre: 'reserva', ref: 'c', tipo: 'reserva_solicitada', creado_en: '2026-11-05T08:00:00Z' },
];
const t = tiempoRespuesta(charla);
comprueba('tres respuestas (2 h, 3 h y 24 h), mediana 3 h', t.n === 3 && t.mediana === 3 && t.rapido === true);
comprueba('lo que no se ha contestado no cuenta', tiempoRespuesta(charla.slice(6)).n === 0);
comprueba('desde una fecha solo cuenta lo de después', tiempoRespuesta(charla, '2026-11-02T00:00:00Z').n === 2);
comprueba('lento no tiene sello', tiempoRespuesta(charla.slice(4, 6)).rapido === false);
comprueba('la duración se lee', duracion(0.5) === '30 min' && duracion(3) === '3 h' && duracion(72) === '3 días' && duracion(null) === '—');

console.log(fallos ? `\n✗ ${fallos} fallo${fallos > 1 ? 's' : ''}\n` : '\n✓ Todo bien\n');
process.exit(fallos ? 1 : 0);
