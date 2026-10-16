/* Events Penedès — totales de las liquidaciones de un partner, sin DOM para poder probarlos */

/* Solo cuenta lo que tiene importe; lo que no, se cuenta aparte */
export function resumenLiquidaciones(filas) {
  const con = filas.filter(f => f.importe !== null && f.importe !== undefined);
  const suma = l => l.reduce((s, f) => s + Number(f.importe), 0);
  return {
    eventos: new Set(filas.map(f => f.evento)).size,
    facturado: suma(con.filter(f => f.facturado_en)),
    cobrado: suma(con.filter(f => f.cobrado_en)),
    por_cobrar: suma(con.filter(f => f.facturado_en && !f.cobrado_en)),
    sin_importe: filas.length - con.length,
  };
}
