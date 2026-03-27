import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Expense, Household } from '../types/expense';

export function useExpenses(refreshKey?: number) {
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

    const hh = (memberData || [])
      .map((item) => item.households)
      .filter(Boolean) as unknown as Household[];
    setHouseholds(hh);

    const householdMap = new Map(hh.map((h) => [h.id, h.name]));
    const householdIds = hh.map((h) => h.id);

    if (householdIds.length === 0) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('id, expense_date, vendor, total, currency, category, notes, transcript, household_id, image_path, image_mime, image_width, image_height')
      .in('household_id', householdIds)
      .order('expense_date', { ascending: false });

    if (!error && data) {
      setExpenses(
        data.map((e) => ({
          ...e,
          household_name: householdMap.get(e.household_id) || 'Unknown',
        }))
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses, refreshKey]);

  return { expenses, households, loading, reloadExpenses: loadExpenses };
}
