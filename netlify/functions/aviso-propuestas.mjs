/* =============================================================================
   Events Penedès y TeamTowers · aviso si una propuesta lleva cinco días sin respuesta

   Cada mañana mira en Zoho las oportunidades en la etapa de propuesta enviada
   («Cotización de propuesta/precio»). Las que llevan cinco días o más sin
   tocarse reciben una TAREA para Álvaro, para hoy: «Seguir la propuesta: …».
   Zoho la enseña en su lista de tareas y en el aviso de tareas del día.

   · Sin respuesta = nadie ha tocado la oportunidad desde hace N días
     (Modified_Time). Cuando el cliente contesta, se cambia la etapa o se
     anota algo y el reloj vuelve a cero.
   · No avisa dos veces seguidas: si ya hay una tarea de seguimiento de esa
     oportunidad creada en los últimos N días, no crea otra. Si pasan otros N
     días sin respuesta, vuelve a avisar.
   · Solo propuestas vivas: la fecha de cierre (la del evento) no ha pasado y
     se tocó en los últimos 90 días. Las de 2019 que siguen en esa etapa no
     llenan la lista.
   · Sirve a las dos marcas: el CRM es uno.

   Variables de entorno (opcionales, además de las de Zoho):
     ZOHO_ETAPAS_SEGUIMIENTO   etapas EXACTAS, separadas por comas
                               («Cotización de propuesta/precio»)
     SEGUIMIENTO_DIAS          días sin respuesta (5)
     ZOHO_AVISO_TAREA          '0' para no crear tareas (solo registro)
   ========================================================================== */
import { configurado, zoho, zohoGet } from '../portal/zoho.mjs';

const DIA = 864e5;
export const PREFIJO = 'Seguir la propuesta:';
const VIVA = 90 * DIA;

export const etapas = () => (process.env.ZOHO_ETAPAS_SEGUIMIENTO || 'Cotización de propuesta/precio')
  .split(',').map(s => s.trim()).filter(Boolean);
export const dias = () => Number.parseInt(process.env.SEGUIMIENTO_DIAS || '5', 10) || 5;

/* Pura: de las oportunidades y las tareas de seguimiento, las que toca avisar */
export function porAvisar(tratos, tareas, ahora = new Date(), n = dias()) {
  const t0 = ahora.getTime();
  const hoy = ahora.toISOString().slice(0, 10);
  const recientes = new Set((tareas || [])
    .filter(t => String(t.Subject || '').startsWith(PREFIJO) && t0 - Date.parse(t.Created_Time) < n * DIA)
    .map(t => String(t.What_Id?.id || '')));
  return (tratos || []).filter(d => {
    const quieto = t0 - Date.parse(d.Modified_Time);
    return etapas().includes(d.Stage)
      && quieto >= n * DIA && quieto < VIVA
      && (!d.Closing_Date || d.Closing_Date >= hoy)
      && !recientes.has(String(d.id));
  });
}

export function tarea(d, ahora = new Date(), n = dias()) {
  const quieto = Math.floor((ahora.getTime() - Date.parse(d.Modified_Time)) / DIA);
  return {
    Subject: `${PREFIJO} ${d.Deal_Name}`.slice(0, 200),
    Due_Date: ahora.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }),
    Priority: 'High',
    What_Id: { id: d.id }, $se_module: 'Deals',
    ...(d.Contact_Name?.id ? { Who_Id: { id: d.Contact_Name.id } } : {}),
    Description: [`Lleva ${quieto} días sin respuesta (el aviso salta a los ${n}).`,
      d.Amount ? `Importe: ${d.Amount} € sin IVA.` : '',
      'Una llamada o un correo corto: ¿les llegó?, ¿hay algo que cambiar?, ¿cuándo deciden?',
      'Si contestan, cambia la etapa o anótalo en la oportunidad: el reloj vuelve a cero.'].filter(Boolean).join('\n'),
  };
}

async function buscar(modulo, criterio, campos) {
  const filas = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    const j = await zohoGet(`${modulo}/search?criteria=${encodeURIComponent(criterio)}&fields=${campos}&per_page=200&page=${pagina}`);
    filas.push(...(j.data || []));
    if (!j.info?.more_records) { break; }
  }
  return filas;
}

export async function avisar(ahora = new Date()) {
  /* En los criterios de Zoho, los paréntesis y las comas del valor van escapados */
  const partes = etapas().map(e => `(Stage:equals:${e.replace(/[(),]/g, m => `\\${m}`)})`);
  const criterio = partes.length > 1 ? `(${partes.join('or')})` : partes[0];
  const tratos = await buscar('Deals', criterio, 'Deal_Name,Stage,Amount,Closing_Date,Modified_Time,Contact_Name');
  const tareas = await buscar('Tasks', `(Subject:starts_with:${PREFIJO.replace(/:$/, "")})`, 'Subject,What_Id,Created_Time');
  const lista = porAvisar(tratos, tareas, ahora);
  if (process.env.ZOHO_AVISO_TAREA === '0' || !lista.length) { return { revisadas: tratos.length, avisos: lista.length, creadas: 0 }; }
  const j = await zoho('Tasks', { data: lista.map(d => tarea(d, ahora)) });
  return { revisadas: tratos.length, avisos: lista.length, creadas: (j.data || []).filter(x => x.status === 'success').length };
}

export default async () => {
  if (!configurado()) { console.log('Sin credenciales de Zoho: no se revisan las propuestas.'); return; }
  try {
    const r = await avisar();
    /* Sin nombres de cliente en el registro: solo cuántas */
    console.log(`Propuestas sin respuesta: ${r.avisos} de ${r.revisadas}; tareas creadas: ${r.creadas}`);
  } catch (e) {
    console.error('No se pudieron revisar las propuestas:', e.message);
  }
};

/* Cada día a las 7:00 UTC (8:00 o 9:00 en Madrid) */
export const config = { schedule: '0 7 * * *' };
