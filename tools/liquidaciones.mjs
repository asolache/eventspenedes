#!/usr/bin/env node
/* =============================================================================
   Liquidaciones desde la venta de un evento

     node tools/liquidaciones.mjs <eventos/<id>.json> [--partner proveedor=codigo …]

   Escribe en la salida el SQL que deja en public.liquidaciones las líneas de
   la venta que factura un partner (flujo «proveedor»). Se puede repetir: la
   misma línea se actualiza, no se duplica. Nunca pasan las comisiones ni lo
   nuestro, ni las notas internas de la venta. Sin importe, va a null.
   ========================================================================== */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const texto = v => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const numero = v => (typeof v === 'number' && Number.isFinite(v) ? String(v) : 'null');
const dia = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `'${v}'` : 'null');

/* Las filas, sin SQL: lo que verá cada partner */
export function lineasLiquidacion(ev, id, mapa = {}) {
  const fecha = ev.evento?.fecha || ev.fecha || null;
  return (ev.venta?.lineas || [])
    .filter(l => l.flujo === 'proveedor' && l.proveedor && l.concepto)
    .map(l => ({
      partner: mapa[l.proveedor] || l.proveedor,
      evento: id,
      fecha,
      concepto: String(l.concepto).slice(0, 300),
      factura: 'partner',
      importe: typeof l.importe === 'number' ? l.importe : null,
      iva_incluido: l.iva_incluido === true,
      facturado_en: l.facturado_en || null,
      cobrado_en: l.cobrado_en || null,
    }));
}

export function sqlLiquidaciones(filas) {
  return filas.map(f => `insert into public.liquidaciones (partner_id, evento, fecha, concepto, factura, importe, iva_incluido, facturado_en, cobrado_en)
select id, ${texto(f.evento)}, ${dia(f.fecha)}, ${texto(f.concepto)}, ${texto(f.factura)}, ${numero(f.importe)}, ${f.iva_incluido}, ${dia(f.facturado_en)}, ${dia(f.cobrado_en)}
from public.partners where codigo = ${texto(f.partner)}
on conflict (partner_id, evento, concepto) do update set fecha = excluded.fecha, factura = excluded.factura,
  importe = coalesce(excluded.importe, liquidaciones.importe), iva_incluido = excluded.iva_incluido,
  facturado_en = coalesce(excluded.facturado_en, liquidaciones.facturado_en),
  cobrado_en = coalesce(excluded.cobrado_en, liquidaciones.cobrado_en), actualizada_en = now();`).join('\n');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [ruta, ...resto] = process.argv.slice(2);
  if (!ruta) { console.error('Uso: node tools/liquidaciones.mjs <evento.json> [--partner proveedor=codigo …]'); process.exit(2); }
  const mapa = {};
  for (let i = 0; i < resto.length; i++) {
    if (resto[i] === '--partner') { const [a, b] = (resto[++i] || '').split('='); if (a && b) { mapa[a] = b; } }
  }
  const filas = lineasLiquidacion(JSON.parse(readFileSync(ruta, 'utf8')), basename(ruta, '.json'), mapa);
  console.log(filas.length ? sqlLiquidaciones(filas) : '-- Ninguna línea de partner en esta venta.');
}
