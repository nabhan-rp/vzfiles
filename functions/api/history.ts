import { jsonResponse, resolveVerifiedSub } from '../lib/auth';
import type { D1Database, PagesFunction } from '../types';

const MAX_HISTORY_ITEMS = 200;
const HASH_PATTERN = /^[a-zA-Z0-9_-]{2,128}$/;

interface SanitizedHistoryItem {
  hash: string;
  name: string;
  size: number;
  url: string;
  sourceType: 'file' | 'remote';
  isAnonymous: boolean;
  profileId: string | null;
  profileLabel: string;
  path?: string;
  createdAt: string;
}

interface HistoryRow {
  hash: string;
  name: string;
  size: number;
  url: string;
  source_type: string;
  is_anonymous: number;
  profile_id: string | null;
  profile_label: string;
  path: string | null;
  created_at: string;
}

let historyTableBootstrapped = false;

async function ensureHistoryTable(db: D1Database): Promise<void> {
  if (historyTableBootstrapped) return;
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS user_transfer_history (
        sub TEXT NOT NULL,
        hash TEXT NOT NULL,
        name TEXT NOT NULL,
        size INTEGER NOT NULL DEFAULT 0,
        url TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'file',
        is_anonymous INTEGER NOT NULL DEFAULT 1,
        profile_id TEXT DEFAULT NULL,
        profile_label TEXT NOT NULL DEFAULT '',
        path TEXT DEFAULT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (sub, hash)
      )`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_transfer_history_sub_created
       ON user_transfer_history (sub, created_at DESC)`
    )
    .run();
  historyTableBootstrapped = true;
}

function sanitizeSafeUrl(rawUrl: unknown, hash: string): string {
  const fallback = `https://vikingfile.com/f/${encodeURIComponent(hash)}`;
  if (typeof rawUrl !== 'string') return fallback;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'https:') {
      return parsed.toString().slice(0, 500);
    }
  } catch {
    // fallback below
  }
  return fallback;
}

function sanitizeIsoDate(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) {
    const time = Date.parse(raw);
    if (Number.isFinite(time)) {
      return new Date(time).toISOString();
    }
  }
  return new Date().toISOString();
}

function sanitizeHistoryItem(raw: unknown): SanitizedHistoryItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const hash = typeof obj.hash === 'string' ? obj.hash.trim() : '';
  if (!HASH_PATTERN.test(hash)) return null;

  const rawName = typeof obj.name === 'string' ? obj.name.trim() : '';
  const name = (rawName || hash).slice(0, 255);
  const rawSize = Number(obj.size);
  const size = Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 0;
  const sourceType: 'file' | 'remote' = obj.sourceType === 'remote' ? 'remote' : 'file';
  const profileId =
    typeof obj.profileId === 'string' && obj.profileId.trim()
      ? obj.profileId.trim().slice(0, 80)
      : null;
  const isAnonymous =
    typeof obj.isAnonymous === 'boolean' ? obj.isAnonymous : profileId === null;
  const profileLabel =
    typeof obj.profileLabel === 'string' ? obj.profileLabel.trim().slice(0, 120) : '';
  const rawPath = typeof obj.path === 'string' ? obj.path.trim().slice(0, 255) : '';

  return {
    hash,
    name,
    size,
    url: sanitizeSafeUrl(obj.url, hash),
    sourceType,
    isAnonymous,
    profileId: isAnonymous ? null : profileId,
    profileLabel,
    path: rawPath || undefined,
    createdAt: sanitizeIsoDate(obj.createdAt),
  };
}

function mapRowToItem(row: HistoryRow): SanitizedHistoryItem {
  return {
    hash: row.hash,
    name: row.name,
    size: Number(row.size) || 0,
    url: sanitizeSafeUrl(row.url, row.hash),
    sourceType: row.source_type === 'remote' ? 'remote' : 'file',
    isAnonymous: Boolean(row.is_anonymous),
    profileId: row.profile_id || null,
    profileLabel: row.profile_label || '',
    path: row.path || undefined,
    createdAt: row.created_at,
  };
}

