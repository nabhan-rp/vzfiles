import type { PagesContext, PagesFunction } from '../types';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function resolveVerifiedSub(context: PagesContext, auth0Domain: string): Promise<string | null> {
  const authHeader = context.request.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const edgeCache =
    typeof caches !== 'undefined'
      ? (caches as unknown as { default?: Cache }).default
      : undefined;
  let cacheKey: Request | null = null;

  if (edgeCache) {
    try {
      const tokenHash = await sha256Hex(`${auth0Domain}:${token}`);
      cacheKey = new Request(`https://vault-auth-cache.vz.internal/v1/${tokenHash}`);
      const cached = await edgeCache.match(cacheKey);
      if (cached) {
        const parsed = (await cached.json()) as { sub?: string };
        if (typeof parsed.sub === 'string' && parsed.sub.trim()) {
          return parsed.sub.trim();
        }
      }
    } catch {
      cacheKey = null;
    }
  }

  const userinfoRes = await fetch(`https://${auth0Domain}/userinfo`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!userinfoRes.ok) {
    return null;
  }

  const userInfo = (await userinfoRes.json()) as { sub?: string };
  const sub = typeof userInfo.sub === 'string' && userInfo.sub.trim() ? userInfo.sub.trim() : null;
  if (!sub) return null;

  if (edgeCache && cacheKey) {
    const cacheRes = new Response(JSON.stringify({ sub }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=120',
      },
    });
    const writePromise = edgeCache.put(cacheKey, cacheRes).catch(() => {});
    if (typeof context.waitUntil === 'function') {
      context.waitUntil(writePromise);
    } else {
      await writePromise;
    }
  }

  return sub;
}

export const onRequestGet: PagesFunction = async (context) => {
  const auth0Domain = context.env.AUTH0_DOMAIN || 'accounts.vz.gay';
  const sub = await resolveVerifiedSub(context, auth0Domain);
  if (!sub) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (context.env.DB) {
    try {
      const row = await context.env.DB.prepare(
        'SELECT profiles_json, active_profile_id, updated_at FROM user_vaults WHERE sub = ?'
      )
        .bind(sub)
        .first<{ profiles_json: string; active_profile_id: string | null; updated_at: string }>();

      const profiles = row ? JSON.parse(row.profiles_json || '[]') : [];
      return jsonResponse({
        synced: true,
        backend: 'd1',
        profiles: Array.isArray(profiles) ? profiles : [],
        activeProfileId: row?.active_profile_id ?? null,
        updatedAt: row?.updated_at ?? null,
      });
    } catch {
      // Fallback to KV if table not yet migrated
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      const stored = (await context.env.PORTAL_KV.get(`vault:${sub}`, 'json')) as {
        profiles?: unknown[];
        activeProfileId?: string | null;
        updatedAt?: string;
      } | null;

      return jsonResponse({
        synced: true,
        backend: 'kv',
        profiles: Array.isArray(stored?.profiles) ? stored.profiles : [],
        activeProfileId: stored?.activeProfileId ?? null,
        updatedAt: stored?.updatedAt ?? null,
      });
    } catch {
      // Fall through
    }
  }

  return jsonResponse({
    synced: false,
    reason: 'no-binding',
    profiles: [],
    activeProfileId: null,
  });
};

export const onRequestPut: PagesFunction = async (context) => {
  const auth0Domain = context.env.AUTH0_DOMAIN || 'accounts.vz.gay';
  const sub = await resolveVerifiedSub(context, auth0Domain);
  if (!sub) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    profiles?: unknown[];
    activeProfileId?: string | null;
  };
  const profiles = Array.isArray(body.profiles) ? body.profiles.slice(0, 50) : [];
  const activeProfileId =
    typeof body.activeProfileId === 'string' ? body.activeProfileId : null;
  const updatedAt = new Date().toISOString();

  if (context.env.DB) {
    try {
      await context.env.DB.prepare(
        `INSERT INTO user_vaults (sub, profiles_json, active_profile_id, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(sub) DO UPDATE SET
           profiles_json = excluded.profiles_json,
           active_profile_id = excluded.active_profile_id,
           updated_at = excluded.updated_at`
      )
        .bind(sub, JSON.stringify(profiles), activeProfileId, updatedAt)
        .run();

      return jsonResponse({ synced: true, backend: 'd1', updatedAt });
    } catch {
      // Fallback to KV if D1 table isn't migrated
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      await context.env.PORTAL_KV.put(
        `vault:${sub}`,
        JSON.stringify({ profiles, activeProfileId, updatedAt })
      );
      return jsonResponse({ synced: true, backend: 'kv', updatedAt });
    } catch {
      // Fall through
    }
  }

  return jsonResponse({
    synced: false,
    reason: 'no-binding',
  });
};
