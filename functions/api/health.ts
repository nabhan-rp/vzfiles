import type { PagesFunction } from '../types';

export const onRequestGet: PagesFunction = async (context) => {
  const d1Bound = Boolean(context.env.DB);
  const kvBound = Boolean(context.env.PORTAL_KV);
  let d1TableReady = false;
  let historyTableReady = false;

  if (context.env.DB) {
    try {
      await context.env.DB.prepare('SELECT 1 FROM user_vaults LIMIT 1').first();
      d1TableReady = true;
    } catch {
      d1TableReady = false;
    }
    try {
      await context.env.DB.prepare('SELECT 1 FROM user_transfer_history LIMIT 1').first();
      historyTableReady = true;
    } catch {
      historyTableReady = false;
    }
  }

  const activeBackend = d1Bound && d1TableReady ? 'd1' : kvBound ? 'kv' : 'local-only';

  return new Response(
    JSON.stringify({
      ok: true,
      service: 'vz-files',
      runtime: 'cloudflare-pages',
      domain: context.env.APP_DOMAIN || 'files.vz.gay',
      vault: {
        d1Bound,
        d1TableReady,
        historyTableReady,
        kvBound,
        activeBackend,
      },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    }
  );
};
