export interface UploadUrlResponse {
  uploadId: string;
  key: string;
  partSize: number;
  numberParts: number;
  urls: string[];
}

export interface UploadCompleteResponse {
  name: string;
  size: number;
  hash: string;
  url: string;
}

export interface CheckFileResult {
  hash: string;
  exist: boolean;
  name?: string;
  size?: number;
}

export interface VikingListedFile {
  hash: string;
  name: string;
  size: number;
  downloads: number;
  created: string;
}

export interface ListFilesResponse {
  currentPage: number;
  maxPages: number;
  files: VikingListedFile[];
}

export interface UploadProgressState {
  phase: 'preparing' | 'uploading' | 'completing';
  loadedBytes: number;
  totalBytes: number;
  percent: number;
  currentPart: number;
  totalParts: number;
  transport: 'direct' | 'relay';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exp);
  return `${value >= 100 || exp === 0 ? value.toFixed(0) : value.toFixed(2)} ${units[exp]}`;
}

export function extractVikingHash(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  try {
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      const url = new URL(trimmed);
      const qHash = url.searchParams.get('f') || url.searchParams.get('hash');
      if (qHash) return qHash.trim();

      const segments = url.pathname.split('/').filter(Boolean);
      const fIndex = segments.indexOf('f');
      if (fIndex !== -1 && segments[fIndex + 1]) {
        return segments[fIndex + 1].trim();
      }
      if (segments.length > 0) {
        return segments[segments.length - 1].trim();
      }
    }
  } catch {
    // Fall through to raw string parsing
  }

  return trimmed.replace(/^\/?f\//, '').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function buildVikingOfficialUrl(hash: string): string {
  return `https://vikingfile.com/f/${encodeURIComponent(hash)}`;
}

export function buildVzShareUrl(hash: string): string {
  if (typeof window !== 'undefined') {
    const { origin, hostname } = window.location;
    if (hostname === 'files.vz.gay' || hostname === 'file.vz.gay') {
      return `${origin}/?f=${encodeURIComponent(hash)}`;
    }
    return `${origin}/?f=${encodeURIComponent(hash)}`;
  }
  return `https://files.vz.gay/?f=${encodeURIComponent(hash)}`;
}

