import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';

export interface LocalTransferRecord {
  hash: string;
  name: string;
  size: number;
  url: string;
  sourceType: 'file' | 'remote';
  isAnonymous: boolean;
  profileId?: string | null;
  profileLabel: string;
  path?: string;
  createdAt: string;
  deletedAt?: string | null;
}

export type HistorySyncStatus = 'local' | 'syncing' | 'synced' | 'error';
export type HistoryPageSize = 25 | 50 | 100 | 'all';

export const MAX_HISTORY_ITEMS = 1024;
export const RECYCLE_BIN_RETENTION_DAYS = 14;
const RECYCLE_BIN_RETENTION_MS = RECYCLE_BIN_RETENTION_DAYS * 24 * 60 * 60 * 1000;

const GUEST_HISTORY_KEY = 'vz_files_history_v1';
const GUEST_TRASH_KEY = 'vz_files_history_trash_v1';
const ACCOUNT_HISTORY_KEY = 'vz_files_history_by_sub_v1';
const ACCOUNT_TRASH_KEY = 'vz_files_history_trash_by_sub_v1';
const FOCUS_REVALIDATE_MS = 30_000;

export function getRemainingRetentionDays(deletedAt: string | null | undefined): number {
  if (!deletedAt) return RECYCLE_BIN_RETENTION_DAYS;
  const ms = Date.parse(deletedAt);
  if (!Number.isFinite(ms)) return 0;
  const remainingMs = ms + RECYCLE_BIN_RETENTION_MS - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.min(RECYCLE_BIN_RETENTION_DAYS, Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000))));
}

function isTrashExpired(deletedAt: string | null | undefined): boolean {
  if (!deletedAt) return true;
  const ms = Date.parse(deletedAt);
  if (!Number.isFinite(ms)) return true;
  return Date.now() - ms >= RECYCLE_BIN_RETENTION_MS;
}

function normalizeRecord(raw: unknown): LocalTransferRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const hash = typeof obj.hash === 'string' ? obj.hash.trim() : '';
  if (!hash) return null;

  const profileId =
    typeof obj.profileId === 'string' && obj.profileId.trim() ? obj.profileId.trim() : null;
  const profileLabel = typeof obj.profileLabel === 'string' ? obj.profileLabel : '';
  const inferredAnonymous =
    typeof obj.isAnonymous === 'boolean'
      ? obj.isAnonymous
      : profileId === null &&
        (!profileLabel ||
          profileLabel.toLowerCase().includes('anonim') ||
          profileLabel.toLowerCase().includes('anonymous'));

  const deletedAt =
    typeof obj.deletedAt === 'string' && obj.deletedAt.trim() && Number.isFinite(Date.parse(obj.deletedAt))
      ? new Date(Date.parse(obj.deletedAt)).toISOString()
      : null;

  return {
    hash,
    name: typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : hash,
    size: Number.isFinite(Number(obj.size)) && Number(obj.size) > 0 ? Math.floor(Number(obj.size)) : 0,
    url:
      typeof obj.url === 'string' && obj.url.startsWith('https://')
        ? obj.url
        : `https://vikingfile.com/f/${encodeURIComponent(hash)}`,
    sourceType: obj.sourceType === 'remote' ? 'remote' : 'file',
    isAnonymous: inferredAnonymous,
    profileId: inferredAnonymous ? null : profileId,
    profileLabel,
    path: typeof obj.path === 'string' && obj.path.trim() ? obj.path.trim() : undefined,
    createdAt:
      typeof obj.createdAt === 'string' && obj.createdAt.trim()
        ? obj.createdAt
        : new Date().toISOString(),
    deletedAt,
  };
}

function normalizeActiveList(raw: unknown): LocalTransferRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeRecord)
    .filter((item): item is LocalTransferRecord => item !== null)
    .map((item) => ({ ...item, deletedAt: null }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_HISTORY_ITEMS);
}

function normalizeTrashList(raw: unknown): LocalTransferRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeRecord)
    .filter(
      (item): item is LocalTransferRecord =>
        item !== null && Boolean(item.deletedAt) && !isTrashExpired(item.deletedAt)
    )
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
    .slice(0, MAX_HISTORY_ITEMS);
}

