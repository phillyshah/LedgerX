import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Expense } from '../types/expense';

/**
 * Candidate expenses for Credit Card Reconciliation matching.
 *
 * A statement spans multiple properties, so the candidate pool must span
 * every participating household — NOT just the ones the reconciling admin
 * belongs to. This calls the SECURITY DEFINER RPC
 * list_reconciliation_candidates() (20260724000000), which returns:
 *   - full admin      → every household's expenses
 *   - household admin  → every Labs-flagged household's expenses, regardless
 *                        of their own membership
 * gated on Labs-eligibility. We can't do this with a plain client
 * `expenses` select because RLS scopes a household admin to their own
 * households — the RPC is what lets a household admin see (and, via the
 * matching RPCs' loosened can_act_on_expense, match) receipts in other
 * flagged properties.
 *
 * Household name + submitter username come back from the RPC directly (it
 * resolves them server-side, so cross-household tags stay accurate even for
 * properties the caller couldn't read directly).
 *
 * `statementId`, when the statement has one or more rows in
 * statement_households (assigned at upload time), narrows the pool to just
 * those households' expenses — plus any expense with no category yet at all
 * regardless of household, since that's likely misfiled data that could
 * belong here. A statement with no assigned households (or `statementId`
 * null/undefined) keeps the full broad pool, unchanged.
 */
export function useReconciliationCandidates(enabled: boolean, statementId?: string | null, refreshKey = 0) {
  const [candidates, setCandidates] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase.rpc('list_reconciliation_candidates', { p_statement_id: statementId ?? null }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('useReconciliationCandidates: failed to load candidates', error);
        setCandidates([]);
        setLoading(false);
        return;
      }
      setCandidates(
        (data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          expense_date: r.expense_date as string,
          vendor: (r.vendor as string | null) ?? null,
          total: Number(r.total),
          currency: (r.currency as string) ?? 'USD',
          category: (r.category as string | null) ?? null,
          notes: (r.notes as string | null) ?? null,
          transcript: (r.transcript as string | null) ?? null,
          household_id: (r.household_id as string | null) ?? null,
          household_name: (r.household_name as string | null) ?? 'Unknown',
          image_path: (r.image_path as string | null) ?? null,
          image_mime: (r.image_mime as string | null) ?? null,
          image_width: (r.image_width as number | null) ?? null,
          image_height: (r.image_height as number | null) ?? null,
          created_by: (r.created_by as string | null) ?? null,
          submitter_username: (r.submitter_username as string | undefined) ?? undefined,
          paid_at: (r.paid_at as string | null) ?? null,
        }))
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, statementId, refreshKey]);

  return { candidates, loading };
}
