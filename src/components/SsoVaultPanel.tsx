import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  ChevronDown,
  Edit3,
  Eye,
  HelpCircle,
  KeyRound,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { SsoSession, VaultSyncStatus, VikingHashProfile } from '../hooks/useSsoVault';
import {
  buildVikingOfficialUrl,
  deleteVikingFile,
  formatBytes,
  listVikingFiles,
  renameVikingFile,
  type VikingListedFile,
} from '../lib/vikingApi';

interface SsoVaultPanelProps {
  lang: Language;
  session: SsoSession | null;
  syncStatus: VaultSyncStatus;
  profiles: VikingHashProfile[];
  activeProfile: VikingHashProfile | null;
  onSignIn: () => void | Promise<void>;
  onAddProfile: (input: { label: string; userHash: string; defaultPath?: string }) => void;
  onRemoveProfile: (id: string) => void;
  onSetActiveProfile: (id: string | null) => void;
  onInspectHash: (hash: string) => void;
}

export function SsoVaultPanel({
  lang,
  session,
  syncStatus,
  profiles,
  activeProfile,
  onSignIn,
  onAddProfile,
  onRemoveProfile,
  onSetActiveProfile,
  onInspectHash,
}: SsoVaultPanelProps) {
  const t = UI_COPY[lang].vault;

  const [label, setLabel] = useState('');
  const [userHash, setUserHash] = useState('');
  const [defaultPath, setDefaultPath] = useState('vz-files');

  const [pathFilter, setPathFilter] = useState('');
  const [page, setPage] = useState(1);
  const [maxPages, setMaxPages] = useState(1);
  const [files, setFiles] = useState<VikingListedFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const [renamingHash, setRenamingHash] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busyHash, setBusyHash] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(() => profiles.length === 0);

  useEffect(() => {
    if (profiles.length === 0) {
      setGuideOpen(true);
    }
  }, [profiles.length]);

  const fetchFiles = useCallback(
    async (targetPage = page) => {
      if (!activeProfile) {
        setFiles([]);
        return;
      }
      setLoadingFiles(true);
      setVaultError(null);
      try {
        const res = await listVikingFiles({
          userHash: activeProfile.userHash,
          page: targetPage,
          path: pathFilter.trim() || undefined,
        });
        setFiles(Array.isArray(res.files) ? res.files : []);
        setPage(res.currentPage || targetPage);
        setMaxPages(res.maxPages || 1);
      } catch (err) {
        setVaultError(err instanceof Error ? err.message : 'Failed to load files');
        setFiles([]);
      } finally {
        setLoadingFiles(false);
      }
    },
    [activeProfile, page, pathFilter]
  );

  useEffect(() => {
    if (session && activeProfile) {
      void fetchFiles(1);
    } else {
      setFiles([]);
    }
  }, [session?.sub, activeProfile?.id]);

  const handleAddProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim() || !userHash.trim()) return;
    onAddProfile({
      label: label.trim(),
      userHash: userHash.trim(),
      defaultPath: defaultPath.trim() || 'vz-files',
    });
    setLabel('');
    setUserHash('');
  };

  const handleRenameSubmit = async (hash: string) => {
    if (!activeProfile || !renameValue.trim()) return;
    setBusyHash(hash);
    setVaultError(null);
    try {
      const res = await renameVikingFile({
        hash,
        userHash: activeProfile.userHash,
        filename: renameValue.trim(),
      });
      if (res.error && res.error !== 'success') {
        throw new Error(res.error);
      }
      setRenamingHash(null);
      await fetchFiles(page);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Rename failed');
    } finally {
      setBusyHash(null);
    }
  };

  const handleDelete = async (hash: string) => {
    if (!activeProfile) return;
    setBusyHash(hash);
    setVaultError(null);
    try {
      const res = await deleteVikingFile({
        hash,
        userHash: activeProfile.userHash,
      });
      if (res.error && res.error !== 'success') {
        throw new Error(res.error);
      }
      await fetchFiles(page);
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyHash(null);
    }
  };

  if (!session) {
    return (
      <div id="vault" className="space-y-6">
        <div className="rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] p-8 sm:p-10 text-center">
          <div className="w-12 h-12 mx-auto rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="mt-4 font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            {t.signedOutTitle}
          </h2>
          <p className="mt-2 max-w-xl mx-auto text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {t.signedOutDesc}
          </p>
          <button
            type="button"
            onClick={() => void onSignIn()}
            className="mt-6 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors cursor-pointer"
          >
            {t.signInCta}
          </button>
        </div>

        <div className="rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] p-6 sm:p-8 space-y-5">
          <div>
            <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              {t.guideTitle}
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-3xl">
              {t.guideSubtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {t.guideSteps.map((item) => (
              <div
                key={item.step}
                className="p-4 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] space-y-1.5"
              >
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-blue-600 dark:bg-blue-500 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                    {item.step}
                  </span>
                  <h4 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </h4>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <a
              href="https://vikingfile.com/register"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
            >
              <span>{t.createHashBtn}</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
            <a
              href="https://vikingfile.com/login"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] rounded-lg transition-colors whitespace-nowrap"
            >
              <span>{t.loginVikingBtn}</span>
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="vault" className="space-y-6">
      {/* Header & Profile Manager */}
      <div className="rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-[#232732]">
          <div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              {t.title}
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-2xl">
              {t.subtitle}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 dark:text-slate-400">{t.activeSessionLabel}</p>
            <p className="font-mono text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
              {session.email}
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {syncStatus === 'synced' && t.syncSynced}
              {syncStatus === 'syncing' && t.syncSyncing}
              {syncStatus === 'error' && t.syncError}
              {syncStatus === 'local' && t.syncLocal}
            </p>
          </div>
        </div>

        {/* Add New VikingFile User Hash */}
        <form onSubmit={handleAddProfile} className="space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            {t.addProfileTitle}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t.labelPlaceholder}
              className="sm:col-span-3 px-3.5 py-2 text-sm rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
            />
            <input
              type="text"
              required
              value={userHash}
              onChange={(e) => setUserHash(e.target.value)}
              placeholder={t.hashPlaceholder}
              className="sm:col-span-4 px-3.5 py-2 text-sm font-mono rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
            />
            <input
              type="text"
              value={defaultPath}
              onChange={(e) => setDefaultPath(e.target.value)}
              placeholder={t.pathPlaceholder}
              className="sm:col-span-3 px-3.5 py-2 text-sm font-mono rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
            />
            <button
              type="submit"
              className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{t.addProfileBtn}</span>
            </button>
          </div>
        </form>

        {/* 3-Step VikingFiles Onboarding Card */}
        <div className="rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] p-4 sm:p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <HelpCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
                {t.guideTitle}
              </h3>
            </div>
            <button
              type="button"
              aria-expanded={guideOpen}
              onClick={() => setGuideOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
            >
              <span>{guideOpen ? t.guideToggleHide : t.guideToggleShow}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-150 ${
                  guideOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
          </div>

          {guideOpen && (
            <div className="space-y-4 pt-1">
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {t.guideSubtitle}
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {t.guideSteps.map((item) => (
                  <div
                    key={item.step}
                    className="p-3.5 rounded-lg bg-white dark:bg-[#13161C] border border-slate-200/80 dark:border-[#232732] space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-md bg-blue-600 dark:bg-blue-500 text-white font-mono text-xs font-bold flex items-center justify-center shrink-0">
                        {item.step}
                      </span>
                      <h4 className="font-display text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                        {item.title}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <a
                  href="https://vikingfile.com/register"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>{t.createHashBtn}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
                <a
                  href="https://vikingfile.com/login"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-[#191D26] border border-slate-200 dark:border-[#2B3242] hover:bg-slate-100 dark:hover:bg-[#222834] rounded-lg transition-colors whitespace-nowrap"
                >
                  <span>{t.loginVikingBtn}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Saved Profiles List */}
        <div className="space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-white">
            {t.savedProfilesTitle}
          </h3>
          {profiles.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-200 dark:border-[#232732] text-center">
              <KeyRound className="w-6 h-6 mx-auto text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">
                {t.noProfilesTitle}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t.noProfilesDesc}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {profiles.map((profile) => {
                const isActive = activeProfile?.id === profile.id;
                return (
                  <div
                    key={profile.id}
                    className={`p-4 rounded-xl border transition-colors flex flex-col justify-between gap-3 ${
                      isActive
                        ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-500/60 dark:border-blue-500/50'
                        : 'bg-[#FAFAFA] dark:bg-[#0B0D11] border-slate-200 dark:border-[#232732]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                        {profile.label}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                        {profile.userHash}
                      </p>
                      {profile.defaultPath && (
                        <p className="mt-0.5 font-mono text-xs text-slate-500 dark:text-slate-400 truncate">
                          path: {profile.defaultPath}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/70 dark:border-[#232732]">
                      <button
                        type="button"
                        onClick={() => onSetActiveProfile(profile.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-[#191D26] border border-slate-200 dark:border-[#2B3242] text-slate-700 dark:text-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {isActive && <Check className="w-3 h-3" />}
                        <span>{isActive ? t.activeForUpload : t.useForUpload}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemoveProfile(profile.id)}
                        aria-label={t.removeProfile}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Remote File Manager Table for Active Profile */}
      {activeProfile && (
        <div className="rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#232732] p-6 sm:p-8 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#232732]">
            <div>
              <h3 className="font-display text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {t.filesTitle}: {activeProfile.label}
              </h3>
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {activeProfile.userHash}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={pathFilter}
                onChange={(e) => setPathFilter(e.target.value)}
                placeholder={t.pathFilterPlaceholder}
                className="px-3 py-1.5 text-xs sm:text-sm font-mono rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600"
              />
              <button
                type="button"
                onClick={() => void fetchFiles(1)}
                disabled={loadingFiles}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] text-slate-900 dark:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingFiles ? 'animate-spin' : ''}`} />
                <span>{t.refreshFiles}</span>
              </button>
            </div>
          </div>

          {vaultError && (
            <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 flex items-start gap-2.5 text-xs sm:text-sm text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{vaultError}</span>
            </div>
          )}

          {loadingFiles ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t.loadingFiles}
            </p>
          ) : files.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
              {t.emptyFiles}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#232732] text-xs font-medium text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 pr-4">{t.colName}</th>
                      <th className="py-2.5 px-4 text-right">{t.colSize}</th>
                      <th className="py-2.5 px-4 text-right">{t.colDownloads}</th>
                      <th className="py-2.5 px-4">{t.colCreated}</th>
                      <th className="py-2.5 pl-4 text-right">{t.colActions}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#1E232D]">
                    {files.map((file) => {
                      const isRenaming = renamingHash === file.hash;
                      const isBusy = busyHash === file.hash;

                      return (
                        <tr
                          key={file.hash}
                          className="hover:bg-slate-50/70 dark:hover:bg-[#181C24] transition-colors"
                        >
                          <td className="py-3 pr-4 max-w-[260px]">
                            {isRenaming ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  className="w-full px-2 py-1 text-xs rounded-md bg-white dark:bg-[#0B0D11] border border-blue-500 text-slate-900 dark:text-white focus:outline-none"
                                />
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleRenameSubmit(file.hash)}
                                  className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded-md cursor-pointer"
                                >
                                  {t.saveRename}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRenamingHash(null)}
                                  className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                                  aria-label={t.cancelRename}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <p className="font-medium text-slate-900 dark:text-white truncate">
                                  {file.name}
                                </p>
                                <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {file.hash}
                                </p>
                              </>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                            {formatBytes(file.size)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                            {file.downloads}
                          </td>
                          <td className="py-3 px-4 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                            {file.created}
                          </td>
                          <td className="py-3 pl-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => onInspectHash(file.hash)}
                                aria-label="Info"
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1D222D] transition-colors cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <a
                                href={buildVikingOfficialUrl(file.hash)}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label="VikingFile"
                                className="p-1.5 rounded-md text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-[#1D222D] transition-colors"
                              >
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setRenamingHash(file.hash);
                                  setRenameValue(file.name);
                                }}
                                aria-label={t.renameAction}
                                className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1D222D] transition-colors cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleDelete(file.hash)}
                                aria-label={t.deleteAction}
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

              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#1E232D] text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono tabular-nums">
                  {t.pageInfo} {page} / {maxPages}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1 || loadingFiles}
                    onClick={() => void fetchFiles(page - 1)}
                    className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] disabled:opacity-50 text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {t.prevPage}
                  </button>
                  <button
                    type="button"
                    disabled={page >= maxPages || loadingFiles}
                    onClick={() => void fetchFiles(page + 1)}
                    className="px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-[#1D222D] dark:hover:bg-[#262C3B] disabled:opacity-50 text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {t.nextPage}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
