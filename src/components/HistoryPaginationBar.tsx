import { ChevronLeft, ChevronRight } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { HistoryPageSize } from '../hooks/useTransferHistory';

interface HistoryPaginationBarProps {
  lang: Language;
  totalItems: number;
  currentPage: number;
  pageSize: HistoryPageSize;
  onChangePage: (page: number) => void;
  onChangePageSize: (size: HistoryPageSize) => void;
}

const PAGE_SIZE_OPTIONS: HistoryPageSize[] = [25, 50, 100, 'all'];

export function HistoryPaginationBar({
  lang,
  totalItems,
  currentPage,
  pageSize,
  onChangePage,
  onChangePageSize,
}: HistoryPaginationBarProps) {
  const t = UI_COPY[lang].pagination;

  if (totalItems === 0) return null;

  const isAll = pageSize === 'all';
  const numericSize = isAll ? totalItems : pageSize;
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalItems / numericSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);
  const startIdx = isAll ? 1 : (safePage - 1) * numericSize + 1;
  const endIdx = isAll ? totalItems : Math.min(totalItems, safePage * numericSize);

  return (
    <div className="mt-4 pt-4 border-t border-slate-200 dark:border-[#232732] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
      {/* Left: Page Size Selector (25 / 50 / 100 / ALL) + Live Range */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {t.perPageLabel}
          </span>
          <div
            role="group"
            aria-label={t.perPageLabel}
            className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38]"
          >
            {PAGE_SIZE_OPTIONS.map((option) => {
              const active = pageSize === option;
              return (
                <button
                  key={String(option)}
                  type="button"
                  onClick={() => onChangePageSize(option)}
                  className={`px-2 py-1 text-xs font-mono tabular-nums font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {option === 'all' ? t.allOption : option}
                </button>
              );
            })}
          </div>
        </div>

        <span aria-hidden="true" className="hidden sm:inline text-slate-300 dark:text-slate-600">
          ·
        </span>

        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {isAll
            ? t.showingAll.replace('{total}', String(totalItems))
            : t.showingRange
                .replace('{start}', String(startIdx))
                .replace('{end}', String(endIdx))
                .replace('{total}', String(totalItems))}
        </span>
      </div>

      {/* Right: Previous / Page X of Y / Next */}
      {!isAll && totalPages > 1 && (
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onChangePage(safePage - 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] text-slate-800 dark:text-slate-100 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{t.prev}</span>
          </button>

          <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300 px-1.5 whitespace-nowrap">
            {t.pageOf
              .replace('{page}', String(safePage))
              .replace('{totalPages}', String(totalPages))}
          </span>

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => onChangePage(safePage + 1)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] text-slate-800 dark:text-slate-100 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>{t.next}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
