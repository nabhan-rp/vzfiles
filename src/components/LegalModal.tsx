import { useEffect } from 'react';
import { ArrowUpRight, FileText, X } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';

export type LegalTab = 'tos' | 'privacy' | 'credit';

interface LegalModalProps {
  isOpen: boolean;
  activeTab: LegalTab;
  lang: Language;
  onChangeTab: (tab: LegalTab) => void;
  onClose: () => void;
}

export function LegalModal({
  isOpen,
  activeTab,
  lang,
  onChangeTab,
  onClose,
}: LegalModalProps) {
  const t = UI_COPY[lang].legalModal;

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-slate-200 dark:border-[#232732] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#1C212C] text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="legal-modal-title"
                className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                {t.title}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                {t.subtitle}
              </p>
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

        <div className="px-6 pt-4">
          <div
            role="tablist"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'tos'}
              onClick={() => onChangeTab('tos')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'tos'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.tabTos}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'privacy'}
              onClick={() => onChangeTab('privacy')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'privacy'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.tabPrivacy}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'credit'}
              onClick={() => onChangeTab('credit')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === 'credit'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.tabCredit}
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {activeTab === 'tos' &&
            t.tosItems.map((item) => (
              <div key={item.heading}>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  {item.heading}
                </h3>
                <p className="mt-1">{item.body}</p>
              </div>
            ))}

          {activeTab === 'privacy' &&
            t.privacyItems.map((item) => (
              <div key={item.heading}>
                <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                  {item.heading}
                </h3>
                <p className="mt-1">{item.body}</p>
              </div>
            ))}

          {activeTab === 'credit' && (
            <div className="space-y-4">
              <p>{t.creditBody}</p>
              <div className="flex flex-wrap gap-3">
                <a
                  href="https://vikingfiles.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] text-slate-900 dark:text-white transition-colors"
                >
                  <span>vikingfiles.com</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://vikingfile.com/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] text-slate-900 dark:text-white transition-colors"
                >
                  <span>vikingfile.com/terms</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://jajanserver.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] text-slate-900 dark:text-white transition-colors"
                >
                  <span>jajanserver.com</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://vikingfile.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <span>{t.openUpstreamTos}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <a
              href="https://vikingfiles.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              <span>{t.openUpstreamHome}</span>
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
