/* =============================================================================
   Events Penedès · lo que comparten todas las fichas

   Una ficha (la de un espacio, la de un proveedor) es una lista de secciones
   con sus campos. De esa lista sale el formulario (`tools/build-fichas.mjs`),
   la lista blanca de lo que entra, la nota que llega a Zoho y el registro de
   cambios entre un envío y el siguiente. Lo que cambia de una ficha a otra son
   las secciones; cómo se leen, se comparan y se escriben es esto.

   Tipos de campo:
     text · tel · email · url · number · textarea · date
     select    `op` es { valor: texto }. La primera opción vacía es «sin dato»
     sino      sí / no / sin dato. Lo que no se sabe se queda sin dato: no se
               adivina, porque un dato inventado acaba en una propuesta
     checks    casillas; cada una es su propio campo `<n>_<clave>`
     eur       importe en euros, sin IVA salvo que `iva_incluido` diga otra
               cosa. Número y no texto: es lo que permite calcular

   Una sección puede ser:
     · normal, con `campos`
     · condicional, con `si` (el nombre de su casilla) e `interruptor` (su texto)
     · repetida, con `repite: { prefijo, n, campos, etiqueta, leyenda, mas }`:
       el mismo bloque n veces, `<prefijo><i>_<campo>`. Las salas de un
       espacio, los servicios de un proveedor

   `destino` dice a dónde puede ir lo que lleva la sección:
     web      se puede publicar si se autoriza
     zoho     datos de una persona: a Zoho y a ningún repositorio
     interno  precios y condiciones: al repositorio privado, nunca a la web
   `interno: true` en un campo o una sección: solo se ve con `?interno=1`.
   ========================================================================== */

export const SINO = { si: 'Sí', no: 'No' };

/* La unidad de un precio. Los espacios usan las cuatro primeras; un proveedor
   cobra también por actuación, por trayecto o por día. */
export const UNIDAD = { evento: 'por evento', persona: 'por persona', hora: 'por hora', unidad: 'por unidad' };
export const UNIDAD_SERVICIO = { ...UNIDAD, actuacion: 'por actuación', trayecto: 'por trayecto', dia: 'por día', km: 'por km' };

/* La comisión de un paquete o servicio: un porcentaje del precio, o unos euros
   con la misma unidad que el precio. La general, un porcentaje de todo, o
   euros por persona o por evento. La de cada paquete gana a la general. */
export const COMISION_TIPO = { porcentaje: '% del precio', importe: '€ en la unidad del precio' };
export const COMISION_GENERAL = { porcentaje: '% de lo que se contrata', persona: '€ por persona', evento: '€ por evento' };

/* La persona de contacto es igual en todas las fichas, y nunca se publica */
export const CONTACTO = {
  id: 'contacto', titulo: 'Persona de contacto', destino: 'zoho',
  nota: 'Va a Zoho y a ningún otro sitio: no se publica.',
  campos: [
    { n: 'contacto_persona', l: 'Nombre', t: 'text', ac: 'off' },
    { n: 'contacto_cargo', l: 'Cargo', t: 'text', ac: 'off' },
    { n: 'contacto_movil', l: 'Móvil', t: 'tel', ac: 'off' },
    { n: 'contacto_correo', l: 'Correo', t: 'email', ac: 'off' },
  ],
};

export const repetido = (r, i, c) => `${r.prefijo}${i}_${c}`;

/* El valor tal como se lee en una ficha: «Bodega o cava», no «bodega». */
export function legible(campo, v) {
  if (v === undefined || v === null || String(v).trim() === '') { return null; }
  if (campo.t === 'sino') { return SINO[v] || v; }
  if (campo.t === 'select') { return campo.op[v] || v; }
  if (campo.t === 'eur') { return `${String(v).trim()} €`; }
  return String(v).trim();
}

/* Una comisión tal como se lee: «10 %», «4 € por persona», «0, no es
   comisionable». Sin tipo, es un porcentaje. */
export function comisionLegible(d, n) {
  const v = d[n];
  if (v === undefined || v === null || String(v).trim() === '') { return null; }
  const cifra = String(v).trim();
  if (Number(cifra) === 0) { return '0, no es comisionable'; }
  const tipo = d[`${n}_tipo`] || 'porcentaje';
  if (tipo === 'porcentaje') { return `${cifra} %`; }
  if (tipo === 'persona' || tipo === 'evento') { return `${cifra} € por ${tipo}`; }
  const unidad = UNIDAD_SERVICIO[d[n.replace(/comision$/, 'unidad')]];
  return `${cifra} €${unidad ? ' ' + unidad : ''}`;
}
const ES_COMISION = /(^|_)comision$/;
const ES_TIPO_COMISION = /(^|_)comision_tipo$/;

