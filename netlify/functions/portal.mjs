/* =============================================================================
   Events Penedès · el portal de partners con Zoho

   El portal habla directamente con su base de datos (Supabase), que decide
   fila a fila quién ve y toca qué. Lo único que necesita del servidor es Zoho,
   cuyas credenciales no pueden ir al navegador:

     GET  /api/portal/zoho?partner=<id>   (administrador) la cuenta del partner
                                          en Zoho: datos, tratos, notas y tareas
     GET  /api/portal/zoho?deal=<id>      (administrador) un trato, para pedir
                                          una reserva a partir de él
     GET  /api/portal/zoho?buscar=<texto> (administrador) cuentas por nombre,
                                          para unir un partner a la suya
     POST /api/portal/ia                  (su partner o administración) la IA
                                          del portal: { partner, accion:
                                          'descripcion' } propone el párrafo de
                                          presentación a partir de lo que su
                                          ficha deja publicar. Se apunta lo que
                                          cuesta en uso_ia
     POST /api/portal/sincronizar         cada paso de la conversación (una
                                          reserva confirmada, un comentario, un
                                          acuerdo firmado) pasa a Zoho como nota
                                          del trato o, si no hay, de la cuenta.
                                          Lo que contesta un partner crea además
                                          una tarea para que alguien responda

   Quien llama se identifica con su sesión del portal (Authorization: Bearer).
   Un partner solo puede pasar a Zoho los mensajes de su partner; nunca lee
   nada de Zoho.

   Variables de entorno (en Netlify, nunca en el repositorio): las de Zoho de
   la función de leads, SUPABASE_SECRET_KEY y, opcional, ZOHO_AVISO_TAREA='0'
   para no crear tareas.
   ========================================================================== */
import * as PORTAL from '../portal/supabase.mjs';
import * as ZOHO from '../portal/zoho.mjs';
import { describir } from '../portal/ia.mjs';

const json = (cuerpo, status = 200) => Response.json(cuerpo, { status, headers: { 'cache-control': 'no-store' } });
const ID_ZOHO = /^\d{6,25}$/;

/* Lo que se cuenta en Zoho de cada paso */
const TITULOS = {
  comentario: 'Comentario', nota_interna: 'Nota interna',
  cambio_propuesto: 'Cambio de ficha propuesto', cambio_aprobado: 'Cambio de ficha aprobado', cambio_rechazado: 'Cambio de ficha rechazado',
  acuerdo_propuesto: 'Acuerdo propuesto', acuerdo_aceptado: 'Acuerdo aceptado por el partner', acuerdo_validado: 'Acuerdo validado',
  acuerdo_vigente: 'Acuerdo vigente', acuerdo_rechazado: 'Acuerdo rechazado',
  reserva_solicitada: 'Reserva pedida', reserva_confirmada: 'Reserva confirmada', reserva_alternativa: 'El partner propone otra cosa',
  reserva_rechazada: 'Reserva rechazada', reserva_modificada: 'Reserva cambiada', reserva_cancelada: 'Reserva cancelada',
};
/* Lo que, dicho por el partner, pide que alguien de casa conteste */
const PIDE_RESPUESTA = new Set(['comentario', 'reserva_confirmada', 'reserva_alternativa', 'reserva_rechazada',
  'acuerdo_aceptado', 'acuerdo_rechazado', 'cambio_propuesto']);
const CAMPOS = { titulo: 'Qué', fecha: 'Fecha', hora_inicio: 'Desde', hora_fin: 'Hasta', personas: 'Personas',
  concepto: 'Servicio', importe: 'Importe', version: 'Versión', detalles: 'Detalles' };

