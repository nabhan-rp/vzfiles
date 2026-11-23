import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Auth0Provider, type AppState } from '@auth0/auth0-react';
import App from './App.tsx';
import { getAuth0Config } from './lib/auth0Config.ts';
import './index.css';

const { domain, clientId, redirectUri } = getAuth0Config();

const onRedirectCallback = (appState?: AppState) => {
  if (typeof window === 'undefined') return;
  const targetUrl = appState?.returnTo || '/';
  window.history.replaceState({}, document.title, targetUrl);
  window.dispatchEvent(new PopStateEvent('popstate'));
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={domain}
      clientId={clientId}
      cacheLocation="localstorage"
      useRefreshTokens={true}
      authorizationParams={{
        redirect_uri: redirectUri,
        scope: 'openid profile email',
      }}
      onRedirectCallback={onRedirectCallback}
    >
      <App />
    </Auth0Provider>
  </StrictMode>
);
