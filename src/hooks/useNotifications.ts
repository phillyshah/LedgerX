import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { AppNotification } from '../types/notification';

/**
 * In-app notifications feed backing the header bell. Pulls the caller's rows
 * via the `list_notifications` RPC and refreshes on window focus /
 * visibility change (the app has no realtime substrate — this mirrors the
 * `useEmailInbox` refresh pattern). `markRead` updates optimistically, then
 * persists via `mark_notifications_read`.
 */
export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const lastFetch = useRef(0);

  const reload = useCallback(async () => {
    if (!user) return;
    lastFetch.current = Date.now();
    const { data } = await supabase.rpc('list_notifications' as never, { p_limit: 30 } as never);
    setNotifications((data as unknown as AppNotification[]) || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  // Refresh when the tab regains focus / becomes visible, throttled to one
  // fetch per ~2s so rapid focus toggles don't hammer the RPC.
  useEffect(() => {
    const maybeRefresh = () => {
      if (Date.now() - lastFetch.current < 2000) return;
      reload();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') maybeRefresh();
    };
    window.addEventListener('focus', maybeRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', maybeRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reload]);

  const unreadCount = notifications.reduce((n, item) => n + (item.read_at ? 0 : 1), 0);

  const markRead = useCallback(
    async (ids?: string[]) => {
      if (!user) return;
      const stamp = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) =>
          (!ids || ids.includes(n.id)) && !n.read_at ? { ...n, read_at: stamp } : n,
        ),
      );
      await supabase.rpc('mark_notifications_read' as never, { p_ids: ids ?? null } as never);
    },
    [user],
  );

  return { notifications, unreadCount, loading, reload, markRead };
}
