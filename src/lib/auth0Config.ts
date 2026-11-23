export const DEFAULT_AUTH0_DOMAIN = 'accounts.vz.gay';
export const DEFAULT_AUTH0_CLIENT_ID = 'wxhySCLqtKPGy53uEVWvH2RumGdIp1DP';

export function getAuth0Config() {
  const domain = import.meta.env.VITE_AUTH0_DOMAIN || DEFAULT_AUTH0_DOMAIN;
  const clientId = import.meta.env.VITE_AUTH0_CLIENT_ID || DEFAULT_AUTH0_CLIENT_ID;
  const redirectUri =
    import.meta.env.VITE_AUTH0_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/` : 'https://files.vz.gay/');
  const accountPortalUrl = import.meta.env.VITE_ACCOUNT_PORTAL_URL || 'https://myaccount.vz.gay';

  return {
    domain,
    clientId,
    redirectUri,
    accountPortalUrl,
  };
}