export function textoNota(m, { partner, reserva, dePartner }) {
  const l = [];
  if (reserva) { l.push(`Reserva: ${reserva.titulo} · ${reserva.fecha}${reserva.personas ? ` · ${reserva.personas} personas` : ''}`); }
  if (m.texto) { l.push('', m.texto); }
  const datos = Object.entries(m.datos || {}).filter(([k, v]) => CAMPOS[k] && v !== null && v !== '');
  if (datos.length) { l.push('', ...datos.map(([k, v]) => `${CAMPOS[k]}: ${v}`)); }
  l.push('', `${dePartner ? `Lo escribe ${partner.nombre}` : 'Lo escribe Events Penedès'} en el portal de partners, ${m.creado_en}.`);
  return { titulo: `Portal · ${TITULOS[m.tipo] || m.tipo} · ${partner.nombre}`.slice(0, 120), texto: l.join('\n').trim() };
}

async function sincronizar(m, quien) {
  const [partner] = await PORTAL.rest(`partners?select=id,nombre,zoho_account_id&id=eq.${m.partner_id}`);
  const reserva = m.sobre === 'reserva' && PORTAL.esUuid(m.ref)
    ? (await PORTAL.rest(`reservas?select=id,titulo,fecha,personas,zoho_deal_id&id=eq.${m.ref}`))?.[0] : null;
  const destino = reserva?.zoho_deal_id && ID_ZOHO.test(reserva.zoho_deal_id) ? ['Deals', reserva.zoho_deal_id]
    : partner?.zoho_account_id && ID_ZOHO.test(partner.zoho_account_id) ? ['Accounts', partner.zoho_account_id] : null;
  if (!destino) {
    await PORTAL.rest(`mensajes?id=eq.${m.id}`, { method: 'PATCH', body: { zoho_nota_id: 'sin-destino' }, prefer: 'return=minimal' });
    return { id: m.id, zoho: null };
  }
  const dePartner = m.autor ? !(await PORTAL.esAdmin(m.autor)) : false;
  const { titulo, texto } = textoNota(m, { partner, reserva, dePartner });
  const j = await ZOHO.zoho(`${destino[0]}/${destino[1]}/Notes`, { data: [{ Note_Title: titulo, Note_Content: texto }] });
  const nota = j.data?.[0]?.details?.id || 'hecha';
  await PORTAL.rest(`mensajes?id=eq.${m.id}`, { method: 'PATCH', body: { zoho_nota_id: String(nota) }, prefer: 'return=minimal' });
  let tarea = null;
  if (dePartner && PIDE_RESPUESTA.has(m.tipo) && process.env.ZOHO_AVISO_TAREA !== '0') {
    try {
      const t = await ZOHO.zoho('Tasks', { data: [{
        Subject: `Contestar a ${partner.nombre}: ${TITULOS[m.tipo] || m.tipo}`.slice(0, 120),
        Due_Date: new Date().toISOString().slice(0, 10),
        Description: texto.slice(0, 2000),
        What_Id: { id: destino[1] }, $se_module: destino[0],
      }] });
      tarea = t.data?.[0]?.details?.id || null;
    } catch (e) { console.error('La nota está en Zoho, la tarea no:', e.message); }
  }
  console.log(`Portal → Zoho: ${m.tipo} de ${partner.nombre} en ${destino[0]} (${quien})`);
  return { id: m.id, zoho: destino[0], tarea };
}

/* --- Leer de Zoho (solo administración) ---------------------------------- */

const enlace = (modulo, id) => `https://crm.zoho.${ZOHO.dc()}/crm/tab/${modulo}/${id}`;
const filas = j => (Array.isArray(j?.data) ? j.data : []);
const quizas = async p => { try { return await p; } catch (e) { return { error: e.message }; } };

