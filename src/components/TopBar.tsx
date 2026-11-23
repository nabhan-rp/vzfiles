import { UI_COPY, type Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoVault';

export type WorkspaceTab = 'transfer' | 'check' | 'vault';

interface TopBarProps {
  lang: Language;
  activeTab: WorkspaceTab;
  session: SsoSession | null;
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenLegal: () => void;
  onOpenSso: () => void;
}

export function TopBar({
  lang,
  activeTab,
  session,
  onSelectTab,
  onOpenLegal,
  onOpenSso,
}: TopBarProps) {
  const t = UI_COPY[lang].nav;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 dark:border-[#232732] bg-[#FAFAFA]/90 dark:bg-[#0B0D11]/90 backdrop-blur-md">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-8">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            onSelectTab('transfer');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-sm"
        >
          VZ Files
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600 dark:text-slate-300">
          <button
            type="button"
            onClick={() => onSelectTab('transfer')}
            className={`transition-colors duration-150 whitespace-nowrap shrink-0 underline-offset-4 hover:underline cursor-pointer ${
              activeTab === 'transfer'
                ? 'text-slate-900 dark:text-white underline'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.transfer}
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('check')}
            className={`transition-colors duration-150 whitespace-nowrap shrink-0 underline-offset-4 hover:underline cursor-pointer ${
              activeTab === 'check'
                ? 'text-slate-900 dark:text-white underline'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.checkFile}
          </button>
          <button
            type="button"
            onClick={() => onSelectTab('vault')}
            className={`transition-colors duration-150 whitespace-nowrap shrink-0 underline-offset-4 hover:underline cursor-pointer ${
              activeTab === 'vault'
                ? 'text-slate-900 dark:text-white underline'
                : 'hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.vault}
          </button>
          <button
            type="button"
            onClick={onOpenLegal}
            className="hover:text-slate-900 dark:hover:text-white transition-colors duration-150 whitespace-nowrap shrink-0 underline-offset-4 hover:underline cursor-pointer"
          >
            {t.legal}
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onOpenSso}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 max-w-[180px] truncate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0D11] cursor-pointer"
          >
            {session ? session.name : t.signIn}
          </button>
        </div>
      </div>
    </header>
  );
}
