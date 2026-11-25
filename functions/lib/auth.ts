import type { PagesContext } from '../types';

export function jsonResponse(data: unknown, status = 200): Response {
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

export async function resolveVerifiedSub(
  context: PagesContext,
  auth0Domain: string
): Promise<string | null> {
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
