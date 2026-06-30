/**
 * LoginWhatsNewModal
 *
 * A pre-auth "What's New" panel shown on the login screen.
 * Deliberately separate from WhatsNewModal (the in-app bell modal) so
 * the copy and visual treatment can differ — this one is marketing-friendly
 * and always shows exactly the 2 most recent releases.
 *
 * No auth dependency — safe to render before any user is signed in.
 */

import { useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { RELEASE_NOTES, type ReleaseNote } from '../i18n/releaseNotes';
import type { Language } from '../i18n';

// Map a release id (or version) to a big emoji that non-technical users
// will immediately associate with the feature.
const VERSION_EMOJI: Record<string, string> = {
  'v10.8': '📩',
  'v10.7': '👥',
  'v10.6': '🧾',
  'v10.5': '📐',
  'v10.4': '✏️',
  'v10.3': '🔎',
  'v10.2': '📜',
  'v10.1': '🛠️',
  'v10.0': '↕️',
  'v9.9': '📥',
  'v9.8': '📬',
  'v9.7': '📅',
  'v9.6': '✉️',
  'v9.5': '📧',
  'v9.4': '🔧',
  'v9.3': '✅',
  'v9.2': '🗂️',
  'v9.1': '📅',
  'v9.0': '🛡️',
  'v8.9': '👥',
  'v8.8': '📨',
  'v8.7': '📋',
  'v8.6': '🔒',
  'v8.5': '🔑',
  'v8.4': '📚',
  'v8.3': '✨',
  'v8.2': '🌱',
  'v8.1': '🧭',
  'v8.0': '⚙️',
  'v7.9': '🏠',
  'v7.8': '📚',
  'v7.7': '🧹',
  'v7.6': '🛠️',
  'v7.5': '🗂️',
  'v7.4': '🎯',
  'v7.3': '🔧',
  'v7.1': '📧',
  'v6.9': '✨',
  'v6.8': '📋',
  'v6.7': '🔍',
  'v6.6': '🏪',
  'v6.5': '🔔',
  'v6.4': '📷',
  'v6.3': '🔒',
};

const ACCENT_COLORS: string[] = [
  'from-emerald-400 to-teal-500',
  'from-amber-400 to-orange-500',
  'from-sky-400 to-blue-500',
  'from-violet-400 to-purple-500',
];

interface Props {
  onClose: () => void;
  language: Language;
}

interface Strings {
  headline: string;
  sub: string;
  close: string;
  tag: string; // "Version X • Date" label prefix
}

const STRINGS: Record<Language, Strings> = {
  en: {
    headline: "LedgerX just got better ✨",
    sub: "Here's what we shipped recently — tap anything to explore it after you sign in.",
    close: "Got it!",
    tag: "Released",
  },
  'pt-BR': {
    headline: "LedgerX ficou ainda melhor ✨",
    sub: "Confira o que lançamos recentemente — explore tudo depois de entrar.",
    close: "Entendi!",
    tag: "Lançado em",
  },
};

function formatDate(iso: string, lang: Language): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    lang === 'pt-BR' ? 'pt-BR' : 'en-US',
    { month: 'long', day: 'numeric', year: 'numeric' },
  );
}

function FeatureCard({
  note,
  index,
  language,
  tagLabel,
}: {
  note: ReleaseNote;
  index: number;
  language: Language;
  tagLabel: string;
}) {
  const emoji = VERSION_EMOJI[note.id] ?? '🚀';
  const accent = ACCENT_COLORS[index % ACCENT_COLORS.length];

  return (
    <div className="relative rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
      {/* Top accent bar */}
      <div className={`h-1 w-full bg-gradient-to-r ${accent}`} />

      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Emoji badge */}
          <div
            className={`flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br ${accent} flex items-center justify-center text-2xl shadow-md`}
          >
            {emoji}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800 text-base leading-snug mb-1">
              {note.title[language]}
            </h3>
            <span className="inline-block text-xs font-medium text-slate-400 mb-2">
              {tagLabel} {note.version} · {formatDate(note.date, language)}
            </span>
            <p className="text-sm text-slate-600 leading-relaxed">
              {note.body[language]}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LoginWhatsNewModal({ onClose, language }: Props) {
  const strings = STRINGS[language] ?? STRINGS.en;
  // Always show only the 2 most recent releases
  const recent: ReleaseNote[] = RELEASE_NOTES.slice(0, 2);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: 'blur(6px)', background: 'rgba(6,28,20,0.70)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-slate-50 rounded-3xl shadow-2xl overflow-hidden animate-in">

        {/* Header */}
        <div className="relative bg-gradient-to-br from-emerald-700 to-green-900 px-6 pt-8 pb-6">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-full text-green-300 hover:text-white hover:bg-white/10 transition-all"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-400/20 border border-amber-300/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <span className="text-xs font-semibold tracking-widest text-amber-300 uppercase">
              What&rsquo;s New
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white leading-tight mb-2">
            {strings.headline}
          </h2>
          <p className="text-sm text-green-200 leading-relaxed">
            {strings.sub}
          </p>
        </div>

        {/* Feature cards */}
        <div className="px-5 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {recent.map((note, i) => (
            <FeatureCard
              key={note.id}
              note={note}
              index={i}
              language={language}
              tagLabel={strings.tag}
            />
          ))}
        </div>

        {/* Footer CTA */}
        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold text-base shadow-md transition-all active:scale-[0.98]"
          >
            {strings.close}
          </button>
        </div>
      </div>
    </div>
  );
}
