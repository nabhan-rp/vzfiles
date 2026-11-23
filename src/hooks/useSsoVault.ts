import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { getAuth0Config } from '../lib/auth0Config';

export interface SsoSession {
  sub: string;
  name: string;
  email: string;
  mode: 'auth0' | 'workspace';
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
}

const VAULT_STORAGE_KEY = 'vz_files_sso_vault_v1';

function readVault(): VaultStore {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VaultStore>;
      return {
        session: parsed.session ?? null,
        profilesBySub: parsed.profilesBySub ?? {},
        activeProfileBySub: parsed.activeProfileBySub ?? {},
      };
    }
  } catch {
    // ignore storage errors
  }
  return { session: null, profilesBySub: {}, activeProfileBySub: {} };
}

function writeVault(store: VaultStore) {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore storage errors
  }
}

function mergeProfiles(
  remote: VikingHashProfile[],
  local: VikingHashProfile[]
): VikingHashProfile[] {
  const byHash = new Map<string, VikingHashProfile>();
  remote.forEach((p) => {
    if (p && p.userHash) byHash.set(p.userHash, p);
  });
  local.forEach((p) => {
    if (p && p.userHash && !byHash.has(p.userHash)) {
      byHash.set(p.userHash, p);
    }
  });
  return Array.from(byHash.values());
}

export function useSsoVault() {
  const {
    isLoading: auth0Loading,
    isAuthenticated,
    user,
    error: auth0Error,
    loginWithRedirect,
    logout,
    getAccessTokenSilently,
  } = useAuth0();

  const {
    domain: auth0Domain,
    clientId: auth0ClientId,
    redirectUri,
    accountPortalUrl,
  } = getAuth0Config();

  const [store, setStore] = useState<VaultStore>(() => readVault());
  const [syncStatus, setSyncStatus] = useState<VaultSyncStatus>('local');
  const syncedSubRef = useRef<string | null>(null);
  const initialSyncDoneRef = useRef(false);

  useEffect(() => {
    writeVault(store);
  }, [store]);

  const syncPullFromCloud = useCallback(
    async (sub: string) => {
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
        };
        if (!data.synced) {
          setSyncStatus('local');
          return;
        }

        const remoteProfiles = Array.isArray(data.profiles) ? data.profiles : [];
        setStore((prev) => {
          const localProfiles = prev.profilesBySub[sub] || [];
          const merged = mergeProfiles(remoteProfiles, localProfiles);
          const activeId =
            data.activeProfileId ??
            prev.activeProfileBySub[sub] ??
            merged[0]?.id ??
            null;
          return {
            ...prev,
            profilesBySub: { ...prev.profilesBySub, [sub]: merged },
            activeProfileBySub: { ...prev.activeProfileBySub, [sub]: activeId },
          };
        });
        setSyncStatus('synced');
      } catch {
        setSyncStatus('local');
      } finally {
        initialSyncDoneRef.current = true;
      }
    },
    [getAccessTokenSilently]
  );

  const syncPushToCloud = useCallback(
    async (profiles: VikingHashProfile[], activeProfileId: string | null) => {
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
        const data = (await res.json()) as { synced?: boolean };
        setSyncStatus(data.synced ? 'synced' : 'local');
      } catch {
        setSyncStatus('error');
      }
    },
    [getAccessTokenSilently, isAuthenticated]
  );

  // Sync Auth0 React SDK state with local vault session and Cloudflare D1/KV
  useEffect(() => {
    if (auth0Loading) return;

    if (isAuthenticated && user?.sub) {
      const sub = user.sub;
      setStore((prev) => {
        if (prev.session?.sub === sub && prev.session?.mode === 'auth0') {
          return prev;
        }
        return {
          ...prev,
          session: {
            sub,
            name: user.name || user.nickname || user.email || 'VZ Member',
            email: user.email || '',
            mode: 'auth0',
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
      setStore((prev) => {
        if (prev.session?.mode === 'auth0') {
          return { ...prev, session: null };
        }
        return prev;
      });
    }
  }, [auth0Loading, isAuthenticated, user, syncPullFromCloud]);

  const buildReturnTo = () => {
    if (typeof window === 'undefined') return '/';
    const path = window.location.pathname === '/callback' ? '/' : window.location.pathname;
    return `${path}${window.location.search}`;
  };

  const startAuth0Login = useCallback(async () => {
    await loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri,
      },
      appState: {
        returnTo: buildReturnTo(),
      },
    });
    return true;
  }, [loginWithRedirect, redirectUri]);

  const startAuth0Signup = useCallback(async () => {
    await loginWithRedirect({
      authorizationParams: {
        redirect_uri: redirectUri,
        screen_hint: 'signup',
      },
      appState: {
        returnTo: buildReturnTo(),
      },
    });
    return true;
  }, [loginWithRedirect, redirectUri]);

  const signInWorkspaceSession = useCallback((identifier: string, displayName?: string) => {
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId) return;
    const sub = `vz-workspace:${cleanId}`;
    const derivedName = displayName?.trim() || cleanId.split('@')[0] || cleanId;

    setStore((prev) => ({
      ...prev,
      session: {
        sub,
        name: derivedName,
        email: cleanId.includes('@') ? cleanId : `${cleanId}@vz.gay`,
        mode: 'workspace',
        signedInAt: new Date().toISOString(),
      },
    }));
    setSyncStatus('local');
  }, []);

  const signOut = useCallback(async () => {
    const currentMode = store.session?.mode;
    setStore((prev) => ({ ...prev, session: null }));
    setSyncStatus('local');
    syncedSubRef.current = null;
    initialSyncDoneRef.current = false;

    if (currentMode === 'auth0' || isAuthenticated) {
      await logout({
        logoutParams: {
          returnTo: redirectUri,
        },
      });
    }
  }, [isAuthenticated, logout, redirectUri, store.session?.mode]);

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
        if (prev.session?.mode === 'auth0') {
          void syncPushToCloud(nextProfiles, newProfile.id);
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
    [currentSub, syncPushToCloud]
  );

  const removeHashProfile = useCallback(
    (id: string) => {
      if (!currentSub) return;
      setStore((prev) => {
        const filtered = (prev.profilesBySub[currentSub] || []).filter((p) => p.id !== id);
        const currentActive = prev.activeProfileBySub[currentSub];
        const nextActive =
          currentActive === id ? (filtered[0]?.id ?? null) : (currentActive ?? null);
        if (prev.session?.mode === 'auth0') {
          void syncPushToCloud(filtered, nextActive);
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
    [currentSub, syncPushToCloud]
  );

  const setActiveProfileId = useCallback(
    (id: string | null) => {
      if (!currentSub) return;
      setStore((prev) => {
        const currentProfiles = prev.profilesBySub[currentSub] || [];
        if (prev.session?.mode === 'auth0' && initialSyncDoneRef.current) {
          void syncPushToCloud(currentProfiles, id);
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
    [currentSub, syncPushToCloud]
  );

  return {
    session: store.session,
    profiles,
    activeProfile,
    activeProfileId,
    auth0Domain,
    auth0ClientId,
    accountPortalUrl,
    authBusy: auth0Loading,
    authError: auth0Error?.message || null,
    syncStatus,
    startAuth0Login,
    startAuth0Signup,
    signInWorkspaceSession,
    signOut,
    addHashProfile,
    removeHashProfile,
    setActiveProfileId,
  };
}
