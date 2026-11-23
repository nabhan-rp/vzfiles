import { useCallback, useEffect, useState } from 'react';

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

interface VaultStore {
  session: SsoSession | null;
  profilesBySub: Record<string, VikingHashProfile[]>;
  activeProfileBySub: Record<string, string | null>;
}

const VAULT_STORAGE_KEY = 'vz_files_sso_vault_v1';
const PKCE_VERIFIER_KEY = 'vz_auth0_pkce_verifier';
const PKCE_STATE_KEY = 'vz_auth0_pkce_state';

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

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function generatePkcePair() {
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const verifier = base64UrlEncode(randomBytes.buffer);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64UrlEncode(digest);
  const stateBytes = new Uint8Array(16);
  crypto.getRandomValues(stateBytes);
  const state = base64UrlEncode(stateBytes.buffer);
  return { verifier, challenge, state };
}

export function useSsoVault() {
  const [store, setStore] = useState<VaultStore>(() => readVault());
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || 'acccounts.vz.gay';
  const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
  const accountPortalUrl = import.meta.env.VITE_ACCOUNT_PORTAL_URL || 'https://myaccount.vz.gay';

  useEffect(() => {
    writeVault(store);
  }, [store]);

  // Handle Auth0 PKCE callback when redirected back with ?code=...&state=...
  useEffect(() => {
    if (!auth0ClientId || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return;

    const savedState = sessionStorage.getItem(PKCE_STATE_KEY);
    const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    if (!savedState || !verifier || savedState !== state) return;

    const redirectUri =
      import.meta.env.VITE_AUTH0_REDIRECT_URI || `${window.location.origin}/callback`;

    setAuthBusy(true);
    setAuthError(null);

    (async () => {
      try {
        const tokenRes = await fetch(`https://${auth0Domain}/oauth/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            grant_type: 'authorization_code',
            client_id: auth0ClientId,
            code_verifier: verifier,
            code,
            redirect_uri: redirectUri,
          }),
        });
        const tokenData = (await tokenRes.json()) as {
          access_token?: string;
          error_description?: string;
        };
        if (!tokenRes.ok || !tokenData.access_token) {
          throw new Error(tokenData.error_description || 'Auth0 token exchange failed');
        }

        const userRes = await fetch(`https://${auth0Domain}/userinfo`, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userInfo = (await userRes.json()) as {
          sub?: string;
          name?: string;
          email?: string;
          nickname?: string;
        };

        if (!userInfo.sub) {
          throw new Error('Missing VZ SSO user identifier');
        }

        const session: SsoSession = {
          sub: userInfo.sub,
          name: userInfo.name || userInfo.nickname || userInfo.email || 'VZ Member',
          email: userInfo.email || '',
          mode: 'auth0',
          signedInAt: new Date().toISOString(),
        };

        setStore((prev) => ({ ...prev, session }));
        sessionStorage.removeItem(PKCE_STATE_KEY);
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        window.history.replaceState({}, '', '/');
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Auth0 callback error');
      } finally {
        setAuthBusy(false);
      }
    })();
  }, [auth0ClientId, auth0Domain]);

  const startAuth0Login = useCallback(async () => {
    if (!auth0ClientId) {
      return false;
    }
    const { verifier, challenge, state } = await generatePkcePair();
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    sessionStorage.setItem(PKCE_STATE_KEY, state);

    const redirectUri =
      import.meta.env.VITE_AUTH0_REDIRECT_URI || `${window.location.origin}/callback`;

    const authorizeUrl =
      `https://${auth0Domain}/authorize?` +
      new URLSearchParams({
        response_type: 'code',
        client_id: auth0ClientId,
        redirect_uri: redirectUri,
        scope: 'openid profile email',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();

    window.location.assign(authorizeUrl);
    return true;
  }, [auth0ClientId, auth0Domain]);

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
    setAuthError(null);
  }, []);

  const signOut = useCallback(() => {
    setStore((prev) => ({ ...prev, session: null }));
  }, []);

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
        return {
          ...prev,
          profilesBySub: {
            ...prev.profilesBySub,
            [currentSub]: [newProfile, ...existing],
          },
          activeProfileBySub: {
            ...prev.activeProfileBySub,
            [currentSub]: newProfile.id,
          },
        };
      });
    },
    [currentSub]
  );

  const removeHashProfile = useCallback(
    (id: string) => {
      if (!currentSub) return;
      setStore((prev) => {
        const filtered = (prev.profilesBySub[currentSub] || []).filter((p) => p.id !== id);
        const currentActive = prev.activeProfileBySub[currentSub];
        return {
          ...prev,
          profilesBySub: {
            ...prev.profilesBySub,
            [currentSub]: filtered,
          },
          activeProfileBySub: {
            ...prev.activeProfileBySub,
            [currentSub]:
              currentActive === id ? (filtered[0]?.id ?? null) : (currentActive ?? null),
          },
        };
      });
    },
    [currentSub]
  );

  const setActiveProfileId = useCallback(
    (id: string | null) => {
      if (!currentSub) return;
      setStore((prev) => ({
        ...prev,
        activeProfileBySub: {
          ...prev.activeProfileBySub,
          [currentSub]: id,
        },
      }));
    },
    [currentSub]
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
    startAuth0Login,
    signInWorkspaceSession,
    signOut,
    addHashProfile,
    removeHashProfile,
    setActiveProfileId,
  };
}
