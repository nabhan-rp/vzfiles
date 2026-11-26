import { jsonResponse, resolveVerifiedSub } from '../lib/auth';
import type { D1Database, PagesFunction } from '../types';

const MAX_HISTORY_ITEMS = 1024;
const RECYCLE_BIN_RETENTION_DAYS = 14;
const RECYCLE_BIN_RETENTION_MS = RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
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
  deletedAt?: string | null;
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
  deleted_at: string | null;
}

interface TableInfoRow {
  name: string;
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
        deleted_at TEXT DEFAULT NULL,
        PRIMARY KEY (sub, hash)
      )`
    )
    .run();

  // Zero-downtime auto-upgrade for existing v1.0.1 tables missing deleted_at
  try {
    const info = await db.prepare('PRAGMA table_info(user_transfer_history)').all<TableInfoRow>();
    const hasDeletedAt = (info.results || []).some((col) => col.name === 'deleted_at');
    if (!hasDeletedAt) {
      await db
        .prepare('ALTER TABLE user_transfer_history ADD COLUMN deleted_at TEXT DEFAULT NULL')
        .run();
    }
  } catch {
    // Fallback if ALTER raced with another isolate
  }

  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_transfer_history_sub_created
       ON user_transfer_history (sub, created_at DESC)`
    )
    .run();
  await db
    .prepare(
      `CREATE INDEX IF NOT EXISTS idx_user_transfer_history_sub_deleted_created
       ON user_transfer_history (sub, deleted_at, created_at DESC)`
    )
    .run();
  historyTableBootstrapped = true;
}

function getTrashCutoffIso(): string {
  return new Date(Date.now() - RECYCLE_BIN_RETENTION_MS).toISOString();
}

function isTrashExpired(deletedAt: string | null | undefined): boolean {
  if (!deletedAt) return false;
  const deletedMs = Date.parse(deletedAt);
  if (!Number.isFinite(deletedMs)) return true;
  return Date.now() - deletedMs >= RECYCLE_BIN_RETENTION_MS;
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

function sanitizeOptionalIsoDate(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
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
    deletedAt: sanitizeOptionalIsoDate(obj.deletedAt),
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
    deletedAt: row.deleted_at || null,
  };
}

async function purgeExpiredD1Trash(db: D1Database, sub: string): Promise<void> {
  const cutoffIso = getTrashCutoffIso();
  await db
    .prepare(
      `DELETE FROM user_transfer_history
       WHERE sub = ? AND deleted_at IS NOT NULL AND deleted_at <= ?`
    )
    .bind(sub, cutoffIso)
    .run();
}

async function trimD1ActiveCap(db: D1Database, sub: string): Promise<void> {
  await db
    .prepare(
      `DELETE FROM user_transfer_history
       WHERE sub = ?
         AND deleted_at IS NULL
         AND hash NOT IN (
           SELECT hash FROM user_transfer_history
           WHERE sub = ? AND deleted_at IS NULL
           ORDER BY created_at DESC
           LIMIT ?
         )`
    )
    .bind(sub, sub, MAX_HISTORY_ITEMS)
    .run();
}

async function trimD1TrashCap(db: D1Database, sub: string): Promise<void> {
  await db
    .prepare(
      `DELETE FROM user_transfer_history
       WHERE sub = ?
         AND deleted_at IS NOT NULL
         AND hash NOT IN (
           SELECT hash FROM user_transfer_history
           WHERE sub = ? AND deleted_at IS NOT NULL
           ORDER BY deleted_at DESC
           LIMIT ?
         )`
    )
    .bind(sub, sub, MAX_HISTORY_ITEMS)
    .run();
}

