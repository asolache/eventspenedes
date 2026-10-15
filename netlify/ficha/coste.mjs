/* =============================================================================
   Events Penedès · lo que cuesta leer un catálogo con Claude

   Cada importación devuelve cuántos tokens ha gastado (`usage` de la API) y
   con qué modelo. Esto lo pasa a dólares con la tarifa por millón de tokens
   del modelo, para saber cuánto cuesta que un partner importe su web o su PDF.

   Precios de la API de Anthropic (USD por millón de tokens), octubre de 2026.
   Si cambian, se cambian aquí. Un modelo que no está en la tabla da `null`:
   no se adivina un coste.
   ========================================================================== */
export const PRECIOS = {
  'claude-opus-5-5':   { entrada: 4.00, salida: 20.00, cache: 0.20 },
  'claude-opus-5':     { entrada: 5.00, salida: 25.00, cache: 0.50 },
  'claude-opus-4-8':   { entrada: 5.00, salida: 25.00, cache: 0.50 },
  'claude-sonnet-5-5': { entrada: 2.00, salida: 10.00, cache: 0.20 },
  'claude-haiku-5-5':  { entrada: 0.10, salida: 0.50, cache: 0.01 },
};

const n = x => (Number.isFinite(Number(x)) ? Number(x) : 0);

/* `usage` tal como lo devuelve la API. Los tokens que se escriben en caché
   se cobran como entrada (por arriba: la escritura cuesta algo más). */
export function coste(modelo, usage = {}) {
  const p = PRECIOS[modelo];
  const tokens = {
    entrada: n(usage.input_tokens) + n(usage.cache_creation_input_tokens),
    salida: n(usage.output_tokens),
    cache: n(usage.cache_read_input_tokens),
  };
  if (!p) { return { modelo, tokens, usd: null }; }
  const usd = (tokens.entrada * p.entrada + tokens.salida * p.salida + tokens.cache * p.cache) / 1e6;
  return { modelo, tokens, usd: Math.round(usd * 1e5) / 1e5 };
}
