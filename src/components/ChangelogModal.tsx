import { useEffect, useState } from 'react';
import { ArrowUpRight, History, X } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';

interface ChangelogModalProps {
  isOpen: boolean;
  lang: Language;
  onClose: () => void;
}

export function ChangelogModal({ isOpen, lang, onClose }: ChangelogModalProps) {
  const t = UI_COPY[lang].changelogModal;
  const [selectedVersion, setSelectedVersion] = useState<string>(t.releases[0].version);

  useEffect(() => {
    if (isOpen) {
      setSelectedVersion(t.releases[0].version);
    }
  }, [isOpen, t.releases]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeRelease =
    t.releases.find((release) => release.version === selectedVersion) || t.releases[0];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="changelog-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-slate-200 dark:border-[#232732] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="changelog-modal-title"
                className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                {t.title}
              </h2>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono tabular-nums font-semibold text-blue-600 dark:text-blue-400">
                  {activeRelease.version}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{activeRelease.releaseDate}</span>
                <span aria-hidden="true">·</span>
                <span>{activeRelease.releaseLabel}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version Selector Tabs */}
        <div className="px-6 pt-4">
          <div
            role="tablist"
            aria-label={t.versionSelectorLabel}
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38]"
          >
            {t.releases.map((release) => {
              const isActive = release.version === activeRelease.version;
              return (
                <button
                  key={release.version}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setSelectedVersion(release.version)}
                  className={`px-3 py-1.5 text-xs font-mono tabular-nums font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {release.version}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          <p>{activeRelease.intro}</p>

          <div className="space-y-5">
            {activeRelease.sections.map((section) => (
              <div
                key={section.heading}
                className="pt-4 border-t border-slate-100 dark:border-[#202531]"
              >
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  {section.heading}
                </h3>
                <ul className="mt-2.5 space-y-2">
                  {section.items.map((item) => (
                    <li key={item.title} className="leading-relaxed">
                      <span className="font-medium text-slate-900 dark:text-slate-100">
                        {item.title}
                      </span>
                      <span className="text-slate-400 dark:text-slate-500"> — </span>
                      <span>{item.desc}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-4">
            <a
              href="https://vz.gay"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              <span>{t.ecosystemLink}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://vikingfiles.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              <span>{t.partnerLink}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