export function cambiosTexto(lista) {
  return lista.map(x => `· ${x.etiqueta}: ${x.antes ?? 'sin dato'} → ${x.ahora ?? 'sin dato'}`).join('\n');
}

/* Las funciones de una ficha concreta, a partir de sus secciones */
export function ficha(SECCIONES) {
  /* Cada nombre de campo con su etiqueta legible y su definición. Las casillas
     (`equipo_proyector`) se leen como «Qué tiene: Proyector». */
  function campos() {
    const m = new Map();
    for (const s of SECCIONES) {
      if (s.si) { m.set(s.si, { campo: { t: 'check' }, l: s.interruptor, s }); }
      if (s.repite) {
        const r = s.repite;
        for (let i = 1; i <= r.n; i++) {
          for (const c of r.campos) { m.set(repetido(r, i, c.n), { campo: c, l: `${r.etiqueta} ${i} · ${c.l}`, s }); }
        }
        continue;
      }
      for (const c of s.campos) {
        if (c.t === 'checks') {
          for (const [k, t] of Object.entries(c.op)) { m.set(`${c.n}_${k}`, { campo: { t: 'check' }, l: `${c.l}: ${t}`, s }); }
        } else { m.set(c.n, { campo: c, l: c.l, s }); }
      }
    }
    return m;
  }

  /* Todos los nombres de campo, en orden. La función lo usa como lista blanca:
     lo que no está aquí no entra en la ficha. */
  const nombres = () => [...campos().keys()];

  /* El registro de cambios: qué campos difieren entre la versión de partida (el
     borrador que les mandamos, o su último envío) y lo que envían ahora. */
  function cambios(antes, ahora) {
    const out = [];
    const leer = (c, v) => (c.campo.t === 'check' ? (v ? 'sí' : null) : legible(c.campo, v));
    for (const [n, c] of campos()) {
      const a = leer(c, antes[n]);
      const b = leer(c, ahora[n]);
      if (a !== b) { out.push({ campo: n, etiqueta: c.l, antes: a, ahora: b }); }
    }
    return out;
  }

  /* Una línea por campo, la comisión y su tipo juntos */
  function filas(lista, d) {
    const out = [];
    for (const c of lista) {
      if (c.t === 'checks') {
        const marcadas = Object.entries(c.op).filter(([k]) => d[`${c.n}_${k}`]).map(([, t]) => t);
        if (marcadas.length) { out.push(`${c.l}: ${marcadas.join(', ')}`); }
        continue;
      }
      if (ES_TIPO_COMISION.test(c.n)) { continue; }
      const v = ES_COMISION.test(c.n) ? comisionLegible(d, c.n) : legible(c, d[c.n]);
      if (v) { out.push(`${c.l}: ${v}`); }
    }
    return out;
  }

  /* La ficha en texto plano, por secciones. Lo que no se rellenó no sale: una
     ficha llena de «—» esconde lo que sí se sabe. */
  function fichaTexto(d) {
    const l = [];
    for (const s of SECCIONES) {
      if (s.si && !d[s.si]) { continue; }
      const out = [];
      if (s.repite) {
        const r = s.repite;
        for (let i = 1; i <= r.n; i++) {
          const nombre = legible(r.campos[0], d[repetido(r, i, r.campos[0].n)]);
          const partes = [];
          for (const c of r.campos.slice(1)) {
            if (ES_TIPO_COMISION.test(c.n)) { continue; }
            const n = repetido(r, i, c.n);
            const v = ES_COMISION.test(c.n) ? comisionLegible(d, n) : legible(c, d[n]);
            if (v) { partes.push(`${c.l}: ${v}`); }
          }
          if (nombre || partes.length) { out.push(`· ${nombre || `${r.etiqueta} ${i}`}${partes.length ? ' — ' + partes.join(' · ') : ''}`); }
        }
      } else {
        out.push(...filas(s.campos, d));
      }
      if (out.length) {
        const marca = s.destino === 'interno' ? ' (interno)' : s.destino === 'zoho' ? ' (no se publica)' : '';
        l.push(`## ${s.titulo}${marca}`, ...out, '');
      }
    }
    return l.join('\n').trim();
  }

  return { campos, nombres, cambios, cambiosTexto, fichaTexto, legible, comisionLegible };
}
