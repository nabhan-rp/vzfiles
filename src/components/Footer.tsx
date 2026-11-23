import { UI_COPY, type Language } from '../data/i18n';
import type { LegalTab } from './LegalModal';

interface FooterProps {
  lang: Language;
  onOpenLegal: (tab: LegalTab) => void;
  onOpenChangelog: () => void;
}

export function Footer({ lang, onOpenLegal, onOpenChangelog }: FooterProps) {
  const t = UI_COPY[lang].footer;

  return (
    <footer className="border-t border-slate-200 dark:border-[#232732] bg-white dark:bg-[#101319]">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display font-bold text-slate-900 dark:text-white">VZ Files</span>
          <span aria-hidden="true">·</span>
          <span>{t.rights}</span>
        </div>

        <div className="flex flex-wrap items-center gap-5">
          <a
            href="https://vz.gay"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.portalLink}
          </a>
          <a
            href="https://search.vz.gay"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.searchLink}
          </a>
          <button
            type="button"
            onClick={() => onOpenLegal('tos')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {t.tosLink}
          </button>
          <button
            type="button"
            onClick={() => onOpenLegal('privacy')}
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {t.privacyLink}
          </button>
          <button
            type="button"
            onClick={onOpenChangelog}
            className="font-mono tabular-nums hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {t.changelogLink}
          </button>
          <a
            href="https://vikingfiles.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.vikingSponsor}
          </a>
          <a
            href="https://jajanserver.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            {t.globalSponsor}
          </a>
        </div>
      </div>
    </footer>
  );
}
