import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useT } from '../hooks/useT';
import { hasUnreadReleases, LAST_SEEN_KEY } from '../i18n/releaseNotes';

interface BellButtonProps {
  onClick: () => void;
  /** Compact size for the contractor mobile header. Default is desktop. */
  compact?: boolean;
  /** Use the dark emerald header palette (admin mobile bar). */
  dark?: boolean;
}

/**
 * Bell icon for the app header. Shows a red dot and turns amber when
 * there's an unread release note. Tapping it is the parent component's
 * job (which opens WhatsNewModal — the modal itself clears the unread
 * state via localStorage).
 *
 * The component listens to the localStorage `storage` event so multi-tab
 * users see the dot disappear as soon as the modal closes in any tab.
 * It also re-checks on focus (catches the same-tab case where storage
 * doesn't fire).
 */
export function BellButton({ onClick, compact = false, dark = false }: BellButtonProps) {
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

  const sizeClass = compact ? 'w-5 h-5' : 'w-4 h-4';
  const padClass = 'p-2';
  const colorClass = dark
    ? unread
      ? 'text-amber-300 hover:text-amber-200 hover:bg-emerald-800'
      : 'text-emerald-200 hover:text-white hover:bg-emerald-800'
    : unread
      ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50';
  // Dot ring color picks up the surrounding header background so it blends.
  const dotRing = dark ? 'ring-emerald-900' : 'ring-white';

  return (
    <button
      onClick={onClick}
      className={`relative flex items-center gap-2 ${padClass} ${colorClass} rounded-xl transition-all`}
      aria-label={t('whatsNew.bellLabel')}
      title={t('whatsNew.bellLabel')}
    >
      <Bell className={sizeClass} />
      {unread && (
        <span
          className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ${dotRing}`}
          aria-hidden="true"
        />
      )}
    </button>
  );
}
