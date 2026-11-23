import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, LogOut } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoVault';

export type WorkspaceTab = 'transfer' | 'check' | 'vault';

interface TopBarProps {
  lang: Language;
  activeTab: WorkspaceTab;
  session: SsoSession | null;
  accountPortalUrl: string;
  authBusy: boolean;
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenLegal: () => void;
  onSignIn: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}

export function TopBar({
  lang,
  activeTab,
  session,
  accountPortalUrl,
  authBusy,
  onSelectTab,
  onOpenLegal,
  onSignIn,
  onSignOut,
}: TopBarProps) {
  const t = UI_COPY[lang].nav;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!session) setMenuOpen(false);
  }, [session]);

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

        <div className="relative flex items-center shrink-0" ref={menuRef}>
          {session ? (
            <>
              <button
                type="button"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 max-w-[200px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0D11] cursor-pointer"
              >
                <span className="truncate">{session.name}</span>
                <ChevronDown
                  className={`w-4 h-4 shrink-0 transition-transform duration-150 ${
                    menuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-lg py-2 z-50"
                >
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-[#232732]">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {session.name}
                    </p>
                    {session.email && (
                      <p className="mt-0.5 text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                        {session.email}
                      </p>
                    )}
                  </div>

                  <div className="py-1">
                    <a
                      role="menuitem"
                      href={accountPortalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center justify-between gap-2 px-4 py-2 text-xs sm:text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1B202A] transition-colors"
                    >
                      <span>{t.manageAccount}</span>
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    </a>

                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        void onSignOut();
                      }}
                      className="w-full flex items-center justify-between gap-2 px-4 py-2 text-xs sm:text-sm text-red-600 dark:text-red-400 hover:bg-red-50/70 dark:hover:bg-red-950/30 transition-colors cursor-pointer text-left"
                    >
                      <span>{t.signOut}</span>
                      <LogOut className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <button
              type="button"
              disabled={authBusy}
              onClick={() => void onSignIn()}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0B0D11] cursor-pointer"
            >
              {authBusy ? t.signingIn : t.signIn}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