async function listD1History(db: D1Database, sub: string): Promise<SanitizedHistoryItem[]> {
  const { results } = await db
    .prepare(
      `SELECT hash, name, size, url, source_type, is_anonymous, profile_id, profile_label, path, created_at
       FROM user_transfer_history
       WHERE sub = ?
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(sub, MAX_HISTORY_ITEMS)
    .all<HistoryRow>();

  return (results || []).map(mapRowToItem);
}

export const onRequestGet: PagesFunction = async (context) => {
  const auth0Domain = context.env.AUTH0_DOMAIN || 'accounts.vz.gay';
  const sub = await resolveVerifiedSub(context, auth0Domain);
  if (!sub) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (context.env.DB) {
    try {
      await ensureHistoryTable(context.env.DB);
      const items = await listD1History(context.env.DB, sub);
      return jsonResponse({
        synced: true,
        backend: 'd1',
        items,
        updatedAt: items[0]?.createdAt ?? null,
      });
    } catch {
      // Fallback to KV
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      const stored = (await context.env.PORTAL_KV.get(`history:${sub}`, 'json')) as {
        items?: unknown[];
        updatedAt?: string | null;
      } | null;
      const items = Array.isArray(stored?.items)
        ? stored.items
            .map(sanitizeHistoryItem)
            .filter((x): x is SanitizedHistoryItem => x !== null)
            .slice(0, MAX_HISTORY_ITEMS)
        : [];
      return jsonResponse({
        synced: true,
        backend: 'kv',
        items,
        updatedAt: stored?.updatedAt ?? null,
      });
    } catch {
      // Fall through
    }
  }

  return jsonResponse({
    synced: false,
    reason: 'no-binding',
    items: [],
  });
};

export const onRequestPost: PagesFunction = async (context) => {
  const auth0Domain = context.env.AUTH0_DOMAIN || 'accounts.vz.gay';
  const sub = await resolveVerifiedSub(context, auth0Domain);
  if (!sub) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    item?: unknown;
    items?: unknown[];
  };

  const rawList = Array.isArray(body.items)
    ? body.items
    : body.item
      ? [body.item]
      : [];

  const sanitized = rawList
    .map(sanitizeHistoryItem)
    .filter((x): x is SanitizedHistoryItem => x !== null)
    .slice(0, MAX_HISTORY_ITEMS);

  if (sanitized.length === 0) {
    return jsonResponse({ error: 'At least one valid history item is required' }, 400);
  }

  const updatedAt = new Date().toISOString();

  if (context.env.DB) {
    try {
      await ensureHistoryTable(context.env.DB);
      for (const entry of sanitized) {
        await context.env.DB.prepare(
          `INSERT INTO user_transfer_history
             (sub, hash, name, size, url, source_type, is_anonymous, profile_id, profile_label, path, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(sub, hash) DO UPDATE SET
             name = excluded.name,
             size = excluded.size,
             url = excluded.url,
             source_type = excluded.source_type,
             is_anonymous = excluded.is_anonymous,
             profile_id = excluded.profile_id,
             profile_label = excluded.profile_label,
             path = excluded.path,
             created_at = CASE
               WHEN excluded.created_at > user_transfer_history.created_at
                 THEN excluded.created_at
               ELSE user_transfer_history.created_at
             END`
        )
          .bind(
            sub,
            entry.hash,
            entry.name,
            entry.size,
            entry.url,
            entry.sourceType,
            entry.isAnonymous ? 1 : 0,
            entry.profileId,
            entry.profileLabel,
            entry.path ?? null,
            entry.createdAt
          )
          .run();
      }

      // Enforce per-user 200-item retention cap
      await context.env.DB.prepare(
        `DELETE FROM user_transfer_history
         WHERE sub = ?
           AND hash NOT IN (
             SELECT hash FROM user_transfer_history
             WHERE sub = ?
             ORDER BY created_at DESC
             LIMIT ?
           )`
      )
        .bind(sub, sub, MAX_HISTORY_ITEMS)
        .run();

      const items = await listD1History(context.env.DB, sub);
      return jsonResponse({ synced: true, backend: 'd1', items, updatedAt });
    } catch {
      // Fallback to KV
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      const existing = (await context.env.PORTAL_KV.get(`history:${sub}`, 'json')) as {
        items?: unknown[];
      } | null;
      const existingItems = Array.isArray(existing?.items)
        ? existing.items
            .map(sanitizeHistoryItem)
            .filter((x): x is SanitizedHistoryItem => x !== null)
        : [];
      const mergedMap = new Map<string, SanitizedHistoryItem>();
      for (const item of existingItems) mergedMap.set(item.hash, item);
      for (const item of sanitized) {
        const prev = mergedMap.get(item.hash);
        if (!prev || item.createdAt >= prev.createdAt) {
          mergedMap.set(item.hash, item);
        }
      }
      const items = Array.from(mergedMap.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_HISTORY_ITEMS);

      await context.env.PORTAL_KV.put(
        `history:${sub}`,
        JSON.stringify({ items, updatedAt })
      );
      return jsonResponse({ synced: true, backend: 'kv', items, updatedAt });
    } catch {
      // Fall through
    }
  }

  return jsonResponse({ synced: false, reason: 'no-binding' });
};

export const onRequestDelete: PagesFunction = async (context) => {
  const auth0Domain = context.env.AUTH0_DOMAIN || 'accounts.vz.gay';
  const sub = await resolveVerifiedSub(context, auth0Domain);
  if (!sub) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(context.request.url);
  const queryHash = url.searchParams.get('hash')?.trim() || '';
  const clearAll = url.searchParams.get('all') === '1' || url.searchParams.get('all') === 'true';

  if (!clearAll && !HASH_PATTERN.test(queryHash)) {
    return jsonResponse({ error: 'Specify a valid hash or all=1' }, 400);
  }

  const updatedAt = new Date().toISOString();

  if (context.env.DB) {
    try {
      await ensureHistoryTable(context.env.DB);
      if (clearAll) {
        await context.env.DB.prepare('DELETE FROM user_transfer_history WHERE sub = ?')
          .bind(sub)
          .run();
      } else {
        await context.env.DB.prepare(
          'DELETE FROM user_transfer_history WHERE sub = ? AND hash = ?'
        )
          .bind(sub, queryHash)
          .run();
      }
      const items = clearAll ? [] : await listD1History(context.env.DB, sub);
      return jsonResponse({ synced: true, backend: 'd1', items, updatedAt });
    } catch {
      // Fallback to KV
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      let nextItems: SanitizedHistoryItem[] = [];
      if (!clearAll) {
        const existing = (await context.env.PORTAL_KV.get(`history:${sub}`, 'json')) as {
          items?: unknown[];
        } | null;
        const existingItems = Array.isArray(existing?.items)
          ? existing.items
              .map(sanitizeHistoryItem)
              .filter((x): x is SanitizedHistoryItem => x !== null)
          : [];
        nextItems = existingItems.filter((item) => item.hash !== queryHash);
      }
      await context.env.PORTAL_KV.put(
        `history:${sub}`,
        JSON.stringify({ items: nextItems, updatedAt })
      );
      return jsonResponse({ synced: true, backend: 'kv', items: nextItems, updatedAt });
    } catch {
      // Fall through
    }
  }

  return jsonResponse({ synced: false, reason: 'no-binding' });
};
