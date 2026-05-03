import { useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { RELEASE_NOTES, latestReleaseId, setLastSeenReleaseId } from '../i18n/releaseNotes';

interface WhatsNewModalProps {
  onClose: () => void;
}

/**
 * "What's New" modal — surfaces RELEASE_NOTES newest-first. Opening this
 * modal counts as "reading" the latest release: we write its id to
 * localStorage so the bell goes back to its neutral state. We do this on
 * mount rather than on close so the dot clears immediately on first view,
 * even if the user dismisses by tapping the backdrop without scrolling.
 */
export function WhatsNewModal({ onClose }: WhatsNewModalProps) {
  const { t, language, locale } = useT();
  useEscapeClose(onClose);

  useEffect(() => {
    const latest = latestReleaseId();
    if (latest) setLastSeenReleaseId(latest);
  }, []);

  const fmtDate = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(locale, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-2xl sm:max-h-[90vh] sm:my-4 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">{t('whatsNew.title')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-all"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {RELEASE_NOTES.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">{t('whatsNew.empty')}</p>
          ) : (
            <ol className="space-y-6">
              {RELEASE_NOTES.map((note) => (
                <li key={note.id} className="border-l-2 border-emerald-200 pl-4">
                  <div className="flex items-baseline gap-2 flex-wrap mb-1">
                    <h3 className="text-base font-semibold text-slate-900">
                      {note.title[language] ?? note.title['en']}
                    </h3>
                    <span className="text-xs font-mono text-emerald-700">{note.version}</span>
                    <span className="text-xs text-slate-400">· {fmtDate(note.date)}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">
                    {note.body[language] ?? note.body['en']}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
