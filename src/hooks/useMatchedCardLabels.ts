import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Which of the given expense ids are matched to a credit-card statement
 * line item, and which card. Kept as its own hook (not folded into
 * useExpenses) so this Labs-only lookup never runs its query, and never
 * ships its fetch logic into the render path, for callers/households
 * without the labs_cc_reconciliation flag on.
 *
 * Scoped via .in() to the caller's own expense ids — statements aren't
 * household-scoped, so an unfiltered query would pull every matched line
 * item system-wide.
 */
export function useMatchedCardLabels(expenseIds: string[], enabled: boolean) {
  const [matchedCardLabels, setMatchedCardLabels] = useState<Map<string, string>>(new Map());

  // Joining is what makes the effect depend on the ids' *content* rather than
  // the array's identity, but doing it inline in the dep array re-walks every
  // id on every render of the calling component (including each keystroke in
  // its search box). Callers already memoize the array, so keying off that
  // reference means the join runs only when the ids actually change.
  const idsKey = useMemo(() => expenseIds.join(','), [expenseIds]);

  useEffect(() => {
    if (!enabled || expenseIds.length === 0) {
      // Reuse the existing empty Map rather than allocating a fresh one —
      // callers use this Map as a memo dependency, so a new identity here
      // would invalidate their filtering work for no actual change.
      setMatchedCardLabels((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    let cancelled = false;

    supabase
      .from('statement_line_items')
      .select('matched_expense_id, credit_card_statements(card_label)')
      .in('matched_expense_id', expenseIds)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error('useMatchedCardLabels: failed to load matched line items', error);
          return;
        }
        setMatchedCardLabels(
          new Map(
            (data ?? []).map((r) => [
              r.matched_expense_id as string,
              (r.credit_card_statements as unknown as { card_label: string } | null)?.card_label ?? '',
            ])
          )
        );
      });

    return () => {
      cancelled = true;
    };
    // Keyed on the ids' joined content (see idsKey above), not the array
    // reference, so this doesn't refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idsKey]);

  return matchedCardLabels;
}
