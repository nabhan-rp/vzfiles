import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import type { Language } from '../data/i18n';
import { getAuth0Config } from '../lib/auth0Config';

export interface SsoSession {
  sub: string;
  name: string;
  email: string;
  signedInAt: string;
}

export interface VikingHashProfile {
  id: string;
  label: string;
  userHash: string;
  defaultPath: string;
  addedAt: string;
}

export type VaultSyncStatus = 'local' | 'syncing' | 'synced' | 'error';

interface VaultStore {
  session: SsoSession | null;
  profilesBySub: Record<string, VikingHashProfile[]>;
  activeProfileBySub: Record<string, string | null>;
  syncedAtBySub: Record<string, string | null>;
}

const VAULT_STORAGE_KEY = 'vz_files_sso_vault_v1';
const FOCUS_REVALIDATE_MS = 30_000;

function readVault(): VaultStore {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VaultStore>;
      return {
        session: parsed.session ?? null,
        profilesBySub: parsed.profilesBySub ?? {},
        activeProfileBySub: parsed.activeProfileBySub ?? {},
        syncedAtBySub: parsed.syncedAtBySub ?? {},
      };
    }
  } catch {
    // ignore storage errors
  }
  return { session: null, profilesBySub: {}, activeProfileBySub: {}, syncedAtBySub: {} };
}

