import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type TemplateKind = 'expense' | 'invoice';

export interface TransactionTemplate {
  id: string;
  owner_id: string;
  kind: TemplateKind;
  name: string;
  household_id: string | null;
  vendor: string | null;
  amount: number | null;
  currency: string;
  category: string | null;       // expense flow uses category name
  category_id: string | null;    // invoice flow uses category FK
  description: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Owner-scoped templates. Hook caller passes a `kind` so the AddExpense
 * picker doesn't see invoice templates and vice versa. RLS already
 * limits to the current user — `kind` is a server-side filter on top.
 */
export function useTemplates(kind: TemplateKind, refreshKey?: number) {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('transaction_templates')
      .select('*')
      .eq('kind', kind)
      .order('name', { ascending: true });
    if (!error && data) setTemplates(data as TransactionTemplate[]);
    setLoading(false);
  }, [user, kind]);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { templates, loading, reload };
}
