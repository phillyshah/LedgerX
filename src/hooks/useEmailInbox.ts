import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface InboxItem {
  id: string;
  user_id: string;
  from_email: string;
  subject: string | null;
  received_at: string;
  attachment_paths: string[];
  kind: 'expense' | 'invoice';
  prefilled: {
    vendor_name?: string | null;
    total_amount?: number | null;
    transaction_date?: string | null;
    handwritten_notes?: string | null;
    invoice_number?: string | null;
    invoice_date?: string | null;
    due_date?: string | null;
    description?: string | null;
  };
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
    if (error) {
      console.error('[email_inbox] load failed:', error);
    }
    setItems((data ?? []) as InboxItem[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load, refreshKey]);

  // Refresh when the tab regains focus or visibility — covers the case
  // where the user forwards an email from another app and switches back
  // to LedgerX expecting to see it. Without this, items only appear on
  // a hard reload. The two events frequently fire together on browser
  // tab switches, so we throttle to one fetch per ~2s window.
  useEffect(() => {
    if (!user) return;
    let lastRun = 0;
    const maybeReload = () => {
      const now = Date.now();
      if (now - lastRun < 2000) return;
      lastRun = now;
      load();
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') maybeReload(); };
    window.addEventListener('focus', maybeReload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', maybeReload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [user, load]);

  const discard = async (id: string) => {
    await supabase.from('email_inbox').update({ status: 'discarded' }).eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const accept = async (id: string) => {
    await supabase.from('email_inbox').update({ status: 'accepted' }).eq('id', id);
    setItems(prev => prev.filter(i => i.id !== id));
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

  useEffect(() => { load(); }, [load, refreshKey]);

  const add = async (email: string, label?: string) => {
    if (!user) return;
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
    setEmails(prev => prev.filter(e => e.id !== id));
  };

  return { emails, loading, reload: load, add, remove };
}
