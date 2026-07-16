import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Expense } from '../types/expense';

/**
 * Candidate expenses for Credit Card Reconciliation matching.
 *
 * Deliberately NOT `useExpenses()`: that hook scopes to households the
 * signed-in user is personally a member of, which breaks reconciliation's
 * core premise — a statement spans multiple properties/households, so a full
 * admin who uploaded it needs to match line items against expenses in
 * households they may not belong to. The `expenses` SELECT RLS policy already
 * lets `is_admin()` read every household's expenses (20260508000000), so this
 * loads the full authorized pool:
 *   - full admin      → every household's expenses (RLS bypass)
 *   - household admin  → expenses in their Labs-flagged households only
 *                        (matches what can_act_on_expense() will let them
 *                        actually match; a non-flagged household's expense
 *                        would be rejected by the RPC anyway)
 *
 * `labsHouseholdIds` is ignored for full admins and used to scope the
 * household-admin case.
 */
export function useReconciliationCandidates(enabled: boolean, labsHouseholdIds: string[]) {
  const { user, isAdmin } = useAuth();
  const [candidates, setCandidates] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Stable primitive dep so this doesn't refire on every parent render.
  const scopeKey = labsHouseholdIds.join(',');

  useEffect(() => {
    if (!enabled || !user) {
      setCandidates([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      // Household id → name map for the household tag on each candidate row.
      // Admins can read all households (RLS); a household admin reads the
      // subset they belong to — either way this covers the expenses below.
      const { data: hhData } = await supabase.from('households').select('id, name');
      const householdMap = new Map((hhData ?? []).map((h) => [h.id, h.name]));

      let query = supabase
        .from('expenses')
        .select('id, expense_date, vendor, total, currency, category, notes, transcript, household_id, image_path, image_mime, image_width, image_height, created_by, paid_at')
        .order('expense_date', { ascending: false });

      // Non-admins (household admins) are scoped to their Labs-flagged
      // households. Full admins load everything the RLS policy permits.
      if (!isAdmin) {
        if (labsHouseholdIds.length === 0) {
          if (!cancelled) {
            setCandidates([]);
            setLoading(false);
          }
          return;
        }
        query = query.in('household_id', labsHouseholdIds);
      }

      const { data, error } = await query;
      if (cancelled) return;
      if (error || !data) {
        setCandidates([]);
        setLoading(false);
        return;
      }

      const submitterIds = [...new Set(data.map((e) => e.created_by).filter((v): v is string => !!v))];
      let usernameMap = new Map<string, string>();
      if (submitterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username')
          .in('id', submitterIds);
        if (cancelled) return;
        usernameMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));
      }

      setCandidates(
        data.map((e) => ({
          ...e,
          household_name: householdMap.get(e.household_id ?? '') || 'Unknown',
          submitter_username: e.created_by ? usernameMap.get(e.created_by) : undefined,
        }))
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, isAdmin, scopeKey]);

  return { candidates, loading };
}
