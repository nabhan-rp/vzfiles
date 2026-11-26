import { useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { VikingHashProfile } from '../hooks/useSsoVault';
import type { LocalTransferRecord } from '../hooks/useTransferHistory';
import { formatBytes } from '../lib/vikingApi';

export type HistoryDeleteTarget =
  | { mode: 'single'; item: LocalTransferRecord }
  | { mode: 'all'; totalCount: number };

interface HistoryDeleteModalProps {
  target: HistoryDeleteTarget | null;
  matchedProfile: VikingHashProfile | null;
  lang: Language;
  isSignedIn: boolean;
  onConfirm: (options: { deleteFromViking: boolean }) => Promise<void>;
  onClose: () => void;
}

export function HistoryDeleteModal({
  target,
  matchedProfile,
  lang,
  isSignedIn,
  onConfirm,
  onClose,
}: HistoryDeleteModalProps) {
  const t = UI_COPY[lang].historyDeleteModal;
  const [deleteFromViking, setDeleteFromViking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDeleteFromViking(false);
    setIsProcessing(false);
    setErrorMsg(null);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [target, isProcessing, onClose]);

  if (!target) return null;

  const canDeleteOnViking =
    target.mode === 'single' && !target.item.isAnonymous && Boolean(matchedProfile);

  const handleConfirmClick = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      await onConfirm({ deleteFromViking: canDeleteOnViking && deleteFromViking });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t.deleteFailedFallback);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-delete-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
      onClick={() => {
        if (!isProcessing) onClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 pb-4 border-b border-slate-200 dark:border-[#232732] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="history-delete-modal-title"
                className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white"
              >
                {target.mode === 'single' ? t.singleTitle : t.allTitle}
              </h2>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {target.mode === 'single'
                  ? isSignedIn
                    ? t.singleSubtitleSynced
                    : t.singleSubtitleLocal
                  : isSignedIn
                    ? t.allSubtitleSynced.replace('{count}', String(target.totalCount))
                    : t.allSubtitleLocal.replace('{count}', String(target.totalCount))}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            aria-label={t.cancel}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {target.mode === 'single' && (
            <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732]">
              <p className="font-medium text-slate-900 dark:text-white break-all">
                {target.item.name}
              </p>
              <p className="mt-1 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {target.item.hash}
                {target.item.size > 0 ? ` · ${formatBytes(target.item.size)}` : ''}
                {target.item.profileLabel ? ` · ${target.item.profileLabel}` : ''}
              </p>
            </div>
          )}

          {/* Clear Recycle Bin & VikingFiles Storage Disclaimer */}
          <div className="p-3.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/50 flex items-start gap-2.5 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="space-y-1">
              <p className="font-semibold">{t.disclaimerHeading}</p>
              <p className="leading-relaxed">
                {target.mode === 'all'
                  ? t.disclaimerAll
                  : target.item.isAnonymous
                    ? t.disclaimerAnonymous
                    : canDeleteOnViking
                      ? deleteFromViking
                        ? t.disclaimerHashedPermanent
                        : t.disclaimerHashedAvailable
                      : t.disclaimerHashedMissingProfile}
              </p>
            </div>
          </div>

          {/* Optional Permanent VikingFile Deletion Checkbox for Hashed Uploads */}
          {canDeleteOnViking && matchedProfile && (
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#262C3A] cursor-pointer hover:border-red-300 dark:hover:border-red-800/70 transition-colors">
              <input
                type="checkbox"
                checked={deleteFromViking}
                disabled={isProcessing}
                onChange={(e) => setDeleteFromViking(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-red-600 focus:ring-red-500 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="block text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                  {t.vikingCheckboxLabel.replace('{profile}', matchedProfile.label)}
                </span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {t.vikingCheckboxHint}
                </span>
              </div>
            </label>
          )}

          {errorMsg && (
            <div
              role="alert"
              className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2 text-xs sm:text-sm text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={isProcessing}
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {t.cancel}
          </button>
          <button
            type="button"
            disabled={isProcessing}
            onClick={() => void handleConfirmClick()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t.deleting}</span>
              </>
            ) : (
              <span>
                {target.mode === 'all'
                  ? t.confirmAll
                  : deleteFromViking && canDeleteOnViking
                    ? t.confirmSingleWithViking
                    : t.confirmSingle}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
