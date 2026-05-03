import { useEffect, useRef, useState } from 'react';
import { Settings, HelpCircle, LogOut, User, ChevronDown } from 'lucide-react';
import { useT } from '../hooks/useT';
import { APP_VERSION } from '../version';

interface Props {
  variant: 'light' | 'dark';
  username?: string;
  onShowSettings: () => void;
  onShowHelp: () => void;
  onSignOut: () => void;
}

// Single avatar-style trigger that fans out to Settings, Help, Sign Out and
// shows the version label. Replaces the previous row of three header icons.
export function UserMenu({ variant, username, onShowSettings, onShowHelp, onSignOut }: Props) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const triggerCls = variant === 'dark'
    ? 'flex items-center gap-1.5 px-2 py-1.5 text-emerald-200 hover:text-white hover:bg-emerald-800 rounded-lg transition-all'
    : 'flex items-center gap-1.5 px-2 py-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all';

  const avatarBg = variant === 'dark'
    ? 'bg-emerald-700 text-white'
    : 'bg-emerald-100 text-emerald-700';

  const initial = (username?.[0] ?? '?').toUpperCase();

  const close = () => setOpen(false);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={triggerCls}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('common.accountMenu')}
      >
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${avatarBg}`}>
          {username ? initial : <User className="w-4 h-4" />}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-30"
        >
          {username && (
            <div className="px-3 pb-2 border-b border-slate-100 mb-1">
              <p className="text-xs text-slate-400">{t('common.signedInAs')}</p>
              <p className="text-sm font-semibold text-slate-900 truncate">{username}</p>
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => { close(); onShowSettings(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-all text-left"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            {t('common.settings')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => { close(); onShowHelp(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-all text-left"
          >
            <HelpCircle className="w-4 h-4 text-slate-500" />
            {t('common.help')}
          </button>
          <div className="my-1 h-px bg-slate-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => { close(); onSignOut(); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-all text-left"
          >
            <LogOut className="w-4 h-4 text-slate-500" />
            {t('common.signOut')}
          </button>
          <div className="px-3 pt-2 mt-1 border-t border-slate-100">
            <p className="text-[10px] text-slate-400 font-medium">{APP_VERSION}</p>
          </div>
        </div>
      )}
    </div>
  );
}
