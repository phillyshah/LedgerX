import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { useT } from '../hooks/useT';

interface Props {
  onClose: () => void;
}

interface Slide {
  emoji: string;
  gradient: string;
  titleKey: string;
  bodyKey: string;
}

// Visual hero per slide — emoji + gradient card (deliberately not a real
// screenshot, so the tour stays in sync as the UI evolves).
const SLIDES: Slide[] = [
  { emoji: '👋', gradient: 'from-emerald-400 to-teal-500',     titleKey: 'tour.slide1.title', bodyKey: 'tour.slide1.body' },
  { emoji: '📸', gradient: 'from-sky-400 to-blue-500',         titleKey: 'tour.slide2.title', bodyKey: 'tour.slide2.body' },
  { emoji: '📧', gradient: 'from-amber-400 to-orange-500',     titleKey: 'tour.slide3.title', bodyKey: 'tour.slide3.body' },
  { emoji: '🗂️', gradient: 'from-violet-400 to-purple-500',    titleKey: 'tour.slide4.title', bodyKey: 'tour.slide4.body' },
  { emoji: '📊', gradient: 'from-rose-400 to-pink-500',        titleKey: 'tour.slide5.title', bodyKey: 'tour.slide5.body' },
  { emoji: '⚙️', gradient: 'from-slate-500 to-slate-700',      titleKey: 'tour.slide6.title', bodyKey: 'tour.slide6.body' },
  { emoji: '🚀', gradient: 'from-emerald-500 to-green-700',    titleKey: 'tour.slide7.title', bodyKey: 'tour.slide7.body' },
];

export function WalkthroughModal({ onClose }: Props) {
  const { t } = useT();
  const [index, setIndex] = useState(0);

  const slide = SLIDES[index];
  const isFirst = index === 0;
  const isLast = index === SLIDES.length - 1;

  const next = () => (isLast ? onClose() : setIndex(i => i + 1));
  const prev = () => !isFirst && setIndex(i => i - 1);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">

        {/* Header bar — title + close */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="text-sm font-semibold text-slate-700">{t('tour.title')}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-all"
            aria-label={t('common.close')}
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Hero — gradient block with big emoji */}
        <div className={`bg-gradient-to-br ${slide.gradient} h-48 flex items-center justify-center`}>
          <span className="text-7xl drop-shadow-lg" role="img" aria-hidden>{slide.emoji}</span>
        </div>

        {/* Body */}
        <div className="px-6 pt-6 pb-5 space-y-3">
          <h2 className="text-2xl font-bold text-slate-900 leading-tight">
            {t(slide.titleKey)}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            {t(slide.bodyKey)}
          </p>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center justify-center gap-1.5 pb-4">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-6 bg-emerald-600' : 'w-1.5 bg-slate-300 hover:bg-slate-400'
              }`}
              aria-label={t('tour.goToStep', { n: i + 1 })}
            />
          ))}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('tour.prev')}
          </button>
          <span className="text-xs text-slate-400 font-medium">
            {t('tour.stepCounter', { current: index + 1, total: SLIDES.length })}
          </span>
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition-all shadow-sm"
          >
            {isLast ? t('tour.start') : t('tour.next')}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