async function listD1Buckets(
  db: D1Database,
  sub: string
): Promise<{ items: SanitizedHistoryItem[]; trash: SanitizedHistoryItem[] }> {
  const activeRes = await db
    .prepare(
      `SELECT hash, name, size, url, source_type, is_anonymous, profile_id, profile_label, path, created_at, deleted_at
       FROM user_transfer_history
       WHERE sub = ? AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .bind(sub, MAX_HISTORY_ITEMS)
    .all<HistoryRow>();

  const trashRes = await db
    .prepare(
      `SELECT hash, name, size, url, source_type, is_anonymous, profile_id, profile_label, path, created_at, deleted_at
       FROM user_transfer_history
       WHERE sub = ? AND deleted_at IS NOT NULL
       ORDER BY deleted_at DESC
       LIMIT ?`
    )
    .bind(sub, MAX_HISTORY_ITEMS)
    .all<HistoryRow>();

  return {
    items: (activeRes.results || []).map(mapRowToItem),
    trash: (trashRes.results || []).map(mapRowToItem),
  };
}

interface KvHistoryPayload {
  items?: unknown[];
  trash?: unknown[];
  updatedAt?: string | null;
}

function normalizeKvBuckets(stored: KvHistoryPayload | null): {
  items: SanitizedHistoryItem[];
  trash: SanitizedHistoryItem[];
} {
  const items = Array.isArray(stored?.items)
    ? stored.items
        .map(sanitizeHistoryItem)
        .filter((x): x is SanitizedHistoryItem => x !== null)
        .map((x) => ({ ...x, deletedAt: null }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_HISTORY_ITEMS)
    : [];

  const trash = Array.isArray(stored?.trash)
    ? stored.trash
        .map(sanitizeHistoryItem)
        .filter(
          (x): x is SanitizedHistoryItem =>
            x !== null && Boolean(x.deletedAt) && !isTrashExpired(x.deletedAt)
        )
        .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
        .slice(0, MAX_HISTORY_ITEMS)
    : [];

  return { items, trash };
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
      await purgeExpiredD1Trash(context.env.DB, sub);
      const { items, trash } = await listD1Buckets(context.env.DB, sub);
      return jsonResponse({
        synced: true,
        backend: 'd1',
        items,
        trash,
        maxItems: MAX_HISTORY_ITEMS,
        retentionDays: RECYCLE_BIN_RETENTION_DAYS,
        updatedAt: items[0]?.createdAt ?? trash[0]?.deletedAt ?? null,
      });
    } catch {
      // Fallback to KV
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      const stored = (await context.env.PORTAL_KV.get(
        `history:${sub}`,
        'json'
      )) as KvHistoryPayload | null;
      const { items, trash } = normalizeKvBuckets(stored);
      return jsonResponse({
        synced: true,
        backend: 'kv',
        items,
        trash,
        maxItems: MAX_HISTORY_ITEMS,
        retentionDays: RECYCLE_BIN_RETENTION_DAYS,
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
    trash: [],
    maxItems: MAX_HISTORY_ITEMS,
    retentionDays: RECYCLE_BIN_RETENTION_DAYS,
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
    trashItems?: unknown[];
  };

  const rawActive = Array.isArray(body.items)
    ? body.items
    : body.item
      ? [body.item]
      : [];
  const rawTrash = Array.isArray(body.trashItems) ? body.trashItems : [];

  const sanitizedActive = rawActive
    .map(sanitizeHistoryItem)
    .filter((x): x is SanitizedHistoryItem => x !== null)
    .map((x) => ({ ...x, deletedAt: null }))
    .slice(0, MAX_HISTORY_ITEMS);

  const sanitizedTrash = rawTrash
    .map(sanitizeHistoryItem)
    .filter(
      (x): x is SanitizedHistoryItem =>
        x !== null && Boolean(x.deletedAt) && !isTrashExpired(x.deletedAt)
    )
    .slice(0, MAX_HISTORY_ITEMS);

  if (sanitizedActive.length === 0 && sanitizedTrash.length === 0) {
    return jsonResponse({ error: 'At least one valid history item is required' }, 400);
  }

  const updatedAt = new Date().toISOString();

  if (context.env.DB) {
    try {
      await ensureHistoryTable(context.env.DB);
      await purgeExpiredD1Trash(context.env.DB, sub);

      for (const entry of sanitizedActive) {
        await context.env.DB.prepare(
          `INSERT INTO user_transfer_history
             (sub, hash, name, size, url, source_type, is_anonymous, profile_id, profile_label, path, created_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
           ON CONFLICT(sub, hash) DO UPDATE SET
             name = excluded.name,
             size = excluded.size,
             url = excluded.url,
             source_type = excluded.source_type,
             is_anonymous = excluded.is_anonymous,
             profile_id = excluded.profile_id,
             profile_label = excluded.profile_label,
             path = excluded.path,
             deleted_at = NULL,
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

      for (const entry of sanitizedTrash) {
        await context.env.DB.prepare(
          `INSERT INTO user_transfer_history
             (sub, hash, name, size, url, source_type, is_anonymous, profile_id, profile_label, path, created_at, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(sub, hash) DO NOTHING`
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
            entry.createdAt,
            entry.deletedAt
          )
          .run();
      }

      await trimD1ActiveCap(context.env.DB, sub);
      await trimD1TrashCap(context.env.DB, sub);

      const { items, trash } = await listD1Buckets(context.env.DB, sub);
      return jsonResponse({ synced: true, backend: 'd1', items, trash, updatedAt });
    } catch {
      // Fallback to KV
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      const existing = (await context.env.PORTAL_KV.get(
        `history:${sub}`,
        'json'
      )) as KvHistoryPayload | null;
      const current = normalizeKvBuckets(existing);

      const activeMap = new Map<string, SanitizedHistoryItem>();
      const trashMap = new Map<string, SanitizedHistoryItem>();
      for (const item of current.items) activeMap.set(item.hash, item);
      for (const item of current.trash) trashMap.set(item.hash, item);

      for (const item of sanitizedActive) {
        trashMap.delete(item.hash);
        const prev = activeMap.get(item.hash);
        if (!prev || item.createdAt >= prev.createdAt) {
          activeMap.set(item.hash, { ...item, deletedAt: null });
        }
      }
      for (const item of sanitizedTrash) {
        if (!activeMap.has(item.hash) && !trashMap.has(item.hash)) {
          trashMap.set(item.hash, item);
        }
      }

      const items = Array.from(activeMap.values())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, MAX_HISTORY_ITEMS);
      const trash = Array.from(trashMap.values())
        .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
        .slice(0, MAX_HISTORY_ITEMS);

      await context.env.PORTAL_KV.put(
        `history:${sub}`,
        JSON.stringify({ items, trash, updatedAt })
      );
      return jsonResponse({ synced: true, backend: 'kv', items, trash, updatedAt });
    } catch {
      // Fall through
    }
  }

  return jsonResponse({ synced: false, reason: 'no-binding' });
};

