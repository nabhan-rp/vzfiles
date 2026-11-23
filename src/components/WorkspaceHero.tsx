import { ArrowUpRight, Monitor, Moon, Sun } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { ThemePreference } from '../hooks/useTheme';
import type { WorkspaceTab } from './TopBar';

interface WorkspaceHeroProps {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  theme: ThemePreference;
  onChangeTheme: (theme: ThemePreference) => void;
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
}

export function WorkspaceHero({
  lang,
  onChangeLang,
  theme,
  onChangeTheme,
  activeTab,
  onSelectTab,
}: WorkspaceHeroProps) {
  const t = UI_COPY[lang];

  return (
    <section
      id="top"
      className="border-b border-slate-200 dark:border-[#232732] bg-white dark:bg-[#101319]"
    >
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-6 pb-8 sm:pb-10">
        {/* Utility Controls Row */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-7">
          <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            <span>{t.hero.kicker}</span>
            <span aria-hidden="true">·</span>
            <a
              href="https://vz.gay"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <span>{t.hero.backToPortal}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Language Switcher */}
            <div
              role="group"
              aria-label="Language"
              className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38]"
            >
              <button
                type="button"
                onClick={() => onChangeLang('id')}
                aria-pressed={lang === 'id'}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  lang === 'id'
                    ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.controls.langId}
              </button>
              <button
                type="button"
                onClick={() => onChangeLang('en')}
                aria-pressed={lang === 'en'}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  lang === 'en'
                    ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.controls.langEn}
              </button>
            </div>

            {/* Theme Switcher */}
            <div
              role="group"
              aria-label="Theme"
              className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38]"
            >
              <button
                type="button"
                onClick={() => onChangeTheme('system')}
                aria-pressed={theme === 'system'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  theme === 'system'
                    ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>{t.controls.themeSystem}</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeTheme('light')}
                aria-pressed={theme === 'light'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  theme === 'light'
                    ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>{t.controls.themeLight}</span>
              </button>
              <button
                type="button"
                onClick={() => onChangeTheme('dark')}
                aria-pressed={theme === 'dark'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors duration-150 whitespace-nowrap shrink-0 cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>{t.controls.themeDark}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Hero Heading + Workspace Tabs */}
        <div className="max-w-3xl">
          <h1
            className="font-display font-bold tracking-tight text-slate-900 dark:text-white text-balance"
            style={{ fontSize: 'clamp(2rem, 3.6vw, 3rem)', lineHeight: 1.14 }}
          >
            {t.hero.title}
          </h1>
          <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
            {t.hero.subtitle}
          </p>
        </div>

        <div className="mt-7">
          <div
            role="tablist"
            className="inline-flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'transfer'}
              onClick={() => onSelectTab('transfer')}
              className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'transfer'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.tabs.transfer}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'check'}
              onClick={() => onSelectTab('check')}
              className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'check'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.tabs.check}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'vault'}
              onClick={() => onSelectTab('vault')}
              className={`px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'vault'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.tabs.vault}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
