/**
 * useEmailInbox / useSenderEmails
 *
 * Two React hooks that talk to the email_inbox + user_sender_emails tables.
 *
 *   useEmailInbox()    — pending cards for the current user, with discard()
 *                        and accept() actions. Auto-refreshes on focus +
 *                        visibilitychange so cards appear when the user tabs
 *                        back after forwarding an email.
 *
 *   useSenderEmails()  — CRUD for the addresses the user is allowed to
 *                        forward from. Wire into your settings UI.
 *
 * Requires:
 *   - A `supabase` browser client (anon key)
 *   - A way to get the current user's id (the example below uses `useAuth()`;
 *     swap for whatever your app exposes)
 *   - The schema from migrations/0001_schema.sql applied
 */

import { useState, useEffect, useCallback } from 'react';

// ─── CONFIGURE: imports to fit your app ──────────────────────────────────────
// Swap these two imports for whatever your project uses.
import { supabase } from '../lib/supabase';      // your browser supabase client
import { useAuth } from '../contexts/AuthContext'; // hook returning { user: { id } } | nullish

// ─── CONFIGURE: prefilled JSONB shape ────────────────────────────────────────
// Mirror whatever fields your edge-function OCR prompt produces.
export interface InboxPrefilled {
  vendor_name?: string | null;
  total_amount?: number | null;
  transaction_date?: string | null;
  notes?: string | null;
  // Add fields for any extra prompts (invoice_number, due_date, etc.)
  [key: string]: unknown;
}

export interface InboxItem {
  id: string;
  user_id: string;
  from_email: string;
  subject: string | null;
  received_at: string;
  attachment_paths: string[];
  kind: string;
  prefilled: InboxPrefilled;
  status: 'pending' | 'accepted' | 'discarded';
  created_at: string;
}

export interface SenderEmail {
  id: string;
  email: string;
  label: string | null;
  created_at: string;
}

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

  // Re-fetch when the tab regains focus or visibility. Without this, cards
  // only appear on a hard reload, which is jarring when the user just came
  // back from Gmail. Throttled so focus+visibility together don't double-fire.
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
