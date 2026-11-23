import { useEffect, useState } from 'react';
import { AttributionSection } from './components/AttributionSection';
import { CheckFilePanel } from './components/CheckFilePanel';
import { Footer } from './components/Footer';
import { LegalModal, type LegalTab } from './components/LegalModal';
import { SsoModal } from './components/SsoModal';
import { SsoVaultPanel } from './components/SsoVaultPanel';
import { TopBar, type WorkspaceTab } from './components/TopBar';
import { TransferPanel } from './components/TransferPanel';
import { WorkspaceHero } from './components/WorkspaceHero';
import { useLanguage } from './hooks/useLanguage';
import { useSsoVault } from './hooks/useSsoVault';
import { useTheme } from './hooks/useTheme';
import { useTransferHistory } from './hooks/useTransferHistory';
import { extractVikingHash } from './lib/vikingApi';

function readInitialHashFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const url = new URL(window.location.href);
  const queryHash = url.searchParams.get('f') || url.searchParams.get('hash');
  if (queryHash) {
    return extractVikingHash(queryHash) || null;
  }
  const match = url.pathname.match(/^\/f\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

export default function App() {
  const { theme, setTheme } = useTheme();
  const { lang, setLang } = useLanguage();
  const vault = useSsoVault();
  const { history, addHistoryItem, removeHistoryItem, clearHistory } = useTransferHistory();

  const [inspectedHash, setInspectedHash] = useState<string | null>(() =>
    readInitialHashFromLocation()
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    readInitialHashFromLocation() ? 'check' : 'transfer'
  );

  const [ssoOpen, setSsoOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab>('tos');

  useEffect(() => {
    const onPopState = () => {
      const hash = readInitialHashFromLocation();
      setInspectedHash(hash);
      if (hash) setActiveTab('check');
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleInspectHash = (hash: string) => {
    const clean = extractVikingHash(hash);
    if (!clean) return;
    setInspectedHash(clean);
    setActiveTab('check');
    const nextUrl = `${window.location.pathname.startsWith('/f/') ? '/' : window.location.pathname}?f=${encodeURIComponent(clean)}`;
    window.history.pushState({}, '', nextUrl);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearInspectedHash = () => {
    setInspectedHash(null);
    window.history.replaceState({}, '', '/');
  };

  const handleOpenLegal = (tab: LegalTab = 'tos') => {
    setLegalTab(tab);
    setLegalOpen(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAFA] text-slate-900 dark:bg-[#0B0D11] dark:text-slate-100">
      <TopBar
        lang={lang}
        activeTab={activeTab}
        session={vault.session}
        onSelectTab={setActiveTab}
        onOpenLegal={() => handleOpenLegal('tos')}
        onOpenSso={() => setSsoOpen(true)}
      />

      <main className="flex-1">
        <WorkspaceHero
          lang={lang}
          onChangeLang={setLang}
          theme={theme}
          onChangeTheme={setTheme}
          activeTab={activeTab}
          onSelectTab={setActiveTab}
        />

        <section className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-10">
          {activeTab === 'transfer' && (
            <TransferPanel
              lang={lang}
              session={vault.session}
              profiles={vault.profiles}
              activeProfile={vault.activeProfile}
              onSelectProfileId={vault.setActiveProfileId}
              onOpenSso={() => setSsoOpen(true)}
              onOpenLegal={() => handleOpenLegal('tos')}
              onInspectHash={handleInspectHash}
              history={history}
              onAddHistory={addHistoryItem}
              onRemoveHistory={removeHistoryItem}
              onClearHistory={clearHistory}
            />
          )}

          {activeTab === 'check' && (
            <CheckFilePanel
              lang={lang}
              initialHash={inspectedHash}
              onClearInitialHash={handleClearInspectedHash}
            />
          )}

          {activeTab === 'vault' && (
            <SsoVaultPanel
              lang={lang}
              session={vault.session}
              syncStatus={vault.syncStatus}
              profiles={vault.profiles}
              activeProfile={vault.activeProfile}
              onOpenSso={() => setSsoOpen(true)}
              onAddProfile={vault.addHashProfile}
              onRemoveProfile={vault.removeHashProfile}
              onSetActiveProfile={vault.setActiveProfileId}
              onInspectHash={handleInspectHash}
            />
          )}
        </section>

        <AttributionSection lang={lang} />
      </main>

      <Footer lang={lang} onOpenLegal={handleOpenLegal} />

      <SsoModal
        isOpen={ssoOpen}
        lang={lang}
        session={vault.session}
        auth0Domain={vault.auth0Domain}
        auth0ClientId={vault.auth0ClientId}
        accountPortalUrl={vault.accountPortalUrl}
        authError={vault.authError}
        onStartAuth0={vault.startAuth0Login}
        onSignInWorkspace={(email) => vault.signInWorkspaceSession(email)}
        onSignOut={vault.signOut}
        onClose={() => setSsoOpen(false)}
      />

      <LegalModal
        isOpen={legalOpen}
        activeTab={legalTab}
        lang={lang}
        onChangeTab={setLegalTab}
        onClose={() => setLegalOpen(false)}
      />
    </div>
  );
}
