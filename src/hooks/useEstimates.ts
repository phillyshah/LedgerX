import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { Estimate } from '../types/estimate';

interface UnreadRow {
  estimate_id: string;
  unread_count: number;
}

/**
 * Loads estimates the caller can see via the list_visible_estimates RPC,
 * which returns own, admin-scoped, and network-visible estimates with
 * submitter_username and household_name pre-resolved. Folds in unread
 * message counts from list_estimate_unread for the chat badges.
 */
export function useEstimates(refreshKey?: number) {
  const { user } = useAuth();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);

  const loadEstimates = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [estRes, unreadRes] = await Promise.all([
      supabase.rpc('list_visible_estimates' as never),
      supabase.rpc('list_estimate_unread' as never),
    ]);

    const unreadMap = new Map(
      (((unreadRes.data as unknown as UnreadRow[]) || [])).map((r) => [r.estimate_id, Number(r.unread_count)])
    );

    if (!estRes.error && estRes.data) {
      setEstimates(
        (estRes.data as unknown as Estimate[]).map((est) => ({
          ...est,
          household_name: est.household_name || '—',
          unread_count: unreadMap.get(est.id) ?? 0,
        }))
      );
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadEstimates();
  }, [loadEstimates, refreshKey]);

  return { estimates, loading, reloadEstimates: loadEstimates };
}
