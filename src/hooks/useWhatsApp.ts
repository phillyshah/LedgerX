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
