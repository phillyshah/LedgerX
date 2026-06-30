import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Estimate } from '../types/estimate';

interface Household {
  id: string;
  name: string;
}

interface UnreadRow {
  estimate_id: string;
  unread_count: number;
}

/**
 * Contractor-facing estimates hook. Relies on RLS to scope rows to the
 * caller's own estimates, resolves household_name client-side, and folds in
 * unread message counts from the list_estimate_unread RPC for the badges.
 */
export function useEstimates(refreshKey?: number) {
  const { user } = useAuth();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEstimates = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [memberRes, estRes, unreadRes] = await Promise.all([
      supabase.from('household_members').select('household_id, households(id, name)').eq('user_id', user.id),
      supabase
        .from('estimates')
        .select('id, created_by, household_id, title, description, status, admin_notes, file_path, file_mime, created_at, updated_at')
        .order('created_at', { ascending: false }),
      supabase.rpc('list_estimate_unread' as never),
    ]);

    const hh = (memberRes.data || [])
      .map((item) => item.households)
      .filter(Boolean) as unknown as Household[];
    setHouseholds(hh);
    const hhMap = new Map(hh.map((h) => [h.id, h]));

    const unreadMap = new Map(
      (((unreadRes.data as unknown as UnreadRow[]) || [])).map((r) => [r.estimate_id, Number(r.unread_count)])
    );

    if (!estRes.error && estRes.data) {
      setEstimates(
        (estRes.data as unknown as Estimate[]).map((est) => ({
          ...est,
          household_name: (est.household_id && hhMap.get(est.household_id)?.name) || '—',
          unread_count: unreadMap.get(est.id) ?? 0,
        }))
      );
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadEstimates();
  }, [loadEstimates, refreshKey]);

  return { estimates, households, loading, reloadEstimates: loadEstimates };
}
