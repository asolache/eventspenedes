/* =============================================================================
   Las entradas de clientes de otras marcas

   acceso.teamtowershuma.com sirve el mismo sitio, pero solo para entrar al
   portal: lo de la red (fichas, blog, agenda) no se enseña desde ahí.
   ========================================================================== */
export const ENTRADAS = ['acceso.teamtowershuma.com'];

/* Si se llega por una entrada de cliente, al portal; si no, nada */
export const alPortal = req => ENTRADAS.includes(new URL(req.url).hostname)
  ? new Response(null, { status: 302, headers: { Location: '/acceso' } })
  : null;
