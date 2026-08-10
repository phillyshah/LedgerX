import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export interface PhoneNumberRow {
  id: string;
  user_id: string;
  phone: string;
  label: string | null;
  created_at: string;
}

export type NotifyChannel = 'email' | 'whatsapp' | 'both';

/**
 * A row of whatsapp_outbox, as shown in the admin delivery log.
 *
 * `skipped` is the one worth understanding: it means the drain deliberately
 * did not send, almost always because the recipient is outside their 24-hour
 * reply window and there's no approved template to reach them. That is
 * designed behaviour — it is emphatically not the same as `failed`, which
 * means Twilio rejected the message and `last_error` says why.
 */
export type WhatsAppDeliveryStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface WhatsAppDeliveryRow {
  id: string;
  status: WhatsAppDeliveryStatus;
  payload: { kind?: string; title?: string | null } | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

/**
 * The most recent queued/sent WhatsApp notifications for one user.
 *
 * Readable only by full admins — whatsapp_outbox's sole client-facing RLS
 * policy is `USING (is_admin())`, so for anyone else this simply returns an
 * empty list rather than erroring.
 */
export async function fetchWhatsAppDeliveries(userId: string, limit = 10): Promise<WhatsAppDeliveryRow[]> {
  const { data, error } = await supabase
    .from('whatsapp_outbox')
    .select('id, status, payload, last_error, created_at, sent_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as WhatsAppDeliveryRow[];
}

// E.164, mirroring the DB CHECK constraint on user_phone_numbers.phone.
export const PHONE_E164_RE = /^\+[1-9][0-9]{6,14}$/;

/** The current user's linked WhatsApp numbers (read-only — admin-managed). */
export function useMyPhoneNumbers(refreshKey = 0) {
  const { user } = useAuth();
  const [phones, setPhones] = useState<PhoneNumberRow[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_phone_numbers')
        .select('id, user_id, phone, label, created_at')
        .eq('user_id', user.id)
        .order('created_at');
      setPhones((data ?? []) as PhoneNumberRow[]);
    })();
  }, [user, refreshKey]);

  return phones;
}

/** The current user's notification channel preference + saver. */
export function useNotifyChannel() {
  const { user } = useAuth();
  const [channel, setChannel] = useState<NotifyChannel>('email');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('notify_channel')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.notify_channel) setChannel(data.notify_channel as NotifyChannel);
      setLoaded(true);
    })();
  }, [user]);

  const save = useCallback(async (next: NotifyChannel) => {
    const prev = channel;
    setChannel(next);
    const { error } = await supabase.rpc('set_notify_channel' as never, { p_channel: next } as never);
    if (error) setChannel(prev);
    return error;
  }, [channel]);

  return { channel, save, loaded };
}