async function cuenta(id) {
  const [c, tratos, notas, tareas] = await Promise.all([
    ZOHO.zohoGet(`Accounts/${id}?fields=Account_Name,Account_Type,Phone,Website,Billing_City,Tag,Description,Owner,Modified_Time`),
    quizas(ZOHO.zohoGet(`Accounts/${id}/Deals?fields=Deal_Name,Stage,Closing_Date,Amount&per_page=20`)),
    quizas(ZOHO.zohoGet(`Accounts/${id}/Notes?fields=Note_Title,Note_Content,Created_Time&per_page=8&sort_by=Created_Time&sort_order=desc`)),
    quizas(ZOHO.zohoGet(`Accounts/${id}/Tasks?fields=Subject,Due_Date,Status&per_page=10`)),
  ]);
  const a = filas(c)[0];
  if (!a) { return null; }
  return {
    id, enlace: enlace('Accounts', id), nombre: a.Account_Name, tipo: a.Account_Type || null,
    telefono: a.Phone || null, web: a.Website || null, poblacion: a.Billing_City || null,
    etiquetas: (a.Tag || []).map(t => t.name), descripcion: a.Description || null,
    responsable: a.Owner?.name || null, modificada: a.Modified_Time || null,
    tratos: filas(tratos).map(t => ({ id: t.id, enlace: enlace('Deals', t.id), nombre: t.Deal_Name, etapa: t.Stage, cierre: t.Closing_Date, importe: t.Amount ?? null })),
    notas: filas(notas).map(n => ({ titulo: n.Note_Title, texto: String(n.Note_Content || '').slice(0, 600), creada: n.Created_Time })),
    tareas: filas(tareas).filter(t => t.Status !== 'Completed').map(t => ({ asunto: t.Subject, vence: t.Due_Date, estado: t.Status })),
    avisos: [tratos, notas, tareas].filter(x => x?.error).map(x => x.error),
  };
}

async function trato(id) {
  const t = filas(await ZOHO.zohoGet(`Deals/${id}?fields=Deal_Name,Stage,Closing_Date,Account_Name`))[0];
  return t ? { id, enlace: enlace('Deals', id), nombre: t.Deal_Name, etapa: t.Stage, cierre: t.Closing_Date, cuenta: t.Account_Name?.name || null } : null;
}

async function buscar(texto) {
  const j = await ZOHO.zohoGet(`Accounts/search?word=${encodeURIComponent(texto)}&fields=Account_Name,Billing_City&per_page=10`);
  return filas(j).map(a => ({ id: a.id, nombre: a.Account_Name, poblacion: a.Billing_City || null }));
}

/* --- La función ---------------------------------------------------------- */

