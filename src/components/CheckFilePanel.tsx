import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  FileSearch,
  QrCode,
  XCircle,
} from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import {
  buildVikingOfficialUrl,
  buildVzShareUrl,
  checkVikingFiles,
  extractVikingHash,
  formatBytes,
  type CheckFileResult,
} from '../lib/vikingApi';
import { QrCodePreview, type QrTargetMode } from './QrCodePreview';

interface CheckFilePanelProps {
  lang: Language;
  initialHash: string | null;
  onClearInitialHash: () => void;
}

async function copyTextWithFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function CheckFilePanel({
  lang,
  initialHash,
  onClearInitialHash,
}: CheckFilePanelProps) {
  const t = UI_COPY[lang].check;
  const tc = UI_COPY[lang].transfer;

  const [input, setInput] = useState(initialHash || '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<CheckFileResult[]>([]);

  const [copiedState, setCopiedState] = useState<{ hash: string; scope: string } | null>(null);
  const [expandedQrHash, setExpandedQrHash] = useState<string | null>(null);
  const [qrTargetByHash, setQrTargetByHash] = useState<Record<string, QrTargetMode>>({});
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  const runCheck = async (rawValue: string) => {
    const tokens = rawValue
      .split(/[\n,\s]+/)
      .map(extractVikingHash)
      .filter(Boolean)
      .slice(0, 100);

    if (tokens.length === 0) return;

    setLoading(true);
    setErrorMsg(null);
    try {
      const checked = await checkVikingFiles(tokens);
      setResults(checked);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialHash) {
      setInput(initialHash);
      void runCheck(initialHash);
    }
  }, [initialHash]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void runCheck(input);
  };

  const handleCopy = async (hash: string, scope: string, value: string) => {
    const ok = await copyTextWithFallback(value);
    if (!ok) return;

    if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    setCopiedState({ hash, scope });
    copyTimerRef.current = window.setTimeout(() => {
      setCopiedState(null);
    }, 2000);
  };

  return (
    <div id="check" className="space-y-6">
      <div className="rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {t.title}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {t.subtitle}
            </p>
          </div>
          {initialHash && (
            <button
              type="button"
              onClick={onClearInitialHash}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] text-slate-800 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {t.closePreview}
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <label
            htmlFor="check-file-input"
            className="block text-xs font-medium text-slate-700 dark:text-slate-300"
          >
            {t.inputLabel}
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <textarea
              id="check-file-input"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.inputPlaceholder}
              className="w-full min-w-0 px-3.5 py-2.5 text-sm font-mono rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0 self-start cursor-pointer"
            >
              {loading ? t.checking : t.submitCheck}
            </button>
          </div>
        </form>

        {errorMsg && (
          <div className="mt-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs sm:text-sm text-red-700 dark:text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && (
          <div className="mt-6 space-y-3 animate-pulse">
            <div className="h-28 rounded-xl bg-slate-100 dark:bg-[#191D26]" />
          </div>
        )}

        {/* Empty State */}
        {!loading && results.length === 0 && (
          <div className="mt-8 py-8 border-t border-slate-100 dark:border-[#1E232D] text-center">
            <FileSearch className="w-8 h-8 mx-auto text-slate-400" />
            <p className="mt-2 font-display text-sm font-semibold text-slate-900 dark:text-white">
              {t.emptyTitle}
            </p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {t.emptyDesc}
            </p>
          </div>
        )}

        {/* Results */}
        {!loading && results.length > 0 && (
          <div className="mt-6 space-y-4">
            {results.map((file) => {
              const officialUrl = buildVikingOfficialUrl(file.hash);
              const shareUrl = buildVzShareUrl(file.hash);
              const isQrOpen = expandedQrHash === file.hash;
              const qrTarget = qrTargetByHash[file.hash] || 'vz';
              const isHeaderCopied =
                copiedState?.hash === file.hash && copiedState.scope === 'header';
              const isQrCopied = copiedState?.hash === file.hash && copiedState.scope === 'qr';

              return (
                <div
                  key={file.hash}
                  className="p-5 sm:p-6 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732]"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1.5">
                      <div className="inline-flex items-center gap-1.5 text-xs font-medium">
                        {file.exist ? (
                          <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{t.availableStatus}</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
                            <XCircle className="w-4 h-4" />
                            <span>{t.missingStatus}</span>
                          </span>
                        )}
                      </div>

                      <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white break-all">
                        {file.name || file.hash}
                      </h3>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        <span>
                          {t.fileHashLabel}:{' '}
                          <span className="font-mono text-slate-800 dark:text-slate-200">
                            {file.hash}
                          </span>
                        </span>
                        {typeof file.size === 'number' && file.size > 0 && (
                          <span>
                            {t.fileSizeLabel}:{' '}
                            <span className="font-mono tabular-nums text-slate-800 dark:text-slate-200">
                              {formatBytes(file.size)}
                            </span>
                          </span>
                        )}
                      </div>
                    </div>

                    {file.exist && (
                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            void handleCopy(
                              file.hash,
                              'header',
                              qrTarget === 'viking' ? officialUrl : shareUrl
                            )
                          }
                          aria-live="polite"
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isHeaderCopied
                              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-white dark:bg-[#191D26] border-slate-200 dark:border-[#2B3242] text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#222834]'
                          }`}
                        >
                          {isHeaderCopied ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                          <span>{isHeaderCopied ? tc.copied : t.copyLink}</span>
                        </button>

                        <button
                          type="button"
                          aria-expanded={isQrOpen}
                          onClick={() =>
                            setExpandedQrHash((prev) => (prev === file.hash ? null : file.hash))
                          }
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            isQrOpen
                              ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 dark:border-white'
                              : 'bg-white dark:bg-[#191D26] border-slate-200 dark:border-[#2B3242] text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#222834]'
                          }`}
                        >
                          <QrCode className="w-4 h-4" />
                          <span>{isQrOpen ? t.qrHide : t.qrShow}</span>
                        </button>

                        <a
                          href={officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>{t.downloadCta}</span>
                          <ArrowUpRight className="w-4 h-4" />
                        </a>
                      </div>
                    )}
                  </div>

                  {file.exist && isHeaderCopied && (
                    <p
                      role="status"
                      className="mt-2.5 text-xs font-medium text-emerald-700 dark:text-emerald-400"
                    >
                      {t.copiedFeedback}
                    </p>
                  )}

                  {file.exist && isQrOpen && (
                    <QrCodePreview
                      lang={lang}
                      hash={file.hash}
                      vzUrl={shareUrl}
                      vikingUrl={officialUrl}
                      target={qrTarget}
                      onChangeTarget={(nextTarget) =>
                        setQrTargetByHash((prev) => ({ ...prev, [file.hash]: nextTarget }))
                      }
                      isCopied={isQrCopied}
                      onCopyUrl={(url) => void handleCopy(file.hash, 'qr', url)}
                    />
                  )}

                  {file.exist && (
                    <p className="mt-4 pt-3 border-t border-slate-200/70 dark:border-[#232732] text-xs text-slate-500 dark:text-slate-400">
                      {t.revenueNote}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
