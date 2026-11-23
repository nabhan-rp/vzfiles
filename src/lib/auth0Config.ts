export const DEFAULT_AUTH0_DOMAIN = 'accounts.vz.gay';
export const DEFAULT_AUTH0_CLIENT_ID = 'wxhySCLqtKPGy53uEVWvH2RumGdIp1DP';

const VZ_FILES_PRODUCTION_HOSTS = new Set(['files.vz.gay', 'file.vz.gay']);

export function getAuth0Config() {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN || DEFAULT_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || DEFAULT_AUTH0_CLIENT_ID;
  const accountPortalUrl = import.meta.env.VITE_ACCOUNT_PORTAL_URL || 'https://myaccount.vz.gay';

  let redirectUri = 'https://files.vz.gay/';
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase();
    // Pin redirectUri to active origin for files.vz.gay / file.vz.gay to prevent cross-domain PKCE loss
    if (VZ_FILES_PRODUCTION_HOSTS.has(hostname)) {
      redirectUri = `${window.location.origin}/`;
    } else {
      redirectUri = import.meta.env.VITE_AUTH0_REDIRECT_URI || `${window.location.origin}/`;
    }
  } else if (import.meta.env.VITE_AUTH0_REDIRECT_URI) {
    redirectUri = String(import.meta.env.VITE_AUTH0_REDIRECT_URI);
  }

  return {
    domain,
    clientId,
    redirectUri,
    accountPortalUrl,
  };
}
