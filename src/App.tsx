import { useEffect, useState } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { AttributionSection } from './components/AttributionSection';
import { ChangelogModal } from './components/ChangelogModal';
import { CheckFilePanel } from './components/CheckFilePanel';
import { Footer } from './components/Footer';
import { LegalModal, type LegalTab } from './components/LegalModal';
import { SsoVaultPanel } from './components/SsoVaultPanel';
import { TopBar, type WorkspaceTab } from './components/TopBar';
import { TransferPanel } from './components/TransferPanel';
import { WorkspaceHero } from './components/WorkspaceHero';
import { UI_COPY } from './data/i18n';
import { useDocumentSeo } from './hooks/useDocumentSeo';
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
  const vault = useSsoVault(lang);
  const {
    history,
    syncStatus: historySyncStatus,
    addHistoryItem,
    removeHistoryItem,
    clearHistory,
  } = useTransferHistory();

  const [inspectedHash, setInspectedHash] = useState<string | null>(() =>
    readInitialHashFromLocation()
  );
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() =>
    readInitialHashFromLocation() ? 'check' : 'transfer'
  );

  const [legalOpen, setLegalOpen] = useState(false);
  const [legalTab, setLegalTab] = useState<LegalTab>('tos');
  const [changelogOpen, setChangelogOpen] = useState(false);

  useDocumentSeo(lang, activeTab, inspectedHash);

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
        accountPortalUrl={vault.accountPortalUrl}
        authBusy={vault.authBusy}
        onSelectTab={setActiveTab}
        onOpenLegal={() => handleOpenLegal('tos')}
        onSignIn={vault.signIn}
        onSignOut={vault.signOut}
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
          {vault.hasAuthError && (
            <div
              role="alert"
              className="mb-6 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-center justify-between gap-3 text-xs sm:text-sm text-red-700 dark:text-red-300"
            >
              <div className="flex items-center gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{UI_COPY[lang].nav.signInError}</span>
              </div>
              <button
                type="button"
                onClick={vault.dismissAuthError}
                aria-label={UI_COPY[lang].nav.dismissError}
                className="p-1 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'transfer' && (
            <TransferPanel
              lang={lang}
              session={vault.session}
              profiles={vault.profiles}
              activeProfile={vault.activeProfile}
              onSelectProfileId={vault.setActiveProfileId}
              onSignIn={vault.signIn}
              onOpenVault={() => setActiveTab('vault')}
              onOpenLegal={() => handleOpenLegal('tos')}
              onInspectHash={handleInspectHash}
              history={history}
              historySyncStatus={historySyncStatus}
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
              onSignIn={vault.signIn}
              onAddProfile={vault.addHashProfile}
              onRemoveProfile={vault.removeHashProfile}
              onSetActiveProfile={vault.setActiveProfileId}
              onInspectHash={handleInspectHash}
            />
          )}
        </section>

        <AttributionSection lang={lang} />
      </main>

      <Footer
        lang={lang}
        onOpenLegal={handleOpenLegal}
        onOpenChangelog={() => setChangelogOpen(true)}
      />

      <LegalModal
        isOpen={legalOpen}
        activeTab={legalTab}
        lang={lang}
        onChangeTab={setLegalTab}
        onClose={() => setLegalOpen(false)}
      />

      <ChangelogModal
        isOpen={changelogOpen}
        lang={lang}
        onClose={() => setChangelogOpen(false)}
      />
    </div>
  );
}
