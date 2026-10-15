/* =============================================================================
   Events Penedès · lo que se publica de la ficha de un partner

   La página pública de un espacio o un proveedor (/partners/<código>) sale de
   su ficha aprobada, y solo si la ficha dice `autoriza: si`. De la ficha sale
   únicamente lo que su esquema marca para la web (`destino: 'web'`) y que no
   es interno, ni un precio, ni un dato de contacto: «Sí, sin precios ni datos
   de contacto» es lo que el partner autoriza, y esto es lo que lo cumple.

   De las secciones internas solo sale el nombre y la descripción de cada
   servicio de un proveedor (`PUBLICOS_REPETIDOS`): es lo que ofrece, sin
   cuánto cuesta.
   ========================================================================== */
import { legible, repetido } from './nucleo.mjs';

/* Tipos de campo que nunca se publican: importes, teléfonos, correos, enlaces
   y fechas (las de visita y revisión son nuestras). */
const TIPOS_FUERA = new Set(['eur', 'tel', 'email', 'url', 'date']);

/* Campos que no se publican aunque estén en una sección para la web: la
   dirección exacta, los permisos y lo que solo sirve para trabajar. */
const NOMBRES_FUERA = /(^|_)(direccion|cp|telefono|web|contacto|comision|precio|iva|autoriza|relacion|permiso|pendiente|visita|revision|modelo)(_|$)/;

/* Bloques repetidos de secciones internas que sí tienen parte pública */
const PUBLICOS_REPETIDOS = { servicio: ['nombre', 'duracion', 'incluye'] };

const vale = c => !c.interno && !TIPOS_FUERA.has(c.t) && !NOMBRES_FUERA.test(c.n);

export const autorizada = d => Boolean(d) && d.autoriza === 'si';

/* { nombre, descripcion, poblacion, secciones: [{ titulo, filas: [{ l, v }] , lista? }] } */
export function fichaPublica(esquema, d) {
  if (!autorizada(d)) { return null; }
  const secciones = [];
  for (const s of esquema.SECCIONES) {
    if (s.si && !d[s.si]) { continue; }
    if (s.interno) { continue; }
    if (s.repite) {
      const r = s.repite;
      const publicos = s.destino === 'web' ? r.campos.filter(vale).map(c => c.n) : PUBLICOS_REPETIDOS[r.prefijo];
      if (!publicos) { continue; }
      const lista = [];
      for (let i = 1; i <= r.n; i++) {
        const partes = [];
        for (const c of r.campos.filter(c => publicos.includes(c.n))) {
          const v = c.t === 'checks' ? null : legible(c, d[repetido(r, i, c.n)]);
          if (v) { partes.push({ l: c.l, v }); }
        }
        if (partes.length) { lista.push(partes); }
      }
      if (lista.length) { secciones.push({ titulo: s.destino === 'web' ? s.titulo : 'Servicios', lista }); }
      continue;
    }
    if (s.destino !== 'web') { continue; }
    const filas = [];
    for (const c of s.campos) {
      if (!vale(c) || c.n === 'nombre' || c.n === 'descripcion' || c.n === 'poblacion') { continue; }
      if (c.t === 'checks') {
        const marcadas = Object.entries(c.op).filter(([k]) => d[`${c.n}_${k}`]).map(([, t]) => t);
        if (marcadas.length) { filas.push({ l: c.l, v: marcadas.join(', ') }); }
        continue;
      }
      const v = legible(c, d[c.n]);
      if (v) { filas.push({ l: c.l, v }); }
    }
    if (filas.length) { secciones.push({ titulo: s.titulo, filas }); }
  }
  const texto = n => (typeof d[n] === 'string' && d[n].trim() ? d[n].trim() : null);
  return { nombre: texto('nombre'), descripcion: texto('descripcion'), poblacion: texto('poblacion'), secciones };
}
