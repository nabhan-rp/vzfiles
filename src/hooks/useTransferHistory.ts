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
}

export type HistorySyncStatus = 'local' | 'syncing' | 'synced' | 'error';

export const MAX_HISTORY_ITEMS = 200;

const GUEST_HISTORY_KEY = 'vz_files_history_v1';
const ACCOUNT_HISTORY_KEY = 'vz_files_history_by_sub_v1';
const FOCUS_REVALIDATE_MS = 30_000;

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
  };
}

function loadGuestHistory(): LocalTransferRecord[] {
  try {
    const raw = localStorage.getItem(GUEST_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeRecord)
      .filter((item): item is LocalTransferRecord => item !== null)
      .slice(0, MAX_HISTORY_ITEMS);
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

function loadAccountHistoryMap(): Record<string, LocalTransferRecord[]> {
  try {
    const raw = localStorage.getItem(ACCOUNT_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const result: Record<string, LocalTransferRecord[]> = {};
    for (const [sub, list] of Object.entries(parsed)) {
      if (Array.isArray(list)) {
        result[sub] = list
          .map(normalizeRecord)
          .filter((item): item is LocalTransferRecord => item !== null)
          .slice(0, MAX_HISTORY_ITEMS);
      }
    }
    return result;
  } catch {
    return {};
  }
}

function saveAccountHistoryForSub(sub: string, items: LocalTransferRecord[]) {
  try {
    const current = loadAccountHistoryMap();
    current[sub] = items.slice(0, MAX_HISTORY_ITEMS);
    localStorage.setItem(ACCOUNT_HISTORY_KEY, JSON.stringify(current));
  } catch {
    // ignore storage errors
  }
}

function mergeRecords(
  primary: LocalTransferRecord[],
  secondary: LocalTransferRecord[]
): LocalTransferRecord[] {
  const byHash = new Map<string, LocalTransferRecord>();
  for (const item of secondary) {
    byHash.set(item.hash, item);
  }
  for (const item of primary) {
    const prev = byHash.get(item.hash);
    if (!prev || item.createdAt >= prev.createdAt) {
      byHash.set(item.hash, item);
    }
  }
  return Array.from(byHash.values())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_HISTORY_ITEMS);
}

export function useTransferHistory() {
  const { isLoading: authLoading, isAuthenticated, user, getAccessTokenSilently } = useAuth0();
  const activeSub = isAuthenticated && user?.sub ? user.sub : null;

  const [history, setHistory] = useState<LocalTransferRecord[]>(() => loadGuestHistory());
  const [syncStatus, setSyncStatus] = useState<HistorySyncStatus>('local');

  const syncedSubRef = useRef<string | null>(null);
  const pullInFlightRef = useRef(false);
  const lastRevalidateRef = useRef(0);

  const pullAndMergeFromCloud = useCallback(
    async (sub: string, mergeGuest: boolean) => {
      if (pullInFlightRef.current) return;
      pullInFlightRef.current = true;

      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const guestItems = mergeGuest ? loadGuestHistory() : [];

        if (guestItems.length > 0) {
          // Merge local browser history into the signed-in SSO account on server
          const postRes = await fetch('/api/history', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ items: guestItems }),
          });

          if (postRes.ok) {
            const data = (await postRes.json()) as {
              synced?: boolean;
              items?: unknown[];
            };
            if (data.synced) {
              const serverItems = Array.isArray(data.items)
                ? data.items
                    .map(normalizeRecord)
                    .filter((item): item is LocalTransferRecord => item !== null)
                    .slice(0, MAX_HISTORY_ITEMS)
                : guestItems;

              saveGuestHistory([]);
              saveAccountHistoryForSub(sub, serverItems);
              setHistory(serverItems);
              setSyncStatus('synced');
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
        };
        if (!data.synced) {
          setSyncStatus('local');
          return;
        }

        const remoteItems = Array.isArray(data.items)
          ? data.items
              .map(normalizeRecord)
              .filter((item): item is LocalTransferRecord => item !== null)
              .slice(0, MAX_HISTORY_ITEMS)
          : [];

        const nextItems =
          guestItems.length > 0 ? mergeRecords(remoteItems, guestItems) : remoteItems;

        saveAccountHistoryForSub(sub, nextItems);
        setHistory(nextItems);
        setSyncStatus('synced');
      } catch {
        setSyncStatus('error');
      } finally {
        pullInFlightRef.current = false;
        lastRevalidateRef.current = Date.now();
      }
    },
    [getAccessTokenSilently]
  );

  // Switch between guest local storage and authenticated SSO account history
  useEffect(() => {
    if (authLoading) return;

    if (activeSub) {
      if (syncedSubRef.current !== activeSub) {
        syncedSubRef.current = activeSub;
        const cachedForSub = loadAccountHistoryMap()[activeSub] || [];
        const pendingGuest = loadGuestHistory();
        const immediateView =
          pendingGuest.length > 0 ? mergeRecords(cachedForSub, pendingGuest) : cachedForSub;
        setHistory(immediateView);
        void pullAndMergeFromCloud(activeSub, true);
      }
    } else {
      syncedSubRef.current = null;
      setSyncStatus('local');
      setHistory(loadGuestHistory());
    }
  }, [authLoading, activeSub, pullAndMergeFromCloud]);

  // Same-origin cross-tab synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (activeSub && e.key === ACCOUNT_HISTORY_KEY) {
        const nextForSub = loadAccountHistoryMap()[activeSub] || [];
        setHistory(nextForSub);
      } else if (!activeSub && e.key === GUEST_HISTORY_KEY) {
        setHistory(loadGuestHistory());
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
      const normalized = normalizeRecord(item);
      if (!normalized) return;

      setHistory((prev) => {
        const deduped = prev.filter((entry) => entry.hash !== normalized.hash);
        const next = [normalized, ...deduped].slice(0, MAX_HISTORY_ITEMS);
        if (activeSub) {
          saveAccountHistoryForSub(activeSub, next);
        } else {
          saveGuestHistory(next);
        }
        return next;
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
          const data = (await res.json()) as { synced?: boolean; items?: unknown[] };
          if (data.synced) {
            if (Array.isArray(data.items)) {
              const serverItems = data.items
                .map(normalizeRecord)
                .filter((entry): entry is LocalTransferRecord => entry !== null)
                .slice(0, MAX_HISTORY_ITEMS);
              saveAccountHistoryForSub(activeSub, serverItems);
              setHistory(serverItems);
            }
            setSyncStatus('synced');
          } else {
            setSyncStatus('local');
          }
        } catch {
          setSyncStatus('error');
        }
      })();
    },
    [activeSub, getAccessTokenSilently]
  );

  const removeHistoryItem = useCallback(
    async (hash: string): Promise<void> => {
      setHistory((prev) => {
        const next = prev.filter((entry) => entry.hash !== hash);
        if (activeSub) {
          saveAccountHistoryForSub(activeSub, next);
        } else {
          saveGuestHistory(next);
        }
        return next;
      });

      if (!activeSub) return;

      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const res = await fetch(`/api/history?hash=${encodeURIComponent(hash)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setSyncStatus('error');
          return;
        }
        const data = (await res.json()) as { synced?: boolean; items?: unknown[] };
        if (data.synced) {
          if (Array.isArray(data.items)) {
            const serverItems = data.items
              .map(normalizeRecord)
              .filter((entry): entry is LocalTransferRecord => entry !== null)
              .slice(0, MAX_HISTORY_ITEMS);
            saveAccountHistoryForSub(activeSub, serverItems);
            setHistory(serverItems);
          }
          setSyncStatus('synced');
        } else {
          setSyncStatus('local');
        }
      } catch {
        setSyncStatus('error');
      }
    },
    [activeSub, getAccessTokenSilently]
  );

  const clearHistory = useCallback(async (): Promise<void> => {
    setHistory([]);
    if (activeSub) {
      saveAccountHistoryForSub(activeSub, []);
    } else {
      saveGuestHistory([]);
    }

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
      const data = (await res.json()) as { synced?: boolean };
      setSyncStatus(data.synced ? 'synced' : 'local');
    } catch {
      setSyncStatus('error');
    }
  }, [activeSub, getAccessTokenSilently]);

  return {
    history,
    syncStatus,
    addHistoryItem,
    removeHistoryItem,
    clearHistory,
  };
}
