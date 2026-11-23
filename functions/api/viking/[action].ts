import type { PagesFunction } from '../../types';

const VIKING_API_BASE = 'https://vikingfile.com/api';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

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

async function postVikingForm(endpoint: string, params: URLSearchParams): Promise<Response> {
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
    return jsonResponse(JSON.parse(text), upstream.status);
  } catch {
    return jsonResponse({ raw: text, error: text || 'Invalid upstream response' }, upstream.status);
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

export const onRequestGet: PagesFunction = async (context) => {
  const action = String(context.params.action || '');
  if (action === 'get-server') {
    try {
      const server = await getVikingServer();
      return jsonResponse({ server });
    } catch (err) {
      return jsonResponse(
        { error: err instanceof Error ? err.message : 'Failed to reach VikingFile API' },
        502
      );
    }
  }
  return jsonResponse({ error: 'Not found' }, 404);
};

export const onRequestPut: PagesFunction = async (context) => {
  const action = String(context.params.action || '');
  if (action !== 'upload-part') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const targetUrl = context.request.headers.get('x-target-url') || '';
    if (!targetUrl || !isAllowedPartUploadUrl(targetUrl)) {
      return jsonResponse({ error: 'Invalid or disallowed VikingFile part URL' }, 400);
    }

    const buffer = await context.request.arrayBuffer();
    const upstream = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(buffer.byteLength),
      },
      body: buffer,
    });

    const rawEtag = upstream.headers.get('etag') || upstream.headers.get('ETag') || '';
    const etag = rawEtag.replace(/^"|"$/g, '');

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return jsonResponse(
        { error: errText || `Part upload failed with status ${upstream.status}` },
        upstream.status
      );
    }

    return jsonResponse({ etag });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Failed to relay upload part' },
      502
    );
  }
};

export const onRequestPost: PagesFunction = async (context) => {
  const action = String(context.params.action || '');

  try {
    if (action === 'legacy-upload') {
      const filenameHeader = context.request.headers.get('x-file-name') || 'upload.bin';
      const filename = decodeURIComponent(filenameHeader);
      const userHash = context.request.headers.get('x-user-hash') || '';
      const folderPath = context.request.headers.get('x-file-path') || '';
      const contentType = context.request.headers.get('content-type') || 'application/octet-stream';

      const serverUrl = await getVikingServer();
      const buffer = await context.request.arrayBuffer();
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: contentType }), filename);
      form.append('user', userHash);
      if (folderPath) form.append('path', folderPath);

      const upstream = await fetch(serverUrl, { method: 'POST', body: form });
      const text = await upstream.text();
      try {
        return jsonResponse(JSON.parse(text), upstream.status);
      } catch {
        return jsonResponse({ raw: text, error: 'Unexpected upload response' }, upstream.status);
      }
    }

    const body = (await context.request.json().catch(() => ({}))) as Record<string, unknown>;

    if (action === 'get-upload-url') {
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) {
        return jsonResponse({ error: 'Valid file size in bytes is required' }, 400);
      }
      const params = new URLSearchParams();
      params.set('size', String(Math.floor(size)));
      return postVikingForm('get-upload-url', params);
    }

    if (action === 'complete-upload') {
      const { key, uploadId, parts, name, user = '', path: folderPath, pathPublicShare } = body;
      if (!key || !uploadId || !Array.isArray(parts) || parts.length === 0 || !name) {
        return jsonResponse({ error: 'key, uploadId, parts, and name are required' }, 400);
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

      return postVikingForm('complete-upload', params);
    }

    if (action === 'remote-upload') {
      const { link, user = '', name, path: folderPath, pathPublicShare } = body;
      if (!link || typeof link !== 'string') {
        return jsonResponse({ error: 'Remote link URL is required' }, 400);
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
        return jsonResponse(JSON.parse(text), upstream.status);
      } catch {
        return jsonResponse({ raw: text, error: text || 'Remote upload failed' }, upstream.status);
      }
    }

    if (action === 'check-file') {
      const { hash } = body;
      const params = new URLSearchParams();
      if (Array.isArray(hash)) {
        const cleaned = hash.map((h) => String(h).trim()).filter(Boolean).slice(0, 100);
        if (cleaned.length === 0) {
          return jsonResponse({ error: 'At least one hash is required' }, 400);
        }
        cleaned.forEach((h) => params.append('hash[]', h));
      } else if (typeof hash === 'string' && hash.trim()) {
        params.set('hash', hash.trim());
      } else {
        return jsonResponse({ error: 'File hash is required' }, 400);
      }
      return postVikingForm('check-file', params);
    }

    if (action === 'list-files') {
      const { user, page = 1, path: folderPath } = body;
      if (!user || typeof user !== 'string') {
        return jsonResponse({ error: 'VikingFile user hash is required' }, 400);
      }
      const params = new URLSearchParams();
      params.set('user', user.trim());
      params.set('page', String(Math.max(1, Number(page) || 1)));
      if (folderPath && typeof folderPath === 'string' && folderPath.trim()) {
        params.set('path', folderPath.trim());
      }
      return postVikingForm('list-files', params);
    }

    if (action === 'rename-file') {
      const { hash, user, filename } = body;
      if (!hash || !user || !filename) {
        return jsonResponse({ error: 'hash, user, and filename are required' }, 400);
      }
      const params = new URLSearchParams();
      params.set('hash', String(hash).trim());
      params.set('user', String(user).trim());
      params.set('filename', String(filename).trim());
      return postVikingForm('rename-file', params);
    }

    if (action === 'delete-file') {
      const { hash, user } = body;
      if (!hash || !user) {
        return jsonResponse({ error: 'hash and user are required' }, 400);
      }
      const params = new URLSearchParams();
      params.set('hash', String(hash).trim());
      params.set('user', String(user).trim());
      return postVikingForm('delete-file', params);
    }

    return jsonResponse({ error: 'Unknown VikingFile action' }, 404);
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Upstream VikingFile error' },
      502
    );
  }
};
