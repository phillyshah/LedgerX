import { FlaskConical } from 'lucide-react';
import { useT } from '../../hooks/useT';

interface LabsBadgeProps {
  /** 'pill' for nav/list contexts, 'banner' for a full-width screen header notice. */
  variant?: 'pill' | 'banner';
  className?: string;
}

/**
 * Shared visual identity for every screen in the Labs area — violet accent,
 * unused elsewhere in this emerald-dominant app, so Labs reads as visually
 * distinct at a glance.
 */
export function LabsBadge({ variant = 'pill', className = '' }: LabsBadgeProps) {
  const { t } = useT();

  if (variant === 'banner') {
    return (
      <div className={`flex items-center gap-2 px-4 py-2.5 bg-violet-50 border border-violet-200 rounded-xl text-violet-800 ${className}`}>
        <FlaskConical className="w-4 h-4 shrink-0" />
        <p className="text-xs font-medium">{t('labs.experimentalNotice')}</p>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full ${className}`}>
      <FlaskConical className="w-3 h-3" />
      {t('labs.badge')}
    </span>
  );
}
