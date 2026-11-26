import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import {
  getRemainingRetentionDays,
  MAX_HISTORY_ITEMS,
  type HistoryPageSize,
  type LocalTransferRecord,
} from '../hooks/useTransferHistory';
import { formatBytes } from '../lib/vikingApi';
import { HistoryPaginationBar } from './HistoryPaginationBar';

interface RecycleBinModalProps {
  isOpen: boolean;
  lang: Language;
  trash: LocalTransferRecord[];
  onRestoreItem: (hash: string) => void | Promise<void>;
  onRestoreAll: () => void | Promise<void>;
  onDeletePermanentItem: (hash: string) => void | Promise<void>;
  onEmptyBin: () => void | Promise<void>;
  onClose: () => void;
}

export function RecycleBinModal({
  isOpen,
  lang,
  trash,
  onRestoreItem,
  onRestoreAll,
  onDeletePermanentItem,
  onEmptyBin,
  onClose,
}: RecycleBinModalProps) {
  const t = UI_COPY[lang].recycleBin;
  const th = UI_COPY[lang].history;

  const [query, setQuery] = useState('');
  const [pageSize, setPageSize] = useState<HistoryPageSize>(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDeleteHash, setConfirmDeleteHash] = useState<string | null>(null);
  const [confirmEmptyOpen, setConfirmEmptyOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setConfirmDeleteHash(null);
      setConfirmEmptyOpen(false);
      setQuery('');
      setCurrentPage(1);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyAction) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, busyAction, onClose]);

  const filteredTrash = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return trash;
    return trash.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.hash.toLowerCase().includes(q) ||
        (item.path || '').toLowerCase().includes(q) ||
        (item.profileLabel || '').toLowerCase().includes(q)
    );
  }, [trash, query]);

  const totalPages =
    pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredTrash.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage !== safePage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage]);

  const visibleTrash = useMemo(() => {
    if (pageSize === 'all') return filteredTrash;
    const start = (safePage - 1) * pageSize;
    return filteredTrash.slice(start, start + pageSize);
  }, [filteredTrash, pageSize, safePage]);

  if (!isOpen) return null;

  const runAction = async (key: string, fn: () => void | Promise<void>) => {
    setBusyAction(key);
    try {
      await fn();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recycle-bin-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
      onClick={() => {
        if (!busyAction) onClose();
      }}
    >
      <div
        className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-slate-200 dark:border-[#232732] flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#1C212C] text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-2">
                <h2
                  id="recycle-bin-modal-title"
                  className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white"
                >
                  {t.title}
                </h2>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {trash.length} / {MAX_HISTORY_ITEMS}
                </span>
              </div>
              <p className="mt-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {t.subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={onClose}
            aria-label={t.close}
            className="p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Retention & VikingFiles Disclaimer */}
          <div className="p-3.5 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <p className="leading-relaxed">{t.retentionNotice}</p>
          </div>

          {/* Search */}
          {trash.length > 0 && (
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#262C3A] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
              />
            </div>
          )}

          {trash.length === 0 ? (
            <div className="py-10 text-center">
              <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                {t.emptyTitle}
              </p>
              <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                {t.emptyDesc}
              </p>
            </div>
          ) : filteredTrash.length === 0 ? (
            <div className="py-10 text-center space-y-2.5">
              <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                {th.noMatchTitle}
              </p>
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setCurrentPage(1);
                }}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
              >
                {th.resetFilters}
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#232732] text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pr-4">{th.colFile}</th>
                      <th className="py-2.5 px-3 text-right">{th.colSize}</th>
                      <th className="py-2.5 px-3">{t.colExpires}</th>
                      <th className="py-2.5 pl-3 text-right">{th.colActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E232D]">
                    {visibleTrash.map((item) => {
                      const daysLeft = getRemainingRetentionDays(item.deletedAt);
                      const isConfirming = confirmDeleteHash === item.hash;
                      const isRowBusy =
                        busyAction === `restore-${item.hash}` ||
                        busyAction === `delete-${item.hash}`;
                      const identityText = item.isAnonymous
                        ? th.anonymousTag
                        : item.profileLabel || th.filterHashed;

                      return (
                        <tr
                          key={item.hash}
                          className="hover:bg-slate-50/70 dark:hover:bg-[#181C24] transition-colors"
                        >
                          <td className="py-3 pr-4 max-w-[260px]">
                            <p className="font-medium text-slate-900 dark:text-white truncate">
                              {item.name}
                            </p>
                            <p className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                              {item.hash} · {identityText}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                            {item.size > 0 ? formatBytes(item.size) : '—'}
                          </td>
                          <td className="py-3 px-3 font-mono text-xs text-amber-700 dark:text-amber-400 tabular-nums whitespace-nowrap">
                            {t.daysRemaining.replace('{days}', String(daysLeft))}
                          </td>
                          <td className="py-3 pl-3 text-right whitespace-nowrap">
                            {isConfirming ? (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={Boolean(busyAction)}
                                  onClick={() =>
                                    void runAction(`delete-${item.hash}`, async () => {
                                      await onDeletePermanentItem(item.hash);
                                      setConfirmDeleteHash(null);
                                    })
                                  }
                                  className="px-2.5 py-1 text-xs font-semibold rounded-md bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white transition-colors cursor-pointer"
                                >
                                  {busyAction === `delete-${item.hash}`
                                    ? t.working
                                    : t.confirmDeletePermanent}
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(busyAction)}
                                  onClick={() => setConfirmDeleteHash(null)}
                                  className="px-2 py-1 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                                >
                                  {t.cancel}
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={Boolean(busyAction)}
                                  onClick={() =>
                                    void runAction(`restore-${item.hash}`, () =>
                                      onRestoreItem(item.hash)
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 text-blue-700 dark:text-blue-300 disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  {isRowBusy ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-3 h-3" />
                                  )}
                                  <span>{t.restore}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={Boolean(busyAction)}
                                  onClick={() => {
                                    setConfirmEmptyOpen(false);
                                    setConfirmDeleteHash(item.hash);
                                  }}
                                  aria-label={t.deletePermanent}
                                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-[#1D222D] disabled:opacity-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <HistoryPaginationBar
                lang={lang}
                totalItems={filteredTrash.length}
                currentPage={safePage}
                pageSize={pageSize}
                onChangePage={setCurrentPage}
                onChangePageSize={(size) => {
                  setPageSize(size);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
        </div>

        {/* Footer Bulk Controls */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-between gap-3">
          {trash.length > 0 ? (
            confirmEmptyOpen ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-medium text-red-600 dark:text-red-400">
                  {t.emptyConfirmPrompt.replace('{count}', String(trash.length))}
                </span>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() =>
                    void runAction('empty-all', async () => {
                      await onEmptyBin();
                      setConfirmEmptyOpen(false);
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {busyAction === 'empty-all' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{t.confirmEmptyBin}</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => setConfirmEmptyOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {t.cancel}
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => void runAction('restore-all', () => onRestoreAll())}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 dark:hover:bg-blue-950/60 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  {busyAction === 'restore-all' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <RotateCcw className="w-3.5 h-3.5" />
                  )}
                  <span>{t.restoreAll}</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(busyAction)}
                  onClick={() => {
                    setConfirmDeleteHash(null);
                    setConfirmEmptyOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50/70 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.emptyBin}</span>
                </button>
              </div>
            )
          ) : (
            <span />
          )}

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
