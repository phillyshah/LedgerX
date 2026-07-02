import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '../hooks/useT';
import { APP_VERSION } from '../version';
import { hasUnreadReleases, LAST_SEEN_KEY } from '../i18n/releaseNotes';

interface AppFooterProps {
  /** Opens the What's New modal. */
  onWhatsNew: () => void;
  /** Use the dark emerald palette (admin shell). Default is the light app shell. */
  dark?: boolean;
}

/**
 * Slim page footer: app version + a "What's New" link. This is the new home
 * for release notes (previously reached via the header bell) — moving it here
 * frees the bell for real notifications. A small red dot flags an unread
 * release; opening the modal clears it (WhatsNewModal writes the last-seen id
 * to localStorage). We re-check on `storage` (multi-tab) and `focus` (same-tab)
 * so the dot disappears promptly, mirroring the old BellButton behavior.
 */
export function AppFooter({ onWhatsNew, dark = false }: AppFooterProps) {
  const { t } = useT();
  const [unread, setUnread] = useState<boolean>(() => hasUnreadReleases());

  useEffect(() => {
    const refresh = () => setUnread(hasUnreadReleases());
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_SEEN_KEY) refresh();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const mutedColor = dark ? 'text-emerald-300/60' : 'text-slate-400';
  const linkColor = dark
    ? 'text-emerald-200 hover:text-white'
    : 'text-slate-500 hover:text-emerald-900';

  return (
    <footer className="mt-8 pb-6 flex items-center justify-center gap-2.5 text-xs">
      <span className={mutedColor}>{APP_VERSION}</span>
      <span className={mutedColor} aria-hidden="true">·</span>
      <button
        type="button"
        onClick={onWhatsNew}
        className={`relative inline-flex items-center gap-1.5 font-medium ${linkColor} transition-colors`}
      >
        <Sparkles className="w-3.5 h-3.5" />
        {t('whatsNew.title')}
        {unread && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" aria-hidden="true" />
        )}
      </button>
    </footer>
  );
}