function writeVault(store: VaultStore) {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

export function useSsoVault(lang: Language = 'id') {
  const {
    isLoading: authLoading,
    isAuthenticated,
    user,
    error: authErrorObj,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  } = useAuth0();

  const { redirectUri, accountPortalUrl } = getAuth0Config();

  const [store, setStore] = useState<VaultStore>(() => readVault());
  const [syncStatus, setSyncStatus] = useState<VaultSyncStatus>('local');
  const [hasAuthError, setHasAuthError] = useState(false);

  const syncedSubRef = useRef<string | null>(null);
  const initialSyncDoneRef = useRef(false);
  const pullInFlightRef = useRef(false);
  const lastRevalidateRef = useRef(0);

  useEffect(() => {
    writeVault(store);
  }, [store]);

  // Clean up Auth0 callback error parameters from URL if user canceled or login failed
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('error') && url.searchParams.has('state')) {
      setHasAuthError(true);
      url.searchParams.delete('error');
      url.searchParams.delete('error_description');
      url.searchParams.delete('state');
      const cleaned = `${url.pathname}${url.search}`;
      window.history.replaceState({}, document.title, cleaned || '/');
    }
  }, []);

  useEffect(() => {
    if (authErrorObj) {
      setHasAuthError(true);
    }
  }, [authErrorObj]);

  const syncPushToCloud = useCallback(
    async (
      sub: string,
      profiles: VikingHashProfile[],
      activeProfileId: string | null
    ) => {
      if (!isAuthenticated) return;
      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/vault', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ profiles, activeProfileId }),
        });
        if (!res.ok) {
          setSyncStatus('error');
          return;
        }
        const data = (await res.json()) as { synced?: boolean; updatedAt?: string };
        if (data.synced) {
          setSyncStatus('synced');
          if (data.updatedAt) {
            setStore((prev) => ({
              ...prev,
              syncedAtBySub: { ...prev.syncedAtBySub, [sub]: data.updatedAt ?? null },
            }));
          }
        } else {
          setSyncStatus('local');
        }
      } catch {
        setSyncStatus('error');
      }
    },
    [getAccessTokenSilently, isAuthenticated]
  );

  const syncPullFromCloud = useCallback(
    async (sub: string) => {
      if (pullInFlightRef.current) return;
      pullInFlightRef.current = true;
      try {
        setSyncStatus('syncing');
        const token = await getAccessTokenSilently();
        const res = await fetch('/api/vault', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          setSyncStatus('local');
          return;
        }
        const data = (await res.json()) as {
          synced?: boolean;
          profiles?: VikingHashProfile[];
          activeProfileId?: string | null;
          updatedAt?: string | null;
        };
        if (!data.synced) {
          setSyncStatus('local');
          return;
        }

        const remoteProfiles = Array.isArray(data.profiles) ? data.profiles : [];
        let pendingMigration: { profiles: VikingHashProfile[]; activeId: string | null } | null =
          null;

        setStore((prev) => {
          const localProfiles = prev.profilesBySub[sub] || [];
          const hasRemoteVault = Boolean(data.updatedAt);

          // Once a cloud vault record exists, treat remote D1 state as authoritative so deletions propagate cleanly
          if (hasRemoteVault) {
            const nextActive =
              data.activeProfileId && remoteProfiles.some((p) => p.id === data.activeProfileId)
                ? data.activeProfileId
                : remoteProfiles[0]?.id ?? null;
            return {
              ...prev,
              profilesBySub: { ...prev.profilesBySub, [sub]: remoteProfiles },
              activeProfileBySub: { ...prev.activeProfileBySub, [sub]: nextActive },
              syncedAtBySub: { ...prev.syncedAtBySub, [sub]: data.updatedAt ?? null },
            };
          }

          // First-time cloud sync: migrate any local profiles up to D1
          if (localProfiles.length > 0) {
            const localActive = prev.activeProfileBySub[sub] ?? localProfiles[0]?.id ?? null;
            pendingMigration = { profiles: localProfiles, activeId: localActive };
          }
          return prev;
        });

        if (pendingMigration) {
          const migration = pendingMigration as {
            profiles: VikingHashProfile[];
            activeId: string | null;
          };
          await syncPushToCloud(sub, migration.profiles, migration.activeId);
        } else {
          setSyncStatus('synced');
        }
      } catch {
        setSyncStatus('local');
      } finally {
        pullInFlightRef.current = false;
        initialSyncDoneRef.current = true;
        lastRevalidateRef.current = Date.now();
      }
    },
    [getAccessTokenSilently, syncPushToCloud]
  );

  // Sync SDK auth state with vault session and initial D1 pull
  useEffect(() => {
    if (authLoading) return;

    if (isAuthenticated && user?.sub) {
      const sub = user.sub;
      setHasAuthError(false);
      setStore((prev) => {
        if (prev.session?.sub === sub) {
          return prev;
        }
        return {
          ...prev,
          session: {
            sub,
            name: user.name || user.nickname || user.email || 'VZ Member',
            email: user.email || '',
            signedInAt: new Date().toISOString(),
          },
        };
      });

      if (syncedSubRef.current !== sub) {
        syncedSubRef.current = sub;
        void syncPullFromCloud(sub);
      }
    } else {
      syncedSubRef.current = null;
      initialSyncDoneRef.current = false;
      setStore((prev) => (prev.session ? { ...prev, session: null } : prev));
    }
  }, [authLoading, isAuthenticated, user, syncPullFromCloud]);

  // Same-origin cross-tab storage synchronization
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      if (e.key !== VAULT_STORAGE_KEY || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as Partial<VaultStore>;
        setStore((prev) => ({
          session: parsed.session ?? prev.session,
          profilesBySub: parsed.profilesBySub ?? prev.profilesBySub,
          activeProfileBySub: parsed.activeProfileBySub ?? prev.activeProfileBySub,
          syncedAtBySub: parsed.syncedAtBySub ?? prev.syncedAtBySub,
        }));
      } catch {
        // ignore invalid storage payload
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Throttled cross-device / cross-subdomain vault revalidation on tab focus
  useEffect(() => {
    if (typeof window === 'undefined' || !isAuthenticated || !user?.sub) return;
    const sub = user.sub;

    const revalidate = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastRevalidateRef.current < FOCUS_REVALIDATE_MS) return;
      lastRevalidateRef.current = now;
      void syncPullFromCloud(sub);
    };

    window.addEventListener('focus', revalidate);
    document.addEventListener('visibilitychange', revalidate);
    return () => {
      window.removeEventListener('focus', revalidate);
      document.removeEventListener('visibilitychange', revalidate);
    };
  }, [isAuthenticated, user?.sub, syncPullFromCloud]);

  const buildReturnTo = () => {
    if (typeof window === 'undefined') return '/';
    const path = window.location.pathname === '/callback' ? '/' : window.location.pathname;
    return `${path}${window.location.search}`;
  };

  const signIn = useCallback(async () => {
    setHasAuthError(false);
    await loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri,
        ui_locales: lang,
      },
      appState: {
        returnTo: buildReturnTo(),
      },
    });
  }, [lang, loginWithRedirect, redirectUri]);

  const signOut = useCallback(async () => {
    setStore((prev) => ({ ...prev, session: null }));
    setSyncStatus('local');
    syncedSubRef.current = null;
    initialSyncDoneRef.current = false;

    await logout({
      logoutParams: {
        returnTo: redirectUri,
      },
    });
  }, [logout, redirectUri]);

  const currentSub = store.session?.sub || null;
  const profiles: VikingHashProfile[] = currentSub ? store.profilesBySub[currentSub] || [] : [];
  const activeProfileId = currentSub ? store.activeProfileBySub[currentSub] ?? null : null;
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || null;

  const addHashProfile = useCallback(
    (input: { label: string; userHash: string; defaultPath?: string }) => {
      if (!currentSub) return;
      const cleanHash = input.userHash.trim();
      const cleanLabel = input.label.trim();
      if (!cleanHash || !cleanLabel) return;

      const newProfile: VikingHashProfile = {
        id: `vh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        label: cleanLabel,
        userHash: cleanHash,
        defaultPath: (input.defaultPath || 'vz-files').trim(),
        addedAt: new Date().toISOString(),
      };

      setStore((prev) => {
        const existing = prev.profilesBySub[currentSub] || [];
        const nextProfiles = [newProfile, ...existing];
        if (isAuthenticated) {
          void syncPushToCloud(currentSub, nextProfiles, newProfile.id);
        }
        return {
          ...prev,
          profilesBySub: {
            ...prev.profilesBySub,
            [currentSub]: nextProfiles,
          },
          activeProfileBySub: {
            ...prev.activeProfileBySub,
            [currentSub]: newProfile.id,
          },
        };
      });
    },
    [currentSub, isAuthenticated, syncPushToCloud]
  );

  const removeHashProfile = useCallback(
    (id: string) => {
      if (!currentSub) return;
      setStore((prev) => {
        const filtered = (prev.profilesBySub[currentSub] || []).filter((p) => p.id !== id);
        const currentActive = prev.activeProfileBySub[currentSub];
        const nextActive =
          currentActive === id ? (filtered[0]?.id ?? null) : (currentActive ?? null);
        if (isAuthenticated) {
          void syncPushToCloud(currentSub, filtered, nextActive);
        }
        return {
          ...prev,
          profilesBySub: {
            ...prev.profilesBySub,
            [currentSub]: filtered,
          },
          activeProfileBySub: {
            ...prev.activeProfileBySub,
            [currentSub]: nextActive,
          },
        };
      });
    },
    [currentSub, isAuthenticated, syncPushToCloud]
  );

  const setActiveProfileId = useCallback(
    (id: string | null) => {
      if (!currentSub) return;
      setStore((prev) => {
        const currentProfiles = prev.profilesBySub[currentSub] || [];
        if (isAuthenticated && initialSyncDoneRef.current) {
          void syncPushToCloud(currentSub, currentProfiles, id);
        }
        return {
          ...prev,
          activeProfileBySub: {
            ...prev.activeProfileBySub,
            [currentSub]: id,
          },
        };
      });
    },
    [currentSub, isAuthenticated, syncPushToCloud]
  );

  return {
    session: store.session,
    profiles,
    activeProfile,
    activeProfileId,
    accountPortalUrl,
    authBusy: authLoading,
    hasAuthError,
    dismissAuthError: () => setHasAuthError(false),
    syncStatus,
    signIn,
    signOut,
    addHashProfile,
    removeHashProfile,
    setActiveProfileId,
  };
}
