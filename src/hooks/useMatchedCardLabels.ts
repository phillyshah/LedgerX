import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!enabled || expenseIds.length === 0) {
      setMatchedCardLabels(new Map());
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
    // expenseIds is a derived array; depend on its joined content, not its
    // reference, so this doesn't refetch on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, expenseIds.join(',')]);

  return matchedCardLabels;
}
