import { useCallback, useEffect, useRef, useState } from 'react';
import { createAuth0Client, type Auth0Client } from '@auth0/auth0-spa-js';

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
  const [store, setStore] = useState<VaultStore>(() => readVault());
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<VaultSyncStatus>('local');

  const auth0ClientRef = useRef<Auth0Client | null>(null);
  const initialSyncDoneRef = useRef(false);

  const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || 'accounts.vz.gay';
  const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
  const accountPortalUrl = import.meta.env.VITE_ACCOUNT_PORTAL_URL || 'https://myaccount.vz.gay';

  const getRedirectUri = useCallback(() => {
    if (import.meta.env.VITE_AUTH0_REDIRECT_URI) {
      return String(import.meta.env.VITE_AUTH0_REDIRECT_URI);
    }
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/callback`;
    }
    return 'https://files.vz.gay/callback';
  }, []);

  useEffect(() => {
    writeVault(store);
  }, [store]);

  const syncPullFromCloud = useCallback(async (client: Auth0Client, sub: string) => {
    try {
      setSyncStatus('syncing');
      const token = await client.getTokenSilently();
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
  }, []);

  const syncPushToCloud = useCallback(
    async (profiles: VikingHashProfile[], activeProfileId: string | null) => {
      const client = auth0ClientRef.current;
      if (!client) return;
      try {
        setSyncStatus('syncing');
        const token = await client.getTokenSilently();
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
    []
  );

  // Initialize official @auth0/auth0-spa-js v2 client when VITE_AUTH0_CLIENT_ID is configured
  useEffect(() => {
    if (!auth0ClientId || typeof window === 'undefined') return;

    let mounted = true;
    setAuthBusy(true);
    setAuthError(null);

    (async () => {
      try {
        const client = await createAuth0Client({
          domain: auth0Domain,
          clientId: auth0ClientId,
          cacheLocation: 'localstorage',
          useRefreshTokens: true,
          authorizationParams: {
            redirect_uri: getRedirectUri(),
            scope: 'openid profile email',
          },
        });

        if (!mounted) return;
        auth0ClientRef.current = client;

        const search = window.location.search;
        if (search.includes('code=') && search.includes('state=')) {
          await client.handleRedirectCallback();
          window.history.replaceState({}, document.title, '/');
        }

        const isAuth = await client.isAuthenticated();
        if (isAuth) {
          const user = await client.getUser();
          if (user?.sub && mounted) {
            const session: SsoSession = {
              sub: user.sub,
              name: user.name || user.nickname || user.email || 'VZ Member',
              email: user.email || '',
              mode: 'auth0',
              signedInAt: new Date().toISOString(),
            };
            setStore((prev) => ({ ...prev, session }));
            await syncPullFromCloud(client, user.sub);
          }
        }
      } catch (err) {
        if (mounted) {
          setAuthError(err instanceof Error ? err.message : 'Auth0 SSO initialization failed');
        }
      } finally {
        if (mounted) setAuthBusy(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [auth0ClientId, auth0Domain, getRedirectUri, syncPullFromCloud]);

  const startAuth0Login = useCallback(async () => {
    if (!auth0ClientId) {
      return false;
    }

    const client =
      auth0ClientRef.current ||
      (await createAuth0Client({
        domain: auth0Domain,
        clientId: auth0ClientId,
        cacheLocation: 'localstorage',
        useRefreshTokens: true,
        authorizationParams: {
          redirect_uri: getRedirectUri(),
          scope: 'openid profile email',
        },
      }));

    auth0ClientRef.current = client;
    await client.loginWithRedirect({
      authorizationParams: {
        redirect_uri: getRedirectUri(),
      },
    });
    return true;
  }, [auth0ClientId, auth0Domain, getRedirectUri]);

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
    setAuthError(null);
  }, []);

  const signOut = useCallback(async () => {
    const currentMode = store.session?.mode;
    setStore((prev) => ({ ...prev, session: null }));
    setSyncStatus('local');
    initialSyncDoneRef.current = false;

    if (currentMode === 'auth0' && auth0ClientRef.current && typeof window !== 'undefined') {
      await auth0ClientRef.current.logout({
        logoutParams: {
          returnTo: window.location.origin,
        },
      });
    }
  }, [store.session?.mode]);

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
    authBusy,
    authError,
    syncStatus,
    startAuth0Login,
    signInWorkspaceSession,
    signOut,
    addHashProfile,
    removeHashProfile,
    setActiveProfileId,
  };
}
