import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Expense, Household } from '../types/expense';

interface UseExpensesOptions {
  /**
   * When true, the underlying Postgres query is scoped to expenses the
   * signed-in user personally created (`created_by = auth.uid()`). This is
   * defense-in-depth for non-admin views: the Dashboard renders charts and
   * a recent-transactions list against this hook's output, so filtering at
   * the wire level prevents other household members' data from ever
   * crossing the network — not just being hidden in the UI.
   *
   * Admins and household admins should leave this off — they need the full
   * household-scoped view to do their job.
   */
  ownOnly?: boolean;
}

export function useExpenses(refreshKey?: number, options: UseExpensesOptions = {}) {
  const { ownOnly = false } = options;
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);

  const loadExpenses = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const { data: memberData } = await supabase
      .from('household_members')
      .select('household_id, households(id, name)')
      .eq('user_id', user.id);

    // households.id is a random uuid with no natural ordering — sort
    // alphabetically so the household filter dropdown lists sensibly.
    const hh = ((memberData || [])
      .map((item) => item.households)
      .filter(Boolean) as unknown as Household[])
      .sort((a, b) => a.name.localeCompare(b.name));
    setHouseholds(hh);

    const householdMap = new Map(hh.map((h) => [h.id, h.name]));
    const householdIds = hh.map((h) => h.id);

    if (householdIds.length === 0) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    let query = supabase
      .from('expenses')
      .select('id, expense_date, vendor, total, currency, category, notes, transcript, household_id, image_path, image_mime, image_width, image_height, created_by, paid_at')
      .in('household_id', householdIds)
      .order('expense_date', { ascending: false });

    if (ownOnly) {
      query = query.eq('created_by', user.id);
    }

    const { data, error } = await query;

    if (!error && data) {
      // Resolve submitter usernames in a single round-trip. We avoid a PostgREST
      // implicit join because expenses.created_by may not carry a PostgREST-
      // visible FK constraint in every environment.
      const submitterIds = [...new Set(
        data.map((e) => e.created_by).filter((v): v is string => !!v)
      )];

      let usernameMap = new Map<string, string>();
      if (submitterIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username')
          .in('id', submitterIds);
        usernameMap = new Map((profiles || []).map((p) => [p.id, p.username]));
      }

      setExpenses(
        data.map((e) => ({
          ...e,
          household_name: householdMap.get(e.household_id ?? '') || 'Unknown',
          submitter_username: e.created_by ? usernameMap.get(e.created_by) : undefined,
        }))
      );
    }
    setLoading(false);
  }, [user?.id, ownOnly]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses, refreshKey]);

  return { expenses, households, loading, reloadExpenses: loadExpenses };
}
