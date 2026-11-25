import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  Eye,
  FileUp,
  Link2,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { SsoSession, VikingHashProfile } from '../hooks/useSsoVault';
import {
  MAX_HISTORY_ITEMS,
  type HistorySyncStatus,
  type LocalTransferRecord,
} from '../hooks/useTransferHistory';
import {
  buildVikingOfficialUrl,
  buildVzShareUrl,
  deleteVikingFile,
  formatBytes,
  uploadFileToViking,
  uploadRemoteUrlToViking,
  type UploadCompleteResponse,
  type UploadProgressState,
} from '../lib/vikingApi';
import { HistoryDeleteModal, type HistoryDeleteTarget } from './HistoryDeleteModal';

type HistoryFilter = 'all' | 'file' | 'remote' | 'anonymous' | 'hashed';

interface TransferPanelProps {
  lang: Language;
  session: SsoSession | null;
  profiles: VikingHashProfile[];
  activeProfile: VikingHashProfile | null;
  onSelectProfileId: (id: string | null) => void;
  onSignIn: () => void | Promise<void>;
  onOpenVault: () => void;
  onOpenLegal: () => void;
  onInspectHash: (hash: string) => void;
  history: LocalTransferRecord[];
  historySyncStatus: HistorySyncStatus;
  onAddHistory: (item: LocalTransferRecord) => void;
  onRemoveHistory: (hash: string) => void | Promise<void>;
  onClearHistory: () => void | Promise<void>;
}

function formatHistoryDate(iso: string, lang: Language): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '—';
  try {
    return new Intl.DateTimeFormat(lang === 'id' ? 'id-ID' : 'en-US', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(time));
  } catch {
    return iso.slice(0, 10);
  }
}

