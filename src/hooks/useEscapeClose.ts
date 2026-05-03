import { useEffect } from 'react';

/**
 * Closes a modal/popover when the user presses Escape. Pass a boolean `active`
 * (defaults to true) so callers can mount the hook once and toggle without
 * rewiring a listener every render.
 */
export function useEscapeClose(onClose: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active, onClose]);
}
