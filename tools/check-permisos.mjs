#!/usr/bin/env node
/* =============================================================================
   Ninguna tabla de public sin permisos explícitos

   Desde el 30/10/2026 Supabase no da permisos por defecto a las tablas y
   vistas nuevas de public. Esta guarda lee las migraciones en orden y falla
   si una tabla o vista que se crea no recibe un GRANT a service_role (las
   funciones del sitio) y una decisión para authenticated: un GRANT, o el
   comentario «-- sin acceso authenticated: <tabla>» si el portal no la usa.
   Plantilla: supabase/plantilla-migracion.sql

   Uso:  node tools/check-permisos.mjs [carpeta]
   ========================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const nombre = s => s.replace(/"/g, '').trim().replace(/^public\./, '');

/* De un conjunto de migraciones (en orden), lo que se crea y lo que se concede */
export function revisar(ficheros) {
  const creadas = new Map();
  const permisos = new Map();
  const dar = (tabla, rol) => {
    if (!permisos.has(tabla)) { permisos.set(tabla, new Set()); }
    permisos.get(tabla).add(rol);
  };
  for (const [fichero, texto] of ficheros) {
    for (const m of texto.matchAll(/--\s*sin acceso authenticated:\s*([\w.]+)/gi)) { dar(nombre(m[1]), 'authenticated'); }
    const sql = texto.replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?(?:materialized\s+)?(table|view)\s+(?:if\s+not\s+exists\s+)?public\.("?\w+"?)/gi)) {
      const t = nombre(m[2]);
      if (!creadas.has(t)) { creadas.set(t, fichero); }
    }
    for (const m of sql.matchAll(/\bgrant\s+[\w\s,]+?\s+on\s+(?!function|all\s|schema|sequence)(?:table\s+)?([\w.",\s]+?)\s+to\s+([\w\s,]+?);/gi)) {
      const tablas = m[1].split(',').map(nombre).filter(Boolean);
      const roles = m[2].split(',').map(r => r.trim().toLowerCase());
      for (const t of tablas) { for (const r of roles) { dar(t, r); } }
    }
  }
  const fallos = [];
  for (const [t, fichero] of creadas) {
    const roles = permisos.get(t) || new Set();
    if (!roles.has('service_role')) { fallos.push(`${t} (${fichero}): falta «grant … on public.${t} to service_role»`); }
    if (!roles.has('authenticated')) { fallos.push(`${t} (${fichero}): falta el grant a authenticated o «-- sin acceso authenticated: ${t}»`); }
  }
  return { creadas: [...creadas.keys()], fallos };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const carpeta = process.argv[2] || new URL('../supabase/migrations', import.meta.url).pathname;
  const ficheros = readdirSync(carpeta).filter(f => f.endsWith('.sql')).sort()
    .map(f => [f, readFileSync(join(carpeta, f), 'utf8')]);
  const { creadas, fallos } = revisar(ficheros);
  if (fallos.length) {
    for (const f of fallos) { console.log(`::error::${f}`); }
    console.log(`\n❌ ${fallos.length} permiso(s) sin conceder. Plantilla: supabase/plantilla-migracion.sql\n`);
    process.exit(1);
  }
  console.log(`✅ Las ${creadas.length} tablas y vistas de public tienen sus permisos escritos.`);
}
