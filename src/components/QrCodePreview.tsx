import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';

export type QrTargetMode = 'vz' | 'viking';

interface QrCodePreviewProps {
  lang: Language;
  hash: string;
  vzUrl: string;
  vikingUrl: string;
  target: QrTargetMode;
  onChangeTarget: (target: QrTargetMode) => void;
  isCopied: boolean;
  onCopyUrl: (url: string) => void;
}

export function QrCodePreview({
  lang,
  hash,
  vzUrl,
  vikingUrl,
  target,
  onChangeTarget,
  isCopied,
  onCopyUrl,
}: QrCodePreviewProps) {
  const t = UI_COPY[lang].check;
  const tc = UI_COPY[lang].transfer;

  const activeUrl = target === 'vz' ? vzUrl : vikingUrl;
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [qrError, setQrError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setQrError(null);

    QRCode.toDataURL(activeUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0B0D11',
        light: '#FFFFFF',
      },
    })
      .then((dataUrl) => {
        if (active) setQrDataUrl(dataUrl);
      })
      .catch((err) => {
        if (active) {
          setQrError(err instanceof Error ? err.message : 'Failed to generate QR code');
        }
      });

    return () => {
      active = false;
    };
  }, [activeUrl]);

  return (
    <div className="mt-4 pt-4 border-t border-slate-200/80 dark:border-[#232732] flex flex-col sm:flex-row items-start sm:items-center gap-5">
      {/* High-contrast white quiet-zone container for reliable mobile scanning in Light & Dark modes */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 dark:border-[#2B3242] shrink-0">
        {qrDataUrl && !qrError ? (
          <img
            src={qrDataUrl}
            alt={`${t.qrAltPrefix} ${activeUrl}`}
            referrerPolicy="no-referrer"
            className="w-36 h-36 sm:w-40 sm:h-40 block"
          />
        ) : (
          <div className="w-36 h-36 sm:w-40 sm:h-40 flex items-center justify-center text-xs text-slate-500 text-center px-2">
            {qrError || '...'}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        <div>
          <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            {t.qrTitle}
          </p>

          <div
            role="group"
            aria-label="QR Target URL"
            className="mt-2 inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38]"
          >
            <button
              type="button"
              onClick={() => onChangeTarget('vz')}
              aria-pressed={target === 'vz'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                target === 'vz'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.qrTargetVz}
            </button>
            <button
              type="button"
              onClick={() => onChangeTarget('viking')}
              aria-pressed={target === 'viking'}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                target === 'viking'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.qrTargetViking}
            </button>
          </div>
        </div>

        <p className="font-mono text-xs text-slate-600 dark:text-slate-300 break-all">
          {activeUrl}
        </p>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onCopyUrl(activeUrl)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              isCopied
                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/50 text-emerald-700 dark:text-emerald-300'
                : 'bg-white dark:bg-[#191D26] border-slate-200 dark:border-[#2B3242] text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#222834]'
            }`}
          >
            {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{isCopied ? tc.copied : t.copyLink}</span>
          </button>

          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`${hash}-${target}-qr.png`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] text-slate-900 dark:text-white transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t.qrDownloadPng}</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
