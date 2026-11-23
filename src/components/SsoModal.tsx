import { useEffect, useState } from 'react';
import { ArrowUpRight, LogOut, ShieldCheck, X } from 'lucide-react';
import { UI_COPY, type Language } from '../data/i18n';
import type { SsoSession } from '../hooks/useSsoVault';

interface SsoModalProps {
  isOpen: boolean;
  lang: Language;
  session: SsoSession | null;
  auth0Domain: string;
  auth0ClientId: string;
  accountPortalUrl: string;
  authError: string | null;
  onStartAuth0: () => Promise<boolean>;
  onSignInWorkspace: (email: string) => void;
  onSignOut: () => void | Promise<void>;
  onClose: () => void;
}

export function SsoModal({
  isOpen,
  lang,
  session,
  auth0Domain,
  auth0ClientId,
  accountPortalUrl,
  authError,
  onStartAuth0,
  onSignInWorkspace,
  onSignOut,
  onClose,
}: SsoModalProps) {
  const t = UI_COPY[lang].ssoModal;
  const [identifier, setIdentifier] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleWorkspaceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) return;
    onSignInWorkspace(identifier);
    setIdentifier('');
    onClose();
  };

  const handleAuth0Click = async () => {
    const started = await onStartAuth0();
    if (!started) {
      window.open(`https://${auth0Domain}`, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sso-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#13161C] border border-slate-200 dark:border-[#262C3A] shadow-xl p-6 sm:p-7"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200 dark:border-[#232732]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="sso-modal-title"
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

        <div className="mt-5 space-y-4">
          <div className="space-y-2">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t.ssoDomainLabel}</span>
              <span className="font-mono text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                {auth0Domain}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t.tenantLabel}</span>
              <span className="font-mono text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                galbay · galbay.eu.auth0.com
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">{t.dashboardLabel}</span>
              <span className="font-mono text-xs sm:text-sm font-medium text-slate-900 dark:text-white">
                myaccount.vz.gay
              </span>
            </div>
          </div>

          {authError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg px-3 py-2">
              {authError}
            </p>
          )}

          {session ? (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {session.name}
                </p>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                  {session.email} · {session.mode === 'auth0' ? 'Auth0 SSO' : 'Workspace'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void onSignOut();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-[#191D26] border border-slate-200 dark:border-[#2B3242] rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.signOut}</span>
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {auth0ClientId ? t.statusReady : t.statusPreview}
              </p>

              {!auth0ClientId && (
                <>
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#0E1117] border border-slate-200 dark:border-[#232732] space-y-2 text-xs">
                    <p className="font-display font-semibold text-slate-900 dark:text-white">
                      {t.setupChecklistTitle}
                    </p>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">{t.setupCallbackLabel}</p>
                      <p className="font-mono text-slate-800 dark:text-slate-200 break-all">
                        https://files.vz.gay/callback, https://file.vz.gay/callback
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">{t.setupOriginLabel}</p>
                      <p className="font-mono text-slate-800 dark:text-slate-200 break-all">
                        https://files.vz.gay, https://file.vz.gay
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500 dark:text-slate-400">{t.setupEnvLabel}</p>
                      <p className="font-mono text-slate-800 dark:text-slate-200 break-all">
                        VITE_AUTH0_DOMAIN=accounts.vz.gay · VITE_AUTH0_CLIENT_ID=&lt;SPA_CLIENT_ID&gt;
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleWorkspaceSubmit} className="space-y-3 pt-1">
                    <div>
                      <label
                        htmlFor="vz-workspace-email"
                        className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                      >
                        {t.workspaceEmailLabel}
                      </label>
                      <input
                        id="vz-workspace-email"
                        type="text"
                        required
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder={t.workspaceEmailPlaceholder}
                        className="w-full px-3.5 py-2 text-sm rounded-lg bg-[#FAFAFA] dark:bg-[#0B0D11] border border-slate-300 dark:border-[#2A303E] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500"
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {t.workspaceSignInBtn}
                    </button>
                  </form>
                </>
              )}
            </>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 dark:border-[#232732] flex flex-wrap items-center justify-end gap-3">
          <a
            href={accountPortalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-[#1E232F] dark:hover:bg-[#272D3C] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <span>{t.openDashboard}</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
          {!session && (
            <button
              type="button"
              onClick={() => void handleAuth0Click()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>{t.launchAuth0}</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