export function TransferPanel({
  lang,
  session,
  profiles,
  activeProfile,
  onSelectProfileId,
  onSignIn,
  onOpenVault,
  onOpenLegal,
  onInspectHash,
  history,
  historySyncStatus,
  onAddHistory,
  onRemoveHistory,
  onClearHistory,
}: TransferPanelProps) {
  const t = UI_COPY[lang].transfer;
  const th = UI_COPY[lang].history;

  const [mode, setMode] = useState<'file' | 'remote'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteName, setRemoteName] = useState('');
  const [folderPath, setFolderPath] = useState(() => activeProfile?.defaultPath || '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<UploadProgressState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<UploadCompleteResponse | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [historyQuery, setHistoryQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [deleteTarget, setDeleteTarget] = useState<HistoryDeleteTarget | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (activeProfile) {
      setFolderPath(activeProfile.defaultPath);
    }
  }, [activeProfile?.id]);

  const filteredHistory = useMemo(() => {
    const q = historyQuery.trim().toLowerCase();
    return history.filter((item) => {
      if (historyFilter === 'file' && item.sourceType !== 'file') return false;
      if (historyFilter === 'remote' && item.sourceType !== 'remote') return false;
      if (historyFilter === 'anonymous' && !item.isAnonymous) return false;
      if (historyFilter === 'hashed' && item.isAnonymous) return false;

      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.hash.toLowerCase().includes(q) ||
        (item.path || '').toLowerCase().includes(q) ||
        (item.profileLabel || '').toLowerCase().includes(q)
      );
    });
  }, [history, historyFilter, historyQuery]);

  const matchedDeleteProfile = useMemo(() => {
    if (!deleteTarget || deleteTarget.mode !== 'single') return null;
    if (deleteTarget.item.isAnonymous || !deleteTarget.item.profileId) return null;
    return profiles.find((p) => p.id === deleteTarget.item.profileId) ?? null;
  }, [deleteTarget, profiles]);

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  const handleFileChange = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSelectedFile(files[0]);
    setErrorMsg(null);
    setResult(null);
  };

  const handleCancelUpload = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsSubmitting(false);
    setProgress(null);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (mode === 'file') {
      if (!selectedFile) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setIsSubmitting(true);
      setResult(null);

      try {
        const res = await uploadFileToViking(
          selectedFile,
          {
            userHash: activeProfile?.userHash || '',
            path: folderPath.trim() || undefined,
          },
          (state) => setProgress(state),
          controller.signal
        );

        setResult(res);
        onAddHistory({
          hash: res.hash,
          name: res.name || selectedFile.name,
          size: res.size || selectedFile.size,
          url: res.url || buildVikingOfficialUrl(res.hash),
          sourceType: 'file',
          isAnonymous: !activeProfile,
          profileId: activeProfile?.id ?? null,
          profileLabel: activeProfile ? activeProfile.label : th.anonymousTag,
          path: folderPath.trim() || undefined,
          createdAt: new Date().toISOString(),
        });
      } catch (err) {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          setErrorMsg(err instanceof Error ? err.message : 'Upload failed');
        }
      } finally {
        abortRef.current = null;
        setIsSubmitting(false);
        setProgress(null);
      }
      return;
    }

    // Remote URL mode
    if (!remoteUrl.trim()) return;
    setIsSubmitting(true);
    setResult(null);
    try {
      const res = await uploadRemoteUrlToViking({
        link: remoteUrl.trim(),
        userHash: activeProfile?.userHash || '',
        name: remoteName.trim() || undefined,
        path: folderPath.trim() || undefined,
      });
      setResult(res);
      onAddHistory({
        hash: res.hash,
        name: res.name || remoteName.trim() || remoteUrl.trim(),
        size: res.size || 0,
        url: res.url || buildVikingOfficialUrl(res.hash),
        sourceType: 'remote',
        isAnonymous: !activeProfile,
        profileId: activeProfile?.id ?? null,
        profileLabel: activeProfile ? activeProfile.label : th.anonymousTag,
        path: folderPath.trim() || undefined,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Remote upload failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmDelete = async ({ deleteFromViking }: { deleteFromViking: boolean }) => {
    if (!deleteTarget) return;

    if (deleteTarget.mode === 'all') {
      await onClearHistory();
      return;
    }

    if (deleteFromViking && matchedDeleteProfile) {
      const res = await deleteVikingFile({
        hash: deleteTarget.item.hash,
        userHash: matchedDeleteProfile.userHash,
      });
      if (res.error) {
        throw new Error(res.error);
      }
    }

    await onRemoveHistory(deleteTarget.item.hash);
  };

  const resetTransferForm = () => {
    setSelectedFile(null);
    setRemoteUrl('');
    setRemoteName('');
    setResult(null);
    setErrorMsg(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const sharePageUrl = result ? buildVzShareUrl(result.hash) : '';
  const officialUrl = result ? result.url || buildVikingOfficialUrl(result.hash) : '';

  const syncStatusText =
    historySyncStatus === 'synced'
      ? th.syncSynced
      : historySyncStatus === 'syncing'
        ? th.syncSyncing
        : historySyncStatus === 'error'
          ? th.syncError
          : th.syncLocal;

  const filterButtons: Array<{ id: HistoryFilter; label: string }> = [
    { id: 'all', label: th.filterAll },
    { id: 'file', label: th.filterFile },
    { id: 'remote', label: th.filterRemote },
    { id: 'anonymous', label: th.filterAnonymous },
    { id: 'hashed', label: th.filterHashed },
  ];

  const hasActiveFilter = historyQuery.trim().length > 0 || historyFilter !== 'all';

  return (
    <div id="transfer" className="space-y-8">
      {/* Main Transfer Card */}
      <div className="rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] p-6 sm:p-8">
        {/* Top Row: Transfer Mode Switcher + Identity Selector */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200 dark:border-[#232732]">
          <div
            role="group"
            aria-label="Transfer Mode"
            className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38] self-start"
          >
            <button
              type="button"
              onClick={() => {
                setMode('file');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'file'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <FileUp className="w-4 h-4" />
              <span>{t.modeFile}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('remote');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mode === 'remote'
                  ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Link2 className="w-4 h-4" />
              <span>{t.modeRemote}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor="transfer-identity-select"
              className="text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap"
            >
              {t.identityLabel}:
            </label>
            <select
              id="transfer-identity-select"
              value={activeProfile?.id || ''}
              onChange={(e) => onSelectProfileId(e.target.value || null)}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs sm:text-sm rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
            >
              <option value="">{t.anonymousOption}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({p.userHash.slice(0, 8)}…)
                </option>
              ))}
            </select>
            {!session && (
              <button
                type="button"
                onClick={() => void onSignIn()}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap cursor-pointer"
              >
                {UI_COPY[lang].nav.signIn}
              </button>
            )}
          </div>
        </div>

        {!activeProfile && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {t.identityHintPrefix}{' '}
            <a
              href="https://vikingfile.com/register"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              vikingfile.com/register
            </a>{' '}
            {t.identityHintMiddle}{' '}
            <button
              type="button"
              onClick={onOpenVault}
              className="font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              {t.identityHintVault}
            </button>
            .
          </p>
        )}

        {/* Upload / Remote Form or Result View */}
        {result ? (
          <div className="mt-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {t.resultTitle}
                  </h2>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300 font-mono tabular-nums">
                    {result.name} · {formatBytes(result.size)} · {result.hash}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={resetTransferForm}
                className="px-3.5 py-2 text-xs sm:text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] text-slate-900 dark:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.uploadAnother}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {/* VZ Files Share Link */}
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.sharePageLabel}
                </p>
                <p className="font-mono text-xs sm:text-sm text-slate-900 dark:text-white break-all">
                  {sharePageUrl}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopy('vz', sharePageUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#191D26] border border-slate-200 dark:border-[#2B3242] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-[#222834] transition-colors cursor-pointer"
                  >
                    {copiedKey === 'vz' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'vz' ? t.copied : t.copy}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onInspectHash(result.hash)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{t.openInfoPage}</span>
                  </button>
                </div>
              </div>

              {/* Official VikingFile Link */}
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2.5">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t.officialPageLabel}
                </p>
                <p className="font-mono text-xs sm:text-sm text-slate-900 dark:text-white break-all">
                  {officialUrl}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopy('viking', officialUrl)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-[#191D26] border border-slate-200 dark:border-[#2B3242] text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-[#222834] transition-colors cursor-pointer"
                  >
                    {copiedKey === 'viking' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'viking' ? t.copied : t.copy}</span>
                  </button>
                  <a
                    href={officialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 text-white transition-colors"
                  >
                    <span>{t.openOnViking}</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleUploadSubmit} className="mt-6 space-y-5">
            {mode === 'file' ? (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  onChange={(e) => handleFileChange(e.target.files)}
                  disabled={isSubmitting}
                />
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => !isSubmitting && fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if ((e.key === 'Enter' || e.key === ' ') && !isSubmitting) {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!isSubmitting) setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (!isSubmitting) handleFileChange(e.dataTransfer.files);
                  }}
                  className={`rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition-colors cursor-pointer ${
                    isDragging
                      ? 'border-blue-600 bg-blue-50/50 dark:border-blue-400 dark:bg-blue-950/20'
                      : 'border-slate-300 dark:border-[#2B3242] bg-[#FAFAFA] dark:bg-[#0B0D11] hover:border-blue-500 dark:hover:border-blue-400'
                  }`}
                >
                  <UploadCloud className="w-9 h-9 mx-auto text-blue-600 dark:text-blue-400" />
                  {selectedFile ? (
                    <div className="mt-3 space-y-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t.selectedFileLabel}
                      </p>
                      <p className="font-display text-base font-semibold text-slate-900 dark:text-white break-all">
                        {selectedFile.name}
                      </p>
                      <p className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {formatBytes(selectedFile.size)}
                      </p>
                      {!isSubmitting && (
                        <p className="pt-2 text-xs font-medium text-blue-600 dark:text-blue-400">
                          {t.changeFile}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="mt-3 space-y-1">
                      <p className="font-display text-sm sm:text-base font-semibold text-slate-900 dark:text-white">
                        {t.dropTitle}
                      </p>
                      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                        {t.dropHint}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="remote-url-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {t.remoteUrlLabel}
                  </label>
                  <input
                    id="remote-url-input"
                    type="url"
                    required
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder={t.remoteUrlPlaceholder}
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="remote-name-input"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    {t.remoteNameLabel}
                  </label>
                  <input
                    id="remote-name-input"
                    type="text"
                    value={remoteName}
                    onChange={(e) => setRemoteName(e.target.value)}
                    placeholder={t.remoteNamePlaceholder}
                    disabled={isSubmitting}
                    className="w-full px-3.5 py-2.5 text-sm rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            {/* Folder Path Input */}
            <div>
              <label
                htmlFor="folder-path-input"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                {t.folderPathLabel}
              </label>
              <input
                id="folder-path-input"
                type="text"
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder={t.folderPathPlaceholder}
                disabled={isSubmitting}
                className="w-full sm:max-w-md px-3.5 py-2 text-sm font-mono rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.folderPathHint}</p>
            </div>

            {/* Active Upload Progress */}
            {isSubmitting && progress && (
              <div className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {progress.phase === 'preparing' && t.preparingStatus}
                    {progress.phase === 'uploading' &&
                      `${t.uploadingStatus} ${progress.currentPart}/${progress.totalParts}`}
                    {progress.phase === 'completing' && t.completingStatus}
                  </span>
                  <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                    {formatBytes(progress.loadedBytes)} / {formatBytes(progress.totalBytes)} ·{' '}
                    {progress.percent}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-[#232732] overflow-hidden">
                  <div
                    className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-150"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error Notice */}
            {errorMsg && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs sm:text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  {t.errorPrefix} {errorMsg}
                </span>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={onOpenLegal}
                className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:underline cursor-pointer text-left"
              >
                {t.agreedNote}
              </button>

              <div className="flex items-center gap-3">
                {isSubmitting && mode === 'file' && (
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    <span>{t.cancelUpload}</span>
                  </button>
                )}
                <button
                  type="submit"
                  disabled={
                    isSubmitting || (mode === 'file' ? !selectedFile : !remoteUrl.trim())
                  }
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {mode === 'file' ? t.startUpload : t.startRemoteUpload}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Synced / Local Transfer History */}
      <div className="rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] p-6 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#232732]">
          <div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <h2 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {th.title}
              </h2>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {history.length} / {MAX_HISTORY_ITEMS}
              </span>
              <span aria-hidden="true" className="text-xs text-slate-300 dark:text-slate-600">
                ·
              </span>
              <span
                className={`text-xs ${
                  historySyncStatus === 'synced'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : historySyncStatus === 'error'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {syncStatusText}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {session ? th.subtitleSynced : th.subtitleLocal}
            </p>
          </div>
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteTarget({ mode: 'all', totalCount: history.length })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50/70 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{th.clearAll}</span>
            </button>
          )}
        </div>

        {/* Search & Source Filter Bar */}
        {history.length > 0 && (
          <div className="mt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
                placeholder={th.searchPlaceholder}
                aria-label={th.searchPlaceholder}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#262C3A] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
              />
            </div>

            <div
              role="group"
              aria-label={th.colSource}
              className="inline-flex flex-wrap items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#191D26] border border-slate-200/80 dark:border-[#262B38] self-start"
            >
              {filterButtons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => setHistoryFilter(btn.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    historyFilter === btn.id
                      ? 'bg-white dark:bg-[#242A37] text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              {th.emptyTitle}
            </p>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {th.emptyDesc}
            </p>
          </div>
        ) : filteredHistory.length === 0 ? (
          <div className="py-10 text-center space-y-2.5">
            <p className="font-display text-sm font-semibold text-slate-900 dark:text-white">
              {th.noMatchTitle}
            </p>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              {th.noMatchDesc}
            </p>
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setHistoryQuery('');
                  setHistoryFilter('all');
                }}
                className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
              >
                {th.resetFilters}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#232732] text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4">{th.colFile}</th>
                  <th className="py-2.5 px-4 text-right">{th.colSize}</th>
                  <th className="py-2.5 px-4">{th.colSource}</th>
                  <th className="py-2.5 px-4">{th.colDate}</th>
                  <th className="py-2.5 pl-4 text-right">{th.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#1E232D]">
                {filteredHistory.map((item) => {
                  const shareLink = buildVzShareUrl(item.hash);
                  const identityText = item.isAnonymous
                    ? th.anonymousTag
                    : item.profileLabel || th.filterHashed;
                  return (
                    <tr
                      key={item.hash}
                      className="hover:bg-slate-50/70 dark:hover:bg-[#181C24] transition-colors"
                    >
                      <td className="py-3 pr-4 max-w-[280px]">
                        <p className="font-medium text-slate-900 dark:text-white truncate">
                          {item.name}
                        </p>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                          {item.hash}
                          {item.path ? ` · ${item.path}` : ''}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                        {item.size > 0 ? formatBytes(item.size) : '—'}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {item.sourceType === 'file' ? th.sourceFile : th.sourceRemote} ·{' '}
                        {identityText}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {formatHistoryDate(item.createdAt, lang)}
                      </td>
                      <td className="py-3 pl-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => onInspectHash(item.hash)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] text-slate-800 dark:text-slate-100 transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>{th.inspect}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopy(`hist-${item.hash}`, shareLink)}
                            aria-label={t.copy}
                            className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1D222D] transition-colors cursor-pointer"
                          >
                            {copiedKey === `hist-${item.hash}` ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <a
                            href={item.url || buildVikingOfficialUrl(item.hash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t.openOnViking}
                            className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1D222D] transition-colors"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget({ mode: 'single', item })}
                            aria-label={th.remove}
                            className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-[#1D222D] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <HistoryDeleteModal
        target={deleteTarget}
        matchedProfile={matchedDeleteProfile}
        lang={lang}
        isSignedIn={Boolean(session)}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
