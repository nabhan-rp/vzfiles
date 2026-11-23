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