export default async (req) => {
  if (!PORTAL.configurado()) { return json({ error: 'El portal no está configurado' }, 503); }
  const url = new URL(req.url);
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = await PORTAL.usuario(token).catch(() => null);
  if (!u) { return json({ error: 'Entra en el portal' }, 401); }
  const admin = await PORTAL.esAdmin(u.id);

  try {
    if (url.pathname === '/api/portal/zoho' && req.method === 'GET') {
      if (!admin) { return json({ error: 'Solo administración' }, 403); }
      if (!ZOHO.configurado()) { return json({ error: 'Zoho no está configurado en el sitio' }, 503); }
      const p = url.searchParams;
      if (p.has('partner')) {
        if (!PORTAL.esUuid(p.get('partner'))) { return json({ error: 'Partner no válido' }, 400); }
        const [partner] = await PORTAL.rest(`partners?select=zoho_account_id&id=eq.${p.get('partner')}`) || [];
        if (!partner) { return json({ error: 'No existe' }, 404); }
        if (!ID_ZOHO.test(partner.zoho_account_id || '')) { return json({ cuenta: null }); }
        return json({ cuenta: await cuenta(partner.zoho_account_id) });
      }
      if (p.has('deal')) {
        if (!ID_ZOHO.test(p.get('deal'))) { return json({ error: 'Id de trato no válido' }, 400); }
        return json({ trato: await trato(p.get('deal')) });
      }
      if (p.has('buscar')) {
        const q = p.get('buscar').trim();
        if (q.length < 2 || q.length > 60) { return json({ error: 'Escribe entre 2 y 60 letras' }, 400); }
        return json({ cuentas: await buscar(q) });
      }
      return json({ error: 'Falta qué buscar' }, 400);
    }

    if (url.pathname === '/api/portal/ia' && req.method === 'POST') {
      const cuerpo = await req.json().catch(() => ({}));
      if (!PORTAL.esUuid(cuerpo.partner)) { return json({ error: 'Partner no válido' }, 400); }
      if (cuerpo.accion !== 'descripcion') { return json({ error: 'Esa acción no existe' }, 400); }
      if (!admin && !(await PORTAL.esMiembro(u.id, cuerpo.partner))) { return json({ error: 'No es tuyo' }, 403); }
      const [partner] = await PORTAL.rest(`partners?select=id,tipo&id=eq.${cuerpo.partner}`) || [];
      if (!partner) { return json({ error: 'No existe' }, 404); }
      const ficha = await PORTAL.fichaEnCurso(partner.id);
      if (!ficha) { return json({ error: 'Rellena antes tu ficha: la IA escribe a partir de ella' }, 400); }
      let r;
      try { r = await describir(partner.tipo, ficha.datos); } catch (e) {
        console.error('Portal · IA:', e.message);
        return json({ error: e.motivo === 'sin-clave' ? e.message : 'La IA no ha podido escribirlo ahora. Prueba en un rato.' }, 502);
      }
      if (r.uso) {
        await PORTAL.anotar('uso_ia', {
          operacion: 'portal-descripcion', modelo: r.uso.modelo, partner_id: partner.id,
          tokens_entrada: r.uso.tokens.entrada, tokens_salida: r.uso.tokens.salida, tokens_cache: r.uso.tokens.cache,
          coste_usd: r.uso.usd || 0,
        }).catch(e => console.error('Portal · IA · coste:', e.message));
      }
      return json({ descripcion: r.descripcion, falta: r.falta, coste_usd: r.uso?.usd ?? null });
    }

    if (url.pathname === '/api/portal/sincronizar' && req.method === 'POST') {
      if (!ZOHO.configurado()) { return json({ sincronizados: [], aviso: 'Zoho no está configurado' }); }
      const cuerpo = await req.json().catch(() => ({}));
      let pendientes;
      if (cuerpo.mensaje) {
        if (!PORTAL.esUuid(cuerpo.mensaje)) { return json({ error: 'Mensaje no válido' }, 400); }
        pendientes = await PORTAL.rest(`mensajes?select=*&id=eq.${cuerpo.mensaje}&zoho_nota_id=is.null`) || [];
        const m = pendientes[0];
        if (m && !admin && (m.interno || !(await PORTAL.esMiembro(u.id, m.partner_id)))) { return json({ error: 'No es tuyo' }, 403); }
      } else {
        /* Sin mensaje: lo que quede por pasar. Solo administración, y poco
           cada vez para no gastar la cuota de Zoho de golpe. */
        if (!admin) { return json({ error: 'Solo administración' }, 403); }
        pendientes = await PORTAL.rest('mensajes?select=*&zoho_nota_id=is.null&order=creado_en&limit=20') || [];
      }
      const sincronizados = [];
      for (const m of pendientes) {
        try { sincronizados.push(await sincronizar(m, admin ? 'administración' : 'partner')); } catch (e) {
          console.error(`No se pudo pasar a Zoho el mensaje ${m.id}:`, e.message);
          sincronizados.push({ id: m.id, error: 'Zoho no lo aceptó' });
        }
      }
      return json({ sincronizados });
    }

    return json({ error: 'No existe' }, 404);
  } catch (e) {
    console.error('Portal:', e.message);
    return json({ error: 'Algo ha fallado al hablar con Zoho' }, 502);
  }
};

export const config = {
  path: ['/api/portal/zoho', '/api/portal/sincronizar', '/api/portal/ia'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