function loadGuestHistory(): LocalTransferRecord[] {
  try {
    const raw = localStorage.getItem(GUEST_HISTORY_KEY);
    return raw ? normalizeActiveList(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

function saveGuestHistory(items: LocalTransferRecord[]) {
  try {
    localStorage.setItem(GUEST_HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // ignore storage errors
  }
}

function loadGuestTrash(): LocalTransferRecord[] {
  try {
    const raw = localStorage.getItem(GUEST_TRASH_KEY);
    const cleaned = raw ? normalizeTrashList(JSON.parse(raw)) : [];
    if (raw) {
      localStorage.setItem(GUEST_TRASH_KEY, JSON.stringify(cleaned));
    }
    return cleaned;
  } catch {
    return [];
  }
}

function saveGuestTrash(items: LocalTransferRecord[]) {
  try {
    localStorage.setItem(GUEST_TRASH_KEY, JSON.stringify(items.slice(0, MAX_HISTORY_ITEMS)));
  } catch {
    // ignore storage errors
  }
}

function loadAccountMap(key: string, isTrash: boolean): Record<string, LocalTransferRecord[]> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, LocalTransferRecord[]> = {};
    for (const [sub, list] of Object.entries(parsed)) {
      result[sub] = isTrash ? normalizeTrashList(list) : normalizeActiveList(list);
    }
    return result;
  } catch {
    return {};
  }
}

function saveAccountListForSub(key: string, sub: string, items: LocalTransferRecord[], isTrash: boolean) {
  try {
    const current = loadAccountMap(key, isTrash);
    current[sub] = items.slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(key, JSON.stringify(current));
  } catch {
    // ignore storage errors
  }
}

function mergeActiveRecords(
  primary: LocalTransferRecord[],
  secondary: LocalTransferRecord[]
): LocalTransferRecord[] {
  const byHash = new Map<string, LocalTransferRecord>();
  for (const item of secondary) byHash.set(item.hash, { ...item, deletedAt: null });
  for (const item of primary) {
    const prev = byHash.get(item.hash);
    if (!prev || item.createdAt >= prev.createdAt) {
      byHash.set(item.hash, { ...item, deletedAt: null });
    }
  }
  return Array.from(byHash.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_HISTORY_ITEMS);
}

function mergeTrashRecords(
  primary: LocalTransferRecord[],
  secondary: LocalTransferRecord[],
  activeHashes: Set<string>
): LocalTransferRecord[] {
  const byHash = new Map<string, LocalTransferRecord>();
  for (const item of [...secondary, ...primary]) {
    if (activeHashes.has(item.hash) || isTrashExpired(item.deletedAt)) continue;
    const prev = byHash.get(item.hash);
    if (!prev || (item.deletedAt || '') >= (prev.deletedAt || '')) {
      byHash.set(item.hash, item);
    }
  }
  return Array.from(byHash.values())
    .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
    .slice(0, MAX_HISTORY_ITEMS);
}

export function useTransferHistory() {
  const { isLoading: authLoading, isAuthenticated, user, getAccessTokenSilently } = useAuth0();
  const activeSub = isAuthenticated && user?.sub ? user.sub : null;

  const [history, setHistory] = useState<LocalTransferRecord[]>(() => loadGuestHistory());
  const [trash, setTrash] = useState<LocalTransferRecord[]>(() => loadGuestTrash());
  const [syncStatus, setSyncStatus] = useState<HistorySyncStatus>('local');

  const syncedSubRef = useRef<string | null>(null);
  const pullInFlightRef = useRef(false);
  const lastRevalidateRef = useRef(0);

  const persistBuckets = useCallback(
    (sub: string | null, nextActive: LocalTransferRecord[], nextTrash: LocalTransferRecord[]) => {
      if (sub) {
        saveAccountListForSub(ACCOUNT_HISTORY_KEY, sub, nextActive, false);
        saveAccountListForSub(ACCOUNT_TRASH_KEY, sub, nextTrash, true);
      } else {
        saveGuestHistory(nextActive);
        saveGuestTrash(nextTrash);
      }
    },
    []
  );

  const applyServerPayload = useCallback(
    (sub: string, data: { synced?: boolean; items?: unknown[]; trash?: unknown[] }) => {
      if (!data.synced) {
        setSyncStatus('local');
        return false;
      }
      const serverItems = normalizeActiveList(data.items);
      const serverTrash = normalizeTrashList(data.trash);
      persistBuckets(sub, serverItems, serverTrash);
      setHistory(serverItems);
      setTrash(serverTrash);
      setSyncStatus('synced');
      return true;
    },
    [persistBuckets]
  );

  const pullAndMergeFromCloud = useCallback(
    async (sub: string, mergeGuest: boolean) => {
      if (pullInFlightRef.current) return;
      pullInFlightRef.current = true;

      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const guestItems = mergeGuest ? loadGuestHistory() : [];
        const guestTrash = mergeGuest ? loadGuestTrash() : [];

        if (guestItems.length > 0 || guestTrash.length > 0) {
          const postRes = await fetch('/api/history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ items: guestItems, trashItems: guestTrash }),
          });

          if (postRes.ok) {
            const data = (await postRes.json()) as {
              synced?: boolean;
              items?: unknown[];
              trash?: unknown[];
            };
            if (applyServerPayload(sub, data)) {
              saveGuestHistory([]);
              saveGuestTrash([]);
              return;
            }
          }
        }

        const res = await fetch('/api/history', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setSyncStatus('error');
          return;
        }
        const data = (await res.json()) as {
          synced?: boolean;
          items?: unknown[];
          trash?: unknown[];
        };
        applyServerPayload(sub, data);
      } catch {
        setSyncStatus('error');
      } finally {
        pullInFlightRef.current = false;
        lastRevalidateRef.current = Date.now();
      }
    },
    [applyServerPayload, getAccessTokenSilently]
  );

  // Switch between guest local storage and authenticated SSO account history
  useEffect(() => {
    if (authLoading) return;

    if (activeSub) {
      if (syncedSubRef.current !== activeSub) {
        syncedSubRef.current = activeSub;
        const cachedActive = loadAccountMap(ACCOUNT_HISTORY_KEY, false)[activeSub] || [];
        const cachedTrash = loadAccountMap(ACCOUNT_TRASH_KEY, true)[activeSub] || [];
        const pendingGuestActive = loadGuestHistory();
        const pendingGuestTrash = loadGuestTrash();

        const immediateActive =
          pendingGuestActive.length > 0
            ? mergeActiveRecords(cachedActive, pendingGuestActive)
            : cachedActive;
        const activeHashes = new Set(immediateActive.map((item) => item.hash));
        const immediateTrash =
          pendingGuestTrash.length > 0
            ? mergeTrashRecords(cachedTrash, pendingGuestTrash, activeHashes)
            : cachedTrash;

        setHistory(immediateActive);
        setTrash(immediateTrash);
        void pullAndMergeFromCloud(activeSub, true);
      }
    } else {
      syncedSubRef.current = null;
      setSyncStatus('local');
      setHistory(loadGuestHistory());
      setTrash(loadGuestTrash());
    }
  }, [authLoading, activeSub, pullAndMergeFromCloud]);

  // Same-origin cross-tab synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (activeSub) {
        if (e.key === ACCOUNT_HISTORY_KEY) {
          setHistory(loadAccountMap(ACCOUNT_HISTORY_KEY, false)[activeSub] || []);
        } else if (e.key === ACCOUNT_TRASH_KEY) {
          setTrash(loadAccountMap(ACCOUNT_TRASH_KEY, true)[activeSub] || []);
        }
      } else {
        if (e.key === GUEST_HISTORY_KEY) {
          setHistory(loadGuestHistory());
        } else if (e.key === GUEST_TRASH_KEY) {
          setTrash(loadGuestTrash());
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [activeSub]);

  // Throttled cross-device / cross-subdomain revalidation on tab focus
  useEffect(() => {
    if (typeof window === 'undefined' || !activeSub) return;

    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastRevalidateRef.current < FOCUS_REVALIDATE_MS) return;
      lastRevalidateRef.current = now;
      void pullAndMergeFromCloud(activeSub, false);
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [activeSub, pullAndMergeFromCloud]);

  const addHistoryItem = useCallback(
    (item: LocalTransferRecord) => {
      const normalized = normalizeRecord({ ...item, deletedAt: null });
      if (!normalized) return;

      setHistory((prevActive) => {
        const nextActive = [
          normalized,
          ...prevActive.filter((entry) => entry.hash !== normalized.hash),
        ].slice(0, MAX_HISTORY_ITEMS);
        setTrash((prevTrash) => {
          const nextTrash = prevTrash.filter((entry) => entry.hash !== normalized.hash);
          persistBuckets(activeSub, nextActive, nextTrash);
          return nextTrash;
        });
        return nextActive;
      });

      if (!activeSub) return;

      void (async () => {
        try {
          setSyncStatus('syncing');
          const token = await getAccessTokenSilently();
          const res = await fetch('/api/history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ item: normalized }),
          });
          if (!res.ok) {
            setSyncStatus('error');
            return;
          }
          const data = (await res.json()) as {
            synced?: boolean;
            items?: unknown[];
            trash?: unknown[];
          };
          applyServerPayload(activeSub, data);
        } catch {
          setSyncStatus('error');
        }
      })();
    },
    [activeSub, applyServerPayload, getAccessTokenSilently, persistBuckets]
  );

  const removeHistoryItem = useCallback(
    async (hash: string, options?: { permanent?: boolean }): Promise<void> => {
      const permanent = Boolean(options?.permanent);
      const deletedAt = new Date().toISOString();

      let targetItem: LocalTransferRecord | undefined;
      setHistory((prevActive) => {
        targetItem = prevActive.find((entry) => entry.hash === hash);
        const nextActive = prevActive.filter((entry) => entry.hash !== hash);
        setTrash((prevTrash) => {
          const filteredTrash = prevTrash.filter((entry) => entry.hash !== hash);
          const nextTrash =
            !permanent && targetItem
              ? [{ ...targetItem, deletedAt }, ...filteredTrash].slice(0, MAX_HISTORY_ITEMS)
              : filteredTrash;
          persistBuckets(activeSub, nextActive, nextTrash);
          return nextTrash;
        });
        return nextActive;
      });

      if (!activeSub) return;

      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const url = `/api/history?hash=${encodeURIComponent(hash)}${permanent ? '&permanent=1' : ''}`;
        const res = await fetch(url, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setSyncStatus('error');
          return;
        }
        const data = (await res.json()) as {
          synced?: boolean;
          items?: unknown[];
          trash?: unknown[];
        };
        applyServerPayload(activeSub, data);
      } catch {
        setSyncStatus('error');
      }
    },
    [activeSub, applyServerPayload, getAccessTokenSilently, persistBuckets]
  );

  const clearHistory = useCallback(async (): Promise<void> => {
    const deletedAt = new Date().toISOString();

    setHistory((prevActive) => {
      const moved = prevActive.map((entry) => ({ ...entry, deletedAt }));
      setTrash((prevTrash) => {
        const byHash = new Map<string, LocalTransferRecord>();
        for (const entry of [...moved, ...prevTrash]) {
          if (!byHash.has(entry.hash) && !isTrashExpired(entry.deletedAt)) {
            byHash.set(entry.hash, entry);
          }
        }
        const nextTrash = Array.from(byHash.values())
          .sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''))
          .slice(0, MAX_HISTORY_ITEMS);
        persistBuckets(activeSub, [], nextTrash);
        return nextTrash;
      });
      return [];
    });

    if (!activeSub) return;

    try {
      setSyncStatus('syncing');
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/history?all=1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setSyncStatus('error');
        return;
      }
      const data = (await res.json()) as {
        synced?: boolean;
        items?: unknown[];
        trash?: unknown[];
      };
      applyServerPayload(activeSub, data);
    } catch {
      setSyncStatus('error');
    }
  }, [activeSub, applyServerPayload, getAccessTokenSilently, persistBuckets]);

  const restoreHistoryItem = useCallback(
    async (hash: string): Promise<void> => {
      setTrash((prevTrash) => {
        const target = prevTrash.find((entry) => entry.hash === hash);
        const nextTrash = prevTrash.filter((entry) => entry.hash !== hash);
        if (target) {
          setHistory((prevActive) => {
            const restored: LocalTransferRecord = { ...target, deletedAt: null };
            const nextActive = mergeActiveRecords([restored], prevActive);
            persistBuckets(activeSub, nextActive, nextTrash);
            return nextActive;
          });
        }
        return nextTrash;
      });

      if (!activeSub) return;

      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/history', {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action: 'restore', hash }),
        });
        if (!res.ok) {
          setSyncStatus('error');
          return;
        }
        const data = (await res.json()) as {
          synced?: boolean;
          items?: unknown[];
          trash?: unknown[];
        };
        applyServerPayload(activeSub, data);
      } catch {
        setSyncStatus('error');
      }
    },
    [activeSub, applyServerPayload, getAccessTokenSilently, persistBuckets]
  );

  const restoreAllHistory = useCallback(async (): Promise<void> => {
    setTrash((prevTrash) => {
      if (prevTrash.length === 0) return prevTrash;
      setHistory((prevActive) => {
        const restored = prevTrash.map((entry) => ({ ...entry, deletedAt: null }));
        const nextActive = mergeActiveRecords(prevActive, restored);
        persistBuckets(activeSub, nextActive, []);
        return nextActive;
      });
      return [];
    });

    if (!activeSub) return;

    try {
      setSyncStatus('syncing');
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/history', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'restore-all' }),
      });
      if (!res.ok) {
        setSyncStatus('error');
        return;
      }
      const data = (await res.json()) as {
        synced?: boolean;
        items?: unknown[];
        trash?: unknown[];
      };
      applyServerPayload(activeSub, data);
    } catch {
      setSyncStatus('error');
    }
  }, [activeSub, applyServerPayload, getAccessTokenSilently, persistBuckets]);

  const permanentlyDeleteTrashItem = useCallback(
    async (hash: string): Promise<void> => {
      setTrash((prevTrash) => {
        const nextTrash = prevTrash.filter((entry) => entry.hash !== hash);
        setHistory((prevActive) => {
          persistBuckets(activeSub, prevActive, nextTrash);
          return prevActive;
        });
        return nextTrash;
      });

      if (!activeSub) return;

      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const res = await fetch(`/api/history?hash=${encodeURIComponent(hash)}&permanent=1`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setSyncStatus('error');
          return;
        }
        const data = (await res.json()) as {
          synced?: boolean;
          items?: unknown[];
          trash?: unknown[];
        };
        applyServerPayload(activeSub, data);
      } catch {
        setSyncStatus('error');
      }
    },
    [activeSub, applyServerPayload, getAccessTokenSilently, persistBuckets]
  );

  const emptyRecycleBin = useCallback(async (): Promise<void> => {
    setTrash([]);
    setHistory((prevActive) => {
      persistBuckets(activeSub, prevActive, []);
      return prevActive;
    });

    if (!activeSub) return;

    try {
      setSyncStatus('syncing');
      const token = await getAccessTokenSilently();
      const res = await fetch('/api/history?all=1&permanent=1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setSyncStatus('error');
        return;
      }
      const data = (await res.json()) as {
        synced?: boolean;
        items?: unknown[];
        trash?: unknown[];
      };
      applyServerPayload(activeSub, data);
    } catch {
      setSyncStatus('error');
    }
  }, [activeSub, applyServerPayload, getAccessTokenSilently, persistBuckets]);

  return {
    history,
    trash,
    syncStatus,
    addHistoryItem,
    removeHistoryItem,
    clearHistory,
    restoreHistoryItem,
    restoreAllHistory,
    permanentlyDeleteTrashItem,
    emptyRecycleBin,
  };
}
