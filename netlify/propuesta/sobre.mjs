/* =============================================================================
   GENERADO · no editar aquí.

   Copia de tools/lib/sobre.mjs del repositorio privado
   eventspenedes-tarifas, puesta al día con:

     node tools/sync-web.mjs --web ../eventspenedes

   Se edita allí, donde está el catálogo y donde corren las guardas. Aquí se
   edita y la próxima copia se lo lleva por delante —y la guarda del repositorio
   privado lo dice antes, en CI—.
   ========================================================================== */
/* ---- fin de la cabecera generada ---- */
/* =============================================================================
   Events Penedès · el sobre: un borrador que viaja en su propio enlace

   El borrador de una propuesta lleva el nombre, el correo y el teléfono de un
   cliente. La decisión de dónde guardarlo es, en realidad, la decisión de
   cuánto tiempo se guarda y quién lo borra. Así que **no se guarda**: el
   enlace lleva el evento dentro, comprimido y cifrado, y la clave no sale de
   las variables de entorno.

   Lo que eso resuelve de un golpe:

   - no hay base de datos que proteger, ni copias de seguridad con datos de
     terceros dentro;
   - no hay nada que borrar cuando pasen los 24 meses del aviso de privacidad;
   - el enlace **caduca solo**, porque la caducidad va firmada dentro;
   - y se revoca entero rotando la clave.

   Lo que no resuelve, dicho claro: quien tenga el enlace tiene el borrador
   —como con cualquier enlace privado—, y un enlace así no se publica ni se
   reenvía. Por eso caduca.

   AES-256-GCM: cifra y además autentica. Un byte cambiado en el camino y el
   descifrado falla; no hay «medio sobre» que interpretar.

   El `aad` ata el sobre a su uso: un sobre de borrador no se puede colar
   donde se espere otra cosa, aunque la clave sea la misma.
   ========================================================================== */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';

const AAD = Buffer.from('eventspenedes/borrador/v1');
const VERSION = 'v1';

const b64u = b => Buffer.from(b).toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/* La clave se deriva con sha256 de lo que haya en la variable de entorno. Así
   vale cualquier cadena larga y aleatoria sin pedirle a nadie que cuente 32
   bytes exactos en hexadecimal —que es donde se equivoca uno y acaba con una
   clave de 16—. */
export const clave = secreto => {
  if (!secreto || String(secreto).length < 24) {
    throw new Error('PROPUESTA_SECRET: hacen falta al menos 24 caracteres aleatorios');
  }
  return createHash('sha256').update(String(secreto), 'utf8').digest();
};

/** Mete un objeto en un sobre cifrado que caduca. Devuelve una cadena apta
 *  para una URL. */
export function cerrar(objeto, secreto, segundos = 60 * 60 * 24 * 30) {
  const k = clave(secreto);
  const iv = randomBytes(12);
  const carga = gzipSync(Buffer.from(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + segundos,
    d: objeto,
  }), 'utf8'), { level: 9 });

  const c = createCipheriv('aes-256-gcm', k, iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(carga), c.final()]);
  return [VERSION, b64u(iv), b64u(c.getAuthTag()), b64u(ct)].join('.');
}

/** Abre el sobre. Lanza si la clave no es la suya, si lo han tocado o si ha
 *  caducado — los tres fallos se cuentan igual: el enlace no sirve. */
export function abrir(sobre, secreto) {
  const partes = String(sobre || '').split('.');
  if (partes.length !== 4 || partes[0] !== VERSION) { throw new Error('enlace ilegible'); }
  const [, iv, tag, ct] = partes;

  let json;
  try {
    const d = createDecipheriv('aes-256-gcm', clave(secreto), deB64u(iv));
    d.setAAD(AAD);
    d.setAuthTag(deB64u(tag));
    json = JSON.parse(gunzipSync(Buffer.concat([d.update(deB64u(ct)), d.final()])).toString('utf8'));
  } catch {
    /* Los tres fallos —otra clave, un byte cambiado, un sobre inventado— dan el
       mismo error a posta: no se le dice a quien prueba enlaces en qué se ha
       equivocado, ni queda en el registro un mensaje distinto por cada caso. */
    throw new Error('enlace ilegible');
  }
  if (!json.exp || json.exp * 1000 < Date.now()) { throw new Error('enlace caducado'); }
  return json.d;
}
