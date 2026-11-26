import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIKING_API_BASE = 'https://vikingfile.com/api';

function isAllowedVikingUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'vikingfile.com' || parsed.hostname.endsWith('.vikingfile.com'))
    );
  } catch {
    return false;
  }
}

function isAllowedPartUploadUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.startsWith('127.') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      host === '[::1]'
    ) {
      return false;
    }
    if (host === 'vikingfile.com' || host.endsWith('.vikingfile.com') || host.endsWith('.io.cloud.ovh.net')) {
      return true;
    }
    return (
      parsed.searchParams.has('X-Amz-Signature') &&
      parsed.searchParams.has('uploadId') &&
      parsed.searchParams.has('partNumber')
    );
  } catch {
    return false;
  }
}

async function postVikingForm(
  endpoint: string,
  params: URLSearchParams
): Promise<{ status: number; data: unknown }> {
  const upstream = await fetch(`${VIKING_API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json',
    },
    body: params.toString(),
  });

  const text = await upstream.text();
  try {
    return { status: upstream.status, data: JSON.parse(text) };
  } catch {
    return { status: upstream.status, data: { raw: text, error: text || 'Invalid upstream response' } };
  }
}

async function getVikingServer(): Promise<string> {
  const res = await fetch(`${VIKING_API_BASE}/get-server`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Failed to get upload server (${res.status})`);
  }
  const data = (await res.json()) as { server?: string };
  if (!data.server || !isAllowedVikingUrl(data.server)) {
    throw new Error('Invalid upload server returned by VikingFile');
  }
  return data.server.replace(/\/+$/, '');
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'vz-files', domain: 'files.vz.gay' });
  });

  // Chunk relay fallback for presigned PUT URLs if browser CORS blocks ETag header
  app.put(
    '/api/viking/upload-part',
    express.raw({ type: '*/*', limit: '2gb' }),
    async (req: Request, res: Response) => {
      try {
        const targetUrl = String(req.headers['x-target-url'] || '');
        if (!targetUrl || !isAllowedPartUploadUrl(targetUrl)) {
          res.status(400).json({ error: 'Invalid or disallowed VikingFile part URL' });
          return;
        }

        const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
        const upstream = await fetch(targetUrl, {
          method: 'PUT',
          headers: {
            'Content-Length': String(bodyBuffer.length),
          },
          body: new Uint8Array(bodyBuffer),
        });

        const rawEtag = upstream.headers.get('etag') || upstream.headers.get('ETag') || '';
        const etag = rawEtag.replace(/^"|"$/g, '');

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => '');
          res.status(upstream.status).json({
            error: errText || `Part upload failed with status ${upstream.status}`,
          });
          return;
        }

        res.json({ etag });
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Failed to relay upload part',
        });
      }
    }
  );

  // Legacy single-request file upload relay (fallback when multipart/CORS is constrained)
  app.post(
    '/api/viking/legacy-upload',
    express.raw({ type: '*/*', limit: '250mb' }),
    async (req: Request, res: Response) => {
      try {
        const filenameHeader = String(req.headers['x-file-name'] || 'upload.bin');
        const filename = decodeURIComponent(filenameHeader);
        const userHash = String(req.headers['x-user-hash'] || '');
        const folderPath = String(req.headers['x-file-path'] || '');
        const contentType = String(req.headers['content-type'] || 'application/octet-stream');

        const serverUrl = await getVikingServer();
        const form = new FormData();
        const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body || '');
        form.append('file', new Blob([new Uint8Array(bytes)], { type: contentType }), filename);
        form.append('user', userHash);
        if (folderPath) form.append('path', folderPath);

        const upstream = await fetch(serverUrl, {
          method: 'POST',
          body: form,
        });

        const text = await upstream.text();
        try {
          res.status(upstream.status).json(JSON.parse(text));
        } catch {
          res.status(upstream.status).json({ raw: text, error: 'Unexpected upload response' });
        }
      } catch (err) {
        res.status(502).json({
          error: err instanceof Error ? err.message : 'Legacy upload failed',
        });
      }
    }
  );

  app.use(express.json({ limit: '2mb' }));

  const devVaultStore = new Map<
    string,
    { profiles: unknown[]; activeProfileId: string | null; updatedAt: string }
  >();
  const devAuthCache = new Map<string, { sub: string; expiresAt: number }>();

  async function resolveAuth0Sub(req: Request): Promise<string | null> {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;

    const auth0Domain =
      process.env.VITE_AUTH0_DOMAIN || process.env.AUTH0_DOMAIN || 'accounts.vz.gay';
    const cacheKey = crypto.createHash('sha256').update(`${auth0Domain}:${token}`).digest('hex');
    const cached = devAuthCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.sub;
    }

    const upstream = await fetch(`https://${auth0Domain}/userinfo`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!upstream.ok) return null;
    const data = (await upstream.json()) as { sub?: string };
    const sub = typeof data.sub === 'string' && data.sub.trim() ? data.sub.trim() : null;
    if (sub) {
      if (devAuthCache.size >= 500) {
        const firstKey = devAuthCache.keys().next().value;
        if (firstKey) devAuthCache.delete(firstKey);
      }
      devAuthCache.set(cacheKey, { sub, expiresAt: Date.now() + 120_000 });
    }
    return sub;
  }

  app.get('/api/vault', async (req: Request, res: Response) => {
    try {
      const sub = await resolveAuth0Sub(req);
      if (!sub) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const existing = devVaultStore.get(sub);
      res.json({
        synced: true,
        backend: 'dev-memory',
        profiles: existing?.profiles ?? [],
        activeProfileId: existing?.activeProfileId ?? null,
        updatedAt: existing?.updatedAt ?? null,
      });
    } catch {
      res.status(502).json({ error: 'Failed to verify Auth0 session' });
    }
  });

  app.put('/api/vault', async (req: Request, res: Response) => {
    try {
      const sub = await resolveAuth0Sub(req);
      if (!sub) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const profiles = Array.isArray(req.body?.profiles) ? req.body.profiles.slice(0, 50) : [];
      const activeProfileId =
        typeof req.body?.activeProfileId === 'string' ? req.body.activeProfileId : null;
      const updatedAt = new Date().toISOString();
      devVaultStore.set(sub, { profiles, activeProfileId, updatedAt });
      res.json({ synced: true, backend: 'dev-memory', updatedAt });
    } catch {
      res.status(502).json({ error: 'Failed to sync vault' });
    }
  });

  interface DevHistoryItem {
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

  const MAX_HISTORY_ITEMS = 1024;
  const RECYCLE_BIN_RETENTION_DAYS = 14;
  const RECYCLE_BIN_RETENTION_MS = RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const HISTORY_HASH_PATTERN = /^[a-zA-Z0-9_-]{2,128}$/;
  const devHistoryStore = new Map<
    string,
    { items: DevHistoryItem[]; trash: DevHistoryItem[]; updatedAt: string }
  >();

  function isDevTrashExpired(deletedAt: string | null | undefined): boolean {
    if (!deletedAt) return false;
    const ms = Date.parse(deletedAt);
    if (!Number.isFinite(ms)) return true;
    return Date.now() - ms >= RECYCLE_BIN_RETENTION_MS;
  }

  function sanitizeDevHistoryItem(raw: unknown): DevHistoryItem | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    const hash = typeof obj.hash === 'string' ? obj.hash.trim() : '';
    if (!HISTORY_HASH_PATTERN.test(hash)) return null;

    const fallbackUrl = `https://vikingfile.com/f/${encodeURIComponent(hash)}`;
    let safeUrl = fallbackUrl;
    if (typeof obj.url === 'string') {
      try {
        const parsed = new URL(obj.url.trim());
        if (parsed.protocol === 'https:') {
          safeUrl = parsed.toString().slice(0, 500);
        }
      } catch {
        safeUrl = fallbackUrl;
      }
    }

    const rawDate = typeof obj.createdAt === 'string' ? Date.parse(obj.createdAt) : NaN;
    const createdAt = Number.isFinite(rawDate)
      ? new Date(rawDate).toISOString()
      : new Date().toISOString();

    const rawDeletedAt = typeof obj.deletedAt === 'string' ? Date.parse(obj.deletedAt) : NaN;
    const deletedAt = Number.isFinite(rawDeletedAt) ? new Date(rawDeletedAt).toISOString() : null;

    const profileId =
      typeof obj.profileId === 'string' && obj.profileId.trim()
        ? obj.profileId.trim().slice(0, 80)
        : null;
    const isAnonymous =
      typeof obj.isAnonymous === 'boolean' ? obj.isAnonymous : profileId === null;
    const rawSize = Number(obj.size);

    return {
      hash,
      name: (typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : hash).slice(0, 255),
      size: Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : 0,
      url: safeUrl,
      sourceType: obj.sourceType === 'remote' ? 'remote' : 'file',
      isAnonymous,
      profileId: isAnonymous ? null : profileId,
      profileLabel:
        typeof obj.profileLabel === 'string' ? obj.profileLabel.trim().slice(0, 120) : '',
      path:
        typeof obj.path === 'string' && obj.path.trim()
          ? obj.path.trim().slice(0, 255)
          : undefined,
      createdAt,
      deletedAt,
    };
  }

  function getDevBuckets(sub: string): { items: DevHistoryItem[]; trash: DevHistoryItem[]; updatedAt: string | null } {
    const existing = devHistoryStore.get(sub);
    if (!existing) return { items: [], trash: [], updatedAt: null };
    const cleanTrash = existing.trash.filter((item) => !isDevTrashExpired(item.deletedAt));
    if (cleanTrash.length !== existing.trash.length) {
      devHistoryStore.set(sub, { ...existing, trash: cleanTrash });
    }
    return { items: existing.items, trash: cleanTrash, updatedAt: existing.updatedAt };
  }

  app.get('/api/history', async (req: Request, res: Response) => {
    try {
      const sub = await resolveAuth0Sub(req);
      if (!sub) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const buckets = getDevBuckets(sub);
      res.json({
        synced: true,
        backend: 'dev-memory',
        items: buckets.items,
        trash: buckets.trash,
        maxItems: MAX_HISTORY_ITEMS,
        retentionDays: RECYCLE_BIN_RETENTION_DAYS,
        updatedAt: buckets.updatedAt,
      });
    } catch {
      res.status(502).json({ error: 'Failed to load transfer history' });
    }
  });

  app.post('/api/history', async (req: Request, res: Response) => {
    try {
      const sub = await resolveAuth0Sub(req);
      if (!sub) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const rawActive: unknown[] = Array.isArray(req.body?.items)
        ? req.body.items
        : req.body?.item
          ? [req.body.item]
          : [];
      const rawTrash: unknown[] = Array.isArray(req.body?.trashItems) ? req.body.trashItems : [];

      const sanitizedActive = rawActive
        .map(sanitizeDevHistoryItem)
        .filter((x: DevHistoryItem | null): x is DevHistoryItem => x !== null)
        .map((x) => ({ ...x, deletedAt: null }))
        .slice(0, MAX_HISTORY_ITEMS);

      const sanitizedTrash = rawTrash
        .map(sanitizeDevHistoryItem)
        .filter(
          (x: DevHistoryItem | null): x is DevHistoryItem =>
            x !== null && Boolean(x.deletedAt) && !isDevTrashExpired(x.deletedAt)
        )
        .slice(0, MAX_HISTORY_ITEMS);

      if (sanitizedActive.length === 0 && sanitizedTrash.length === 0) {
        res.status(400).json({ error: 'At least one valid history item is required' });
        return;
      }

      const current = getDevBuckets(sub);
      const activeMap = new Map<string, DevHistoryItem>();
      const trashMap = new Map<string, DevHistoryItem>();
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
      const updatedAt = new Date().toISOString();
      devHistoryStore.set(sub, { items, trash, updatedAt });
      res.json({ synced: true, backend: 'dev-memory', items, trash, updatedAt });
    } catch {
      res.status(502).json({ error: 'Failed to save transfer history' });
    }
  });

  app.patch('/api/history', async (req: Request, res: Response) => {
    try {
      const sub = await resolveAuth0Sub(req);
      if (!sub) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const action =
        req.body?.action === 'restore-all'
          ? 'restore-all'
          : req.body?.action === 'restore'
            ? 'restore'
            : '';
      const targetHash = typeof req.body?.hash === 'string' ? req.body.hash.trim() : '';

      if (!action || (action === 'restore' && !HISTORY_HASH_PATTERN.test(targetHash))) {
        res.status(400).json({ error: 'Valid restore action and hash are required' });
        return;
      }

      const current = getDevBuckets(sub);
      let nextItems = [...current.items];
      let nextTrash = [...current.trash];

      if (action === 'restore-all') {
        const restored = nextTrash.map((item) => ({ ...item, deletedAt: null }));
        const merged = new Map<string, DevHistoryItem>();
        for (const item of [...nextItems, ...restored]) merged.set(item.hash, item);
        nextItems = Array.from(merged.values())
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

      const updatedAt = new Date().toISOString();
      devHistoryStore.set(sub, { items: nextItems, trash: nextTrash, updatedAt });
      res.json({ synced: true, backend: 'dev-memory', items: nextItems, trash: nextTrash, updatedAt });
    } catch {
      res.status(502).json({ error: 'Failed to restore transfer history' });
    }
  });

  app.delete('/api/history', async (req: Request, res: Response) => {
    try {
      const sub = await resolveAuth0Sub(req);
      if (!sub) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      const clearAll = req.query.all === '1' || req.query.all === 'true';
      const permanent = req.query.permanent === '1' || req.query.permanent === 'true';
      const targetHash = typeof req.query.hash === 'string' ? req.query.hash.trim() : '';

      if (!clearAll && !HISTORY_HASH_PATTERN.test(targetHash)) {
        res.status(400).json({ error: 'Specify a valid hash or all=1' });
        return;
      }

      const current = getDevBuckets(sub);
      let nextItems = [...current.items];
      let nextTrash = [...current.trash];
      const updatedAt = new Date().toISOString();

      if (permanent) {
        if (clearAll) {
          nextTrash = [];
        } else {
          nextItems = nextItems.filter((item) => item.hash !== targetHash);
          nextTrash = nextTrash.filter((item) => item.hash !== targetHash);
        }
      } else if (clearAll) {
        const moved = nextItems.map((item) => ({ ...item, deletedAt: updatedAt }));
        const trashMap = new Map<string, DevHistoryItem>();
        for (const item of [...moved, ...nextTrash]) {
          if (!trashMap.has(item.hash)) trashMap.set(item.hash, item);
        }
        nextItems = [];
        nextTrash = Array.from(trashMap.values())
          .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
          .slice(0, MAX_HISTORY_ITEMS);
      } else {
        const found = nextItems.find((item) => item.hash === targetHash);
        if (found) {
          nextItems = nextItems.filter((item) => item.hash !== targetHash);
          nextTrash = [
            { ...found, deletedAt: updatedAt },
            ...nextTrash.filter((item) => item.hash !== targetHash),
          ].slice(0, MAX_HISTORY_ITEMS);
        }
      }

      devHistoryStore.set(sub, { items: nextItems, trash: nextTrash, updatedAt });
      res.json({ synced: true, backend: 'dev-memory', items: nextItems, trash: nextTrash, updatedAt });
    } catch {
      res.status(502).json({ error: 'Failed to delete transfer history' });
    }
  });

  app.get('/api/viking/get-server', async (_req: Request, res: Response) => {
    try {
      const server = await getVikingServer();
      res.json({ server });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to reach VikingFile API',
      });
    }
  });

  app.post('/api/viking/get-upload-url', async (req: Request, res: Response) => {
    try {
      const size = Number(req.body?.size);
      if (!Number.isFinite(size) || size <= 0) {
        res.status(400).json({ error: 'Valid file size in bytes is required' });
        return;
      }
      const params = new URLSearchParams();
      params.set('size', String(Math.floor(size)));
      const result = await postVikingForm('get-upload-url', params);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to request upload URL',
      });
    }
  });

  app.post('/api/viking/complete-upload', async (req: Request, res: Response) => {
    try {
      const { key, uploadId, parts, name, user = '', path: folderPath, pathPublicShare } = req.body || {};
      if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0 || !name) {
        res.status(400).json({ error: 'key, uploadId, parts, and name are required' });
        return;
      }

      const params = new URLSearchParams();
      params.set('key', String(key));
      params.set('uploadId', String(uploadId));
      params.set('name', String(name));
      params.set('user', String(user));
      if (folderPath) params.set('path', String(folderPath));
      if (pathPublicShare) params.set('pathPublicShare', String(pathPublicShare));

      parts.forEach((part: { PartNumber: number; ETag: string }, index: number) => {
        params.set(`parts[${index}][PartNumber]`, String(part.PartNumber));
        params.set(`parts[${index}][ETag]`, String(part.ETag).replace(/^"|"$/g, ''));
      });

      const result = await postVikingForm('complete-upload', params);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to complete upload',
      });
    }
  });

  app.post('/api/viking/remote-upload', async (req: Request, res: Response) => {
    try {
      const { link, user = '', name, path: folderPath, pathPublicShare } = req.body || {};
      if (!link || typeof link !== 'string') {
        res.status(400).json({ error: 'Remote link URL is required' });
        return;
      }

      const serverUrl = await getVikingServer();
      const params = new URLSearchParams();
      params.set('link', link.trim());
      params.set('user', String(user));
      if (name) params.set('name', String(name).trim());
      if (folderPath) params.set('path', String(folderPath).trim());
      if (pathPublicShare) params.set('pathPublicShare', String(pathPublicShare).trim());

      const upstream = await fetch(serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json',
        },
        body: params.toString(),
      });

      const text = await upstream.text();
      try {
        res.status(upstream.status).json(JSON.parse(text));
      } catch {
        res.status(upstream.status).json({ raw: text, error: text || 'Remote upload failed' });
      }
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Remote upload failed',
      });
    }
  });

  app.post('/api/viking/check-file', async (req: Request, res: Response) => {
    try {
      const { hash } = req.body || {};
      const params = new URLSearchParams();

      if (Array.isArray(hash)) {
        const cleaned = hash.map((h) => String(h).trim()).filter(Boolean).slice(0, 100);
        if (cleaned.length === 0) {
          res.status(400).json({ error: 'At least one hash is required' });
          return;
        }
        cleaned.forEach((h) => params.append('hash[]', h));
      } else if (typeof hash === 'string' && hash.trim()) {
        params.set('hash', hash.trim());
      } else {
        res.status(400).json({ error: 'File hash is required' });
        return;
      }

      const result = await postVikingForm('check-file', params);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to check file',
      });
    }
  });

  app.post('/api/viking/list-files', async (req: Request, res: Response) => {
    try {
      const { user, page = 1, path: folderPath } = req.body || {};
      if (!user || typeof user !== 'string') {
        res.status(400).json({ error: 'VikingFile user hash is required' });
        return;
      }

      const params = new URLSearchParams();
      params.set('user', user.trim());
      params.set('page', String(Math.max(1, Number(page) || 1)));
      if (folderPath && typeof folderPath === 'string' && folderPath.trim()) {
        params.set('path', folderPath.trim());
      }

      const result = await postVikingForm('list-files', params);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to list files',
      });
    }
  });

  app.post('/api/viking/rename-file', async (req: Request, res: Response) => {
    try {
      const { hash, user, filename } = req.body || {};
      if (!hash || !user || !filename) {
        res.status(400).json({ error: 'hash, user, and filename are required' });
        return;
      }

      const params = new URLSearchParams();
      params.set('hash', String(hash).trim());
      params.set('user', String(user).trim());
      params.set('filename', String(filename).trim());

      const result = await postVikingForm('rename-file', params);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to rename file',
      });
    }
  });

  app.post('/api/viking/delete-file', async (req: Request, res: Response) => {
    try {
      const { hash, user } = req.body || {};
      if (!hash || !user) {
        res.status(400).json({ error: 'hash and user are required' });
        return;
      }

      const params = new URLSearchParams();
      params.set('hash', String(hash).trim());
      params.set('user', String(user).trim());

      const result = await postVikingForm('delete-file', params);
      res.status(result.status).json(result.data);
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to delete file',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Build output not found');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`VZ Files server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