export const onRequestPatch: PagesFunction = async (context) => {
  const auth0Domain = context.env.AUTH0_DOMAIN || 'accounts.vz.gay';
  const sub = await resolveVerifiedSub(context, auth0Domain);
  if (!sub) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const body = (await context.request.json().catch(() => ({}))) as {
    action?: string;
    hash?: string;
  };
  const action = body.action === 'restore-all' ? 'restore-all' : body.action === 'restore' ? 'restore' : '';
  const targetHash = typeof body.hash === 'string' ? body.hash.trim() : '';

  if (!action || (action === 'restore' && !HASH_PATTERN.test(targetHash))) {
    return jsonResponse({ error: 'Valid restore action and hash are required' }, 400);
  }

  const updatedAt = new Date().toISOString();

  if (context.env.DB) {
    try {
      await ensureHistoryTable(context.env.DB);
      await purgeExpiredD1Trash(context.env.DB, sub);

      if (action === 'restore-all') {
        await context.env.DB.prepare(
          'UPDATE user_transfer_history SET deleted_at = NULL WHERE sub = ? AND deleted_at IS NOT NULL'
        )
          .bind(sub)
          .run();
      } else {
        await context.env.DB.prepare(
          'UPDATE user_transfer_history SET deleted_at = NULL WHERE sub = ? AND hash = ? AND deleted_at IS NOT NULL'
        )
          .bind(sub, targetHash)
          .run();
      }

      await trimD1ActiveCap(context.env.DB, sub);
      const { items, trash } = await listD1Buckets(context.env.DB, sub);
      return jsonResponse({ synced: true, backend: 'd1', items, trash, updatedAt });
    } catch {
      // Fallback to KV
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      const existing = (await context.env.PORTAL_KV.get(
        `history:${sub}`,
        'json'
      )) as KvHistoryPayload | null;
      const current = normalizeKvBuckets(existing);
      let nextItems = [...current.items];
      let nextTrash = [...current.trash];

      if (action === 'restore-all') {
        const restored = nextTrash.map((item) => ({ ...item, deletedAt: null }));
        const byHash = new Map<string, SanitizedHistoryItem>();
        for (const item of [...nextItems, ...restored]) {
          byHash.set(item.hash, item);
        }
        nextItems = Array.from(byHash.values())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, MAX_HISTORY_ITEMS);
        nextTrash = [];
      } else {
        const found = nextTrash.find((item) => item.hash === targetHash);
        if (found) {
          nextTrash = nextTrash.filter((item) => item.hash !== targetHash);
          nextItems = [
            { ...found, deletedAt: null },
            ...nextItems.filter((item) => item.hash !== targetHash),
          ]
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
            .slice(0, MAX_HISTORY_ITEMS);
        }
      }

      await context.env.PORTAL_KV.put(
        `history:${sub}`,
        JSON.stringify({ items: nextItems, trash: nextTrash, updatedAt })
      );
      return jsonResponse({
        synced: true,
        backend: 'kv',
        items: nextItems,
        trash: nextTrash,
        updatedAt,
      });
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
  const permanent =
    url.searchParams.get('permanent') === '1' || url.searchParams.get('permanent') === 'true';

  if (!clearAll && !HASH_PATTERN.test(queryHash)) {
    return jsonResponse({ error: 'Specify a valid hash or all=1' }, 400);
  }

  const updatedAt = new Date().toISOString();

  if (context.env.DB) {
    try {
      await ensureHistoryTable(context.env.DB);
      await purgeExpiredD1Trash(context.env.DB, sub);

      if (permanent) {
        if (clearAll) {
          // Empty Recycle Bin permanently
          await context.env.DB.prepare(
            'DELETE FROM user_transfer_history WHERE sub = ? AND deleted_at IS NOT NULL'
          )
            .bind(sub)
            .run();
        } else {
          // Permanent delete single entry (from Recycle Bin or paired with VikingFile delete)
          await context.env.DB.prepare(
            'DELETE FROM user_transfer_history WHERE sub = ? AND hash = ?'
          )
            .bind(sub, queryHash)
            .run();
        }
      } else {
        // Soft-delete into 14-day Recycle Bin
        if (clearAll) {
          await context.env.DB.prepare(
            'UPDATE user_transfer_history SET deleted_at = ? WHERE sub = ? AND deleted_at IS NULL'
          )
            .bind(updatedAt, sub)
            .run();
        } else {
          await context.env.DB.prepare(
            'UPDATE user_transfer_history SET deleted_at = ? WHERE sub = ? AND hash = ? AND deleted_at IS NULL'
          )
            .bind(updatedAt, sub, queryHash)
            .run();
        }
        await trimD1TrashCap(context.env.DB, sub);
      }

      const { items, trash } = await listD1Buckets(context.env.DB, sub);
      return jsonResponse({ synced: true, backend: 'd1', items, trash, updatedAt });
    } catch {
      // Fallback to KV
    }
  }

  if (context.env.PORTAL_KV) {
    try {
      const existing = (await context.env.PORTAL_KV.get(
        `history:${sub}`,
        'json'
      )) as KvHistoryPayload | null;
      const current = normalizeKvBuckets(existing);
      let nextItems = [...current.items];
      let nextTrash = [...current.trash];

      if (permanent) {
        if (clearAll) {
          nextTrash = [];
        } else {
          nextItems = nextItems.filter((item) => item.hash !== queryHash);
          nextTrash = nextTrash.filter((item) => item.hash !== queryHash);
        }
      } else if (clearAll) {
        const moved = nextItems.map((item) => ({ ...item, deletedAt: updatedAt }));
        const trashByHash = new Map<string, SanitizedHistoryItem>();
        for (const item of [...moved, ...nextTrash]) {
          if (!trashByHash.has(item.hash)) {
            trashByHash.set(item.hash, item);
          }
        }
        nextItems = [];
        nextTrash = Array.from(trashByHash.values())
          .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
          .slice(0, MAX_HISTORY_ITEMS);
      } else {
        const found = nextItems.find((item) => item.hash === queryHash);
        if (found) {
          nextItems = nextItems.filter((item) => item.hash !== queryHash);
          nextTrash = [
            { ...found, deletedAt: updatedAt },
            ...nextTrash.filter((item) => item.hash !== queryHash),
          ].slice(0, MAX_HISTORY_ITEMS);
        }
      }

      await context.env.PORTAL_KV.put(
        `history:${sub}`,
        JSON.stringify({ items: nextItems, trash: nextTrash, updatedAt })
      );
      return jsonResponse({
        synced: true,
        backend: 'kv',
        items: nextItems,
        trash: nextTrash,
        updatedAt,
      });
    } catch {
      // Fall through
    }
  }

  return jsonResponse({ synced: false, reason: 'no-binding' });
};
