/* =============================================================================
   Events Penedès — qué ha cambiado en un texto, palabra a palabra

   Como un diff de GitHub: lo que se quita va en rojo y tachado y lo que se
   añade, en verde. Sin DOM, para poder probarlo en Node.
   ========================================================================== */

const MAX = 250000; // por encima, tokens × tokens, se marca el valor entero

/* Trozos de a y b: [{t:'=', s}] iguales, [{t:'-', s}] solo en a, [{t:'+', s}] solo en b */
export function diffPalabras(a, b) {
  a = a === undefined || a === null ? '' : String(a);
  b = b === undefined || b === null ? '' : String(b);
  if (a === b) { return a ? [{ t: '=', s: a }] : []; }
  const x = a.split(/(\s+)/).filter(Boolean);
  const y = b.split(/(\s+)/).filter(Boolean);
  if (!x.length || !y.length || x.length * y.length > MAX) {
    return [a && { t: '-', s: a }, b && { t: '+', s: b }].filter(Boolean);
  }
  // Subsecuencia común más larga, desde el final
  const n = x.length, m = y.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  const out = [];
  const poner = (t, s) => {
    const u = out[out.length - 1];
    if (u && u.t === t) { u.s += s; } else { out.push({ t, s }); }
  };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { poner('=', x[i]); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { poner('-', x[i++]); }
    else { poner('+', y[j++]); }
  }
  while (i < n) { poner('-', x[i++]); }
  while (j < m) { poner('+', y[j++]); }
  return out;
}

/* Un espacio entre dos trozos marcados se marca con ellos: una sola franja */
function juntar(trozos, t) {
  const out = [];
  for (const p of trozos) {
    const u = out[out.length - 1];
    if (u && u.t === p.t) { u.s += p.s; continue; }
    const v = out[out.length - 2];
    if (p.t === t && u && u.t === '=' && !u.s.trim() && v && v.t === t) { out.pop(); v.s += u.s + p.s; continue; }
    out.push({ ...p });
  }
  return out;
}

/* Las dos columnas: «antes» sin lo añadido y «ahora» sin lo quitado */
export const lados = trozos => ({
  antes: juntar(trozos.filter(p => p.t !== '+'), '-'),
  ahora: juntar(trozos.filter(p => p.t !== '-'), '+'),
});
