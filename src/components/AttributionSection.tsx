import { ArrowUpRight } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';

interface AttributionSectionProps {
  lang: Language;
}

export function AttributionSection({ lang }: AttributionSectionProps) {
  const t = UI_COPY[lang].attribution;

  return (
    <section className="max-w-[1200px] mx-auto px-4 sm:px-6 pb-12 sm:pb-16">
      <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-4">
        {t.heading}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subdomain-scoped VikingFiles credit & sponsor */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] flex flex-col justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-blue-600 dark:text-blue-400">
              files.vz.gay · file.vz.gay
            </p>
            <h3 className="mt-1.5 font-display text-base font-bold text-slate-900 dark:text-white">
              {t.vikingTitle}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.vikingDesc}
            </p>
          </div>
          <div>
            <a
              href="https://vikingfiles.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#1C202B] dark:hover:bg-[#252B3B] rounded-lg transition-colors whitespace-nowrap"
            >
              <span>{t.vikingCta}</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>

        {/* Corporate umbrella: galbay (PT Galeri Langkah Bahagia Yuwana) */}
        <div className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] flex flex-col justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
              galbay · vz.gay · jajanserver.com
            </p>
            <h3 className="mt-1.5 font-display text-base font-bold text-slate-900 dark:text-white">
              {t.globalTitle}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.globalDesc}
            </p>
          </div>
          <div>
            <a
              href="https://jajanserver.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-900 dark:text-white bg-slate-100 hover:bg-slate-200 dark:bg-[#1C202B] dark:hover:bg-[#252B3B] rounded-lg transition-colors whitespace-nowrap"
            >
              <span>{t.globalCta}</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
