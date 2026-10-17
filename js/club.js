/* =============================================================================
   Events Penedès · el Club

   Una cita con fecha fija cada mes: un evento temático que organiza Events
   Penedès con un partner de la red. La constancia es la fecha: los socios saben cuándo es sin mirar.
   Como mucho 222 socios. El espacio de cada cita se anuncia con la fecha.

   Para cambiar la regla, cambia REGLA: 'primer-sabado', 'ultimo-viernes'.
   ========================================================================== */

export const CLUB = { ano: 2027, plazas: 222, regla: 'primer-sabado',
  // Quién pone la música en las citas
  djs: ['Mazinguer', 'DJ Golfo de Guinea', 'DJ Lady Avocado'],
  // Las músicas de las citas temáticas
  musicas: ['rock català'] };

const REGLAS = {
  'primer-sabado': (ano, mes) => { const d = new Date(Date.UTC(ano, mes, 1)); d.setUTCDate(1 + ((6 - d.getUTCDay() + 7) % 7)); return d; },
  'ultimo-viernes': (ano, mes) => { const d = new Date(Date.UTC(ano, mes + 1, 0)); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - 5 + 7) % 7)); return d; },
};

export const NOMBRE_REGLA = { 'primer-sabado': 'el primer sábado de cada mes', 'ultimo-viernes': 'el último viernes de cada mes' };

/* Las citas del año que todavía no han pasado */
export function citasClub({ ano, regla } = CLUB, dia = new Date().toISOString().slice(0, 10)) {
  const f = REGLAS[regla];
  if (!f) { return []; }
  return Array.from({ length: 12 }, (_, m) => f(ano, m).toISOString().slice(0, 10)).filter(x => x >= dia);
}
