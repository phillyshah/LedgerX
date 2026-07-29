/**
 * DeleteButton
 *
 * The single destructive-action control for the whole app. Before this
 * existed the codebase had drifted into three different conventions: an
 * inline two-tap confirm copy-pasted into three files, seven native
 * `window.confirm()` popups, and a handful of controls that deleted a
 * database row on a single unconfirmed tap.
 *
 * Behaviour is the two-tap confirm that ExpenseList introduced: the first
 * tap *arms* the button for ~3s and swaps it to a solid red "Tap again"
 * state; a second tap within the window commits. Letting it lapse disarms
 * and nothing happens. This is deliberately not a modal — it keeps the
 * user's thumb where it already is, which matters most on mobile.
 *
 * Variants:
 *   icon       — dense list rows (an expense row, a statement row)
 *   pill       — detail views, where there's room for a word
 *   prominent  — the biggest target we render (40px). For cards where the
 *                delete is a primary, always-visible action rather than a
 *                hover-revealed afterthought.
 *
 * Only use this for actions that actually destroy something persisted.
 * Closing a modal, cancelling an inline edit, clearing a filter and
 * removing a not-yet-uploaded image from a staging list are all still a
 * plain `X` — they aren't deletes and a confirm step there is just noise.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useT } from '../../hooks/useT';

export type DeleteButtonVariant = 'icon' | 'pill' | 'prominent';

interface Props {
  /** Runs only on the *second* tap. May be async; the button shows a
   *  pending label until it settles. */
  onDelete: () => void | Promise<void>;
  variant?: DeleteButtonVariant;
  /** Overrides the idle label on `pill` / `prominent`. Ignored by `icon`. */
  label?: string;
  disabled?: boolean;
  /** How long the armed state lasts before it disarms itself. */
  confirmMs?: number;
  /** Only meaningful for `icon`: fade the button in on row hover (desktop),
   *  stay visible on touch screens where there is no hover. */
  revealOnHover?: boolean;
  /** Bump this to force-disarm from the outside — e.g. the parent row just
   *  entered edit mode and a stale armed delete would be a trap. */
  disarmSignal?: number;
  className?: string;
}

export function DeleteButton({
  onDelete,
  variant = 'icon',
  label,
  disabled = false,
  confirmMs = 3000,
  revealOnHover = false,
  disarmSignal = 0,
  className = '',
}: Props) {
  const { t } = useT();
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // The three hand-rolled copies of this pattern all leaked their timer on
  // unmount, which fires setState on a dead component.
  useEffect(() => clearTimer, [clearTimer]);

  // Skip the initial 0 so mounting doesn't count as a disarm request.
  useEffect(() => {
    if (disarmSignal > 0) {
      clearTimer();
      setArmed(false);
    }
  }, [disarmSignal, clearTimer]);

  const handleClick = async () => {
    if (busy) return;
    if (!armed) {
      setArmed(true);
      clearTimer();
      timerRef.current = setTimeout(() => setArmed(false), confirmMs);
      return;
    }
    clearTimer();
    setArmed(false);
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  const idleLabel = label ?? t('common.delete');
  const text = busy
    ? t('common.deleting')
    : armed
      ? variant === 'icon'
        ? t('common.tapAgainShort')
        : t('common.tapAgainToConfirm')
      : idleLabel;

  // `title` carries the meaning for icon-only rendering, where there's no
  // visible text in the idle state.
  const title = busy ? t('common.deleting') : armed ? t('common.tapAgainToConfirm') : idleLabel;

  const base = 'transition-all disabled:opacity-50';

  let cls: string;
  if (variant === 'icon') {
    cls = armed
      ? `${base} inline-flex items-center gap-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg text-xs font-semibold text-white shadow-sm`
      : `${base} p-1.5 hover:bg-red-50 rounded-lg${
          revealOnHover ? ' opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100' : ''
        }`;
  } else if (variant === 'pill') {
    cls = armed
      ? `${base} inline-flex items-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-xl shadow-sm`
      : `${base} inline-flex items-center gap-2 px-4 py-2.5 border border-red-200 hover:bg-red-50 text-red-600 text-sm font-medium rounded-xl`;
  } else {
    // prominent — 40px tap target, the largest icon button in the app.
    cls = armed
      ? `${base} inline-flex items-center gap-2 px-3 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold rounded-xl shadow-sm`
      : `${base} inline-flex items-center gap-2 px-3 py-2.5 text-red-600 border border-red-200 hover:bg-red-50 rounded-xl text-xs font-semibold`;
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      className={`${cls} ${className}`.trim()}
      title={title}
      aria-label={title}
    >
      <Trash2
        className={
          variant === 'prominent'
            ? 'w-5 h-5'
            : variant === 'icon'
              ? armed
                ? 'w-3.5 h-3.5'
                : 'w-4 h-4 text-red-500'
              : 'w-4 h-4'
        }
      />
      {/* icon: text only once armed. pill/prominent: always. */}
      {variant === 'icon'
        ? (armed || busy) && <span>{text}</span>
        : <span>{text}</span>}
      {/* Announce the armed prompt to screen readers without moving focus. */}
      <span className="sr-only" aria-live="polite">
        {armed ? t('common.tapAgainToConfirm') : ''}
      </span>
    </button>
  );
}
