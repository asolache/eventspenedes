/* Events Penedès — la parte del buscador que no toca el DOM, para poder probarla */

/* Sin acentos ni mayúsculas: «cobro» encuentra «Cobrós» y «COBRO» */
export const normal = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/* indice: [{ vista, titulo, texto, peso }] → los que contienen todas las palabras,
   primero las secciones y lo que empieza por lo buscado */
export function buscar(indice, q, max = 8) {
  const palabras = normal(q).split(' ').filter(Boolean);
  if (!palabras.length) { return []; }
  return indice
    .map(e => ({ e, t: normal(e.texto) }))
    .filter(({ t }) => palabras.every(p => t.includes(p)))
    .map(({ e, t }) => ({ ...e, nota: (e.peso || 0) + (t.startsWith(palabras[0]) ? 2 : 0) + (t.length < 60 ? 1 : 0) }))
    .sort((a, b) => b.nota - a.nota)
    .slice(0, max);
}
