/**
 * useEmailInbox / useSenderEmails
 *
 * Two React hooks for talking to the email_inbox + user_sender_emails tables.
 *
 *   useEmailInbox()    — pending cards for the current user, with discard()
 *                        and accept() actions. Auto-refreshes on window focus
 *                        and tab visibility so cards appear when the user
 *                        switches back from their email client.
 *
 *   useSenderEmails()  — CRUD for the addresses the user is allowed to
 *                        forward from. Wire this into your settings UI.
 *
 * Requires:
 *   - A `supabase` browser client (anon key)
 *   - A way to get the current user id (the starter uses `useAuth()`; swap
 *     for whatever your project exposes).
 */

import { useState, useEffect, useCallback } from 'react';

// ─── CONFIGURE: imports to fit your app ──────────────────────────────────────
import { supabase } from '../lib/supabase';      // your browser supabase client
import { useAuth } from '../contexts/AuthContext'; // hook returning { user: { id } } | null

// ─── Types ───────────────────────────────────────────────────────────────────
export interface InboxItem {
  id: string;
  user_id: string;
  from_email: string;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  attachment_paths: string[];
  message_id: string | null;
  status: 'pending' | 'accepted' | 'discarded';
  received_at: string;
  created_at: string;
}

export interface SenderEmail {
  id: string;
  email: string;
  label: string | null;
  created_at: string;
}

// ─── useEmailInbox ───────────────────────────────────────────────────────────
export function useEmailInbox(refreshKey?: number) {
  const { user } = useAuth();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('email_inbox')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('received_at', { ascending: false });
    if (error) console.error('[email_inbox] load failed:', error);
    setItems((data ?? []) as InboxItem[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // Refresh on focus + visibilitychange so new mail appears without a hard
  // reload. Throttled to one fetch per ~2 s window.
  useEffect(() => {
    if (!user) return;
    let lastRun = 0;
    const maybe = () => {
      const now = Date.now();
      if (now - lastRun < 2000) return;
      lastRun = now;
      void load();
    };
    const onVis = () => { if (document.visibilityState === 'visible') maybe(); };
    window.addEventListener('focus', maybe);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', maybe);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [user, load]);

  const discard = async (id: string) => {
    await supabase.from('email_inbox').update({ status: 'discarded' }).eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const accept = async (id: string) => {
    await supabase.from('email_inbox').update({ status: 'accepted' }).eq('id', id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return { items, loading, reload: load, discard, accept };
}

// ─── useSenderEmails ─────────────────────────────────────────────────────────
export function useSenderEmails(refreshKey?: number) {
  const { user } = useAuth();
  const [emails, setEmails] = useState<SenderEmail[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('user_sender_emails')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setEmails((data ?? []) as SenderEmail[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  // Returns null on success, or an Error-shaped object for the caller to surface.
  const add = async (email: string, label?: string) => {
    if (!user) return { message: 'Not signed in' };
    const { error } = await supabase.from('user_sender_emails').insert({
      user_id: user.id,
      email: email.trim().toLowerCase(),
      label: label?.trim() || null,
    });
    if (!error) await load();
    return error;
  };

  const remove = async (id: string) => {
    await supabase.from('user_sender_emails').delete().eq('id', id);
    setEmails((prev) => prev.filter((e) => e.id !== id));
  };

  return { emails, loading, reload: load, add, remove };
}
