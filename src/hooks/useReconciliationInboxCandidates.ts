import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { InboxCandidate } from '../lib/statementMatching';

/**
 * Pending email-inbox receipts as CC-reconciliation match candidates.
 *
 * Full-admin only (see 20260728000000_labs_inbox_matching.sql for why this
 * doesn't extend to household admins — email_inbox has no household_id and
 * no existing RLS precedent for cross-household visibility). `enabled`
 * should be the caller's `isAdmin` flag; non-admins get an empty list with
 * no request made. Bump `refreshKey` to reload (e.g. after confirming a
 * match, so the matched item drops out of the pool).
 */
export function useReconciliationInboxCandidates(enabled: boolean, refreshKey = 0) {
  const [candidates, setCandidates] = useState<InboxCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase.rpc('list_reconciliation_inbox_candidates').then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('useReconciliationInboxCandidates: failed to load candidates', error);
        setCandidates([]);
        setLoading(false);
        return;
      }
      setCandidates(
        (data ?? []).map((r: Record<string, unknown>) => ({
          id: r.id as string,
          from_email: r.from_email as string,
          subject: (r.subject as string | null) ?? null,
          received_at: r.received_at as string,
          attachment_paths: ((r.attachment_paths as string[] | null) ?? []) as string[],
          vendor: (r.vendor as string | null) ?? null,
          total: Number(r.total),
          expense_date: r.expense_date as string,
          notes: (r.notes as string | null) ?? null,
          submitter_user_id: r.submitter_user_id as string,
          submitter_username: (r.submitter_username as string | null) ?? null,
        }))
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, refreshKey]);

  return { candidates, loading };
}