function putChunkWithXhr(
  url: string,
  chunk: Blob,
  headers: Record<string, string>,
  onProgress: (loaded: number) => void,
  signal?: AbortSignal
): Promise<{ status: number; etagHeader: string | null; responseText: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);

    Object.entries(headers).forEach(([k, v]) => {
      xhr.setRequestHeader(k, v);
    });

    const handleAbort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Upload cancelled', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(event.loaded);
      }
    };

    xhr.onload = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
      const etagHeader = xhr.getResponseHeader('etag') || xhr.getResponseHeader('ETag');
      resolve({
        status: xhr.status,
        etagHeader,
        responseText: xhr.responseText,
      });
    };

    xhr.onerror = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
      reject(new Error('Network or CORS error during part upload'));
    };

    xhr.onabort = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    xhr.send(chunk);
  });
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function uploadFileToViking(
  file: File,
  options: { userHash?: string; path?: string },
  onProgress: (state: UploadProgressState) => void,
  signal?: AbortSignal
): Promise<UploadCompleteResponse> {
  const user = (options.userHash || '').trim();
  const folderPath = (options.path || '').trim();

  onProgress({
    phase: 'preparing',
    loadedBytes: 0,
    totalBytes: file.size,
    percent: 0,
    currentPart: 0,
    totalParts: 1,
    transport: 'direct',
  });

  let uploadMeta: UploadUrlResponse;
  try {
    uploadMeta = await postJson<UploadUrlResponse>(
      '/api/viking/get-upload-url',
      { size: file.size },
      signal
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Fallback to legacy single upload if file is <= 200 MB
    if (file.size <= 200 * 1024 * 1024) {
      return uploadLegacyToViking(file, { userHash: user, path: folderPath }, onProgress, signal);
    }
    throw err;
  }

  if (!uploadMeta.urls || uploadMeta.urls.length === 0 || !uploadMeta.uploadId || !uploadMeta.key) {
    throw new Error('Invalid upload session returned by VikingFile API');
  }

  const partSize = uploadMeta.partSize || file.size;
  const totalParts = uploadMeta.urls.length;
  const completedParts: Array<{ PartNumber: number; ETag: string }> = [];
  let uploadedBeforePart = 0;

  for (let idx = 0; idx < totalParts; idx++) {
    const start = idx * partSize;
    const end = Math.min(start + partSize, file.size);
    const chunk = file.slice(start, end);
    const partUrl = uploadMeta.urls[idx];
    let etag = '';
    let usedRelay = false;

    try {
      const directRes = await putChunkWithXhr(
        partUrl,
        chunk,
        {},
        (loaded) => {
          const totalLoaded = Math.min(uploadedBeforePart + loaded, file.size);
          onProgress({
            phase: 'uploading',
            loadedBytes: totalLoaded,
            totalBytes: file.size,
            percent: Math.min(99, Math.round((totalLoaded / Math.max(1, file.size)) * 100)),
            currentPart: idx + 1,
            totalParts,
            transport: 'direct',
          });
        },
        signal
      );

      if (directRes.status >= 200 && directRes.status < 300 && directRes.etagHeader) {
        etag = directRes.etagHeader.replace(/^"|"$/g, '');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      // Will fallback to same-origin chunk relay below
    }

    if (!etag) {
      usedRelay = true;
      const relayRes = await putChunkWithXhr(
        '/api/viking/upload-part',
        chunk,
        { 'X-Target-Url': partUrl },
        (loaded) => {
          const totalLoaded = Math.min(uploadedBeforePart + loaded, file.size);
          onProgress({
            phase: 'uploading',
            loadedBytes: totalLoaded,
            totalBytes: file.size,
            percent: Math.min(99, Math.round((totalLoaded / Math.max(1, file.size)) * 100)),
            currentPart: idx + 1,
            totalParts,
            transport: 'relay',
          });
        },
        signal
      );

      if (relayRes.status < 200 || relayRes.status >= 300) {
        let msg = `Part ${idx + 1} upload failed (${relayRes.status})`;
        try {
          const parsed = JSON.parse(relayRes.responseText) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch {
          // ignore
        }
        throw new Error(msg);
      }

      const parsed = JSON.parse(relayRes.responseText || '{}') as { etag?: string };
      if (!parsed.etag) {
        throw new Error(`Missing ETag for part ${idx + 1}`);
      }
      etag = parsed.etag.replace(/^"|"$/g, '');
    }

    completedParts.push({ PartNumber: idx + 1, ETag: etag });
    uploadedBeforePart = end;
    onProgress({
      phase: 'uploading',
      loadedBytes: uploadedBeforePart,
      totalBytes: file.size,
      percent: Math.min(99, Math.round((uploadedBeforePart / Math.max(1, file.size)) * 100)),
      currentPart: idx + 1,
      totalParts,
      transport: usedRelay ? 'relay' : 'direct',
    });
  }

  onProgress({
    phase: 'completing',
    loadedBytes: file.size,
    totalBytes: file.size,
    percent: 99,
    currentPart: totalParts,
    totalParts,
    transport: 'direct',
  });

  const completeRes = await postJson<UploadCompleteResponse & { error?: string }>(
    '/api/viking/complete-upload',
    {
      key: uploadMeta.key,
      uploadId: uploadMeta.uploadId,
      parts: completedParts,
      name: file.name,
      user,
      path: folderPath || undefined,
    },
    signal
  );

  if (!completeRes.hash) {
    throw new Error(completeRes.error || 'Upload completion failed');
  }

  return completeRes;
}

function uploadLegacyToViking(
  file: File,
  options: { userHash?: string; path?: string },
  onProgress: (state: UploadProgressState) => void,
  signal?: AbortSignal
): Promise<UploadCompleteResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/viking/legacy-upload', true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    if (options.userHash) xhr.setRequestHeader('X-User-Hash', options.userHash);
    if (options.path) xhr.setRequestHeader('X-File-Path', options.path);

    const handleAbort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException('Upload cancelled', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', handleAbort, { once: true });
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress({
          phase: 'uploading',
          loadedBytes: event.loaded,
          totalBytes: file.size,
          percent: Math.min(99, Math.round((event.loaded / Math.max(1, file.size)) * 100)),
          currentPart: 1,
          totalParts: 1,
          transport: 'relay',
        });
      }
    };

    xhr.onload = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
      try {
        const data = JSON.parse(xhr.responseText || '{}') as UploadCompleteResponse & {
          error?: string;
        };
        if (xhr.status >= 200 && xhr.status < 300 && data.hash) {
          resolve(data);
        } else {
          reject(new Error(data.error || `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error('Invalid response from upload endpoint'));
      }
    };

    xhr.onerror = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
      reject(new Error('Network error during file upload'));
    };

    xhr.onabort = () => {
      if (signal) signal.removeEventListener('abort', handleAbort);
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    xhr.send(file);
  });
}

export async function uploadRemoteUrlToViking(params: {
  link: string;
  userHash?: string;
  name?: string;
  path?: string;
}): Promise<UploadCompleteResponse> {
  const res = await postJson<UploadCompleteResponse & { error?: string }>(
    '/api/viking/remote-upload',
    {
      link: params.link.trim(),
      user: (params.userHash || '').trim(),
      name: params.name?.trim() || undefined,
      path: params.path?.trim() || undefined,
    }
  );
  if (!res.hash) {
    throw new Error(res.error || 'Remote upload failed');
  }
  return res;
}

export async function checkVikingFiles(rawInputs: string[]): Promise<CheckFileResult[]> {
  const hashes = rawInputs.map(extractVikingHash).filter(Boolean).slice(0, 100);
  if (hashes.length === 0) return [];

  const payload = hashes.length === 1 ? { hash: hashes[0] } : { hash: hashes };
  const raw = await postJson<Record<string, unknown>>('/api/viking/check-file', payload);

  if (hashes.length === 1 && 'exist' in raw) {
    return [
      {
        hash: hashes[0],
        exist: Boolean(raw.exist),
        name: typeof raw.name === 'string' ? raw.name : undefined,
        size: typeof raw.size === 'number' ? raw.size : Number(raw.size) || undefined,
      },
    ];
  }

  if (Array.isArray(raw)) {
    return raw.map((item, idx) => {
      const entry = item as Record<string, unknown>;
      return {
        hash: typeof entry.hash === 'string' ? entry.hash : hashes[idx] || '',
        exist: Boolean(entry.exist),
        name: typeof entry.name === 'string' ? entry.name : undefined,
        size: typeof entry.size === 'number' ? entry.size : Number(entry.size) || undefined,
      };
    });
  }

  return hashes.map((h) => {
    const entry = raw[h] as Record<string, unknown> | undefined;
    if (entry && typeof entry === 'object') {
      return {
        hash: h,
        exist: Boolean(entry.exist),
        name: typeof entry.name === 'string' ? entry.name : undefined,
        size: typeof entry.size === 'number' ? entry.size : Number(entry.size) || undefined,
      };
    }
    return { hash: h, exist: false };
  });
}

export async function listVikingFiles(params: {
  userHash: string;
  page?: number;
  path?: string;
}): Promise<ListFilesResponse> {
  return postJson<ListFilesResponse>('/api/viking/list-files', {
    user: params.userHash.trim(),
    page: params.page || 1,
    path: params.path?.trim() || undefined,
  });
}

export async function renameVikingFile(params: {
  hash: string;
  userHash: string;
  filename: string;
}): Promise<{ error: string }> {
  return postJson<{ error: string }>('/api/viking/rename-file', {
    hash: params.hash.trim(),
    user: params.userHash.trim(),
    filename: params.filename.trim(),
  });
}

export async function deleteVikingFile(params: {
  hash: string;
  userHash: string;
}): Promise<{ error: string }> {
  return postJson<{ error: string }>('/api/viking/delete-file', {
    hash: params.hash.trim(),
    user: params.userHash.trim(),
  });
}
