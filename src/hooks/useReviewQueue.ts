import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Live count of things waiting on the current user: forwarded receipts still
 * sitting unreviewed in their email inbox, and transactions saved without a
 * (valid) category.
 *
 * Why this isn't part of `useNotifications`: the `notifications` table is a
 * durable, trigger-written, row-per-event log with mark-read/delete semantics.
 * "You have 4 things waiting" is a live count, not an event — as rows it would
 * need dedup, invalidation on review, and would break mark-read. The bell
 * composes this alongside the real feed instead.
 *
 * Counting happens in SQL (review_queue_summary) rather than by fetching rows
 * and reading `.length`, which is how the bell's unread count works today —
 * and why that count silently saturates at 30 (list_notifications caps at
 * p_limit=30). A count query has no such ceiling.
 *
 * Scoping is entirely server-side. The RPC resolves role from auth.uid():
 * inbox is always strictly the caller's own; expenses are system-wide for a
 * full admin, their households for a household admin, and their own
 * submissions for everyone else.
 */
export interface ReviewQueueSummary {
  pendingInbox: number;
  uncategorized: number;
  oldestPendingAt: string | null;
}

const EMPTY: ReviewQueueSummary = {
  pendingInbox: 0,
  uncategorized: 0,
  oldestPendingAt: null,
};

interface SummaryRow {
  pending_inbox: number;
  uncategorized_expenses: number;
  oldest_pending_at: string | null;
}

export function useReviewQueue(refreshKey = 0) {
  const { user } = useAuth();
  const [summary, setSummary] = useState<ReviewQueueSummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const lastFetch = useRef(0);

  const reload = useCallback(async () => {
    if (!user) {
      setSummary(EMPTY);
      setLoading(false);
      return;
    }
    lastFetch.current = Date.now();
    const { data, error } = await supabase.rpc('review_queue_summary' as never);
    if (error) {
      // Non-fatal: the bell simply shows no queue banner. Logging rather than
      // surfacing keeps a transient RPC hiccup from breaking the header.
      console.error('[review_queue] load failed:', error);
      setSummary(EMPTY);
    } else {
      // The RPC returns a single row; PostgREST hands back an array.
      const row = (Array.isArray(data) ? data[0] : data) as SummaryRow | undefined;
      setSummary(
        row
          ? {
              pendingInbox: Number(row.pending_inbox ?? 0),
              uncategorized: Number(row.uncategorized_expenses ?? 0),
              oldestPendingAt: row.oldest_pending_at ?? null,
            }
          : EMPTY,
      );
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { void reload(); }, [reload, refreshKey]);

  // The app has no realtime substrate, so refresh on focus/visibility — the
  // same pattern as useNotifications and useEmailInbox. Covers the common case
  // of forwarding a receipt from another app and switching back. Throttled
  // because the two events frequently fire together.
  useEffect(() => {
    if (!user) return;
    const maybeRefresh = () => {
      if (Date.now() - lastFetch.current < 2000) return;
      void reload();
    };
    const onVisibility = () => { if (!document.hidden) maybeRefresh(); };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, reload]);

  const total = summary.pendingInbox + summary.uncategorized;

  return { summary, total, loading, reload };
}
