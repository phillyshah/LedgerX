import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { ContractorInvoice } from '../types/invoice';

interface Household {
  id: string;
  name: string;
}

export function useInvoices(refreshKey?: number) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<ContractorInvoice[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInvoices = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Load households the contractor is a member of, their own invoices, and
    // the categories table so we can resolve category_name → display label.
    const [memberRes, invRes, catRes] = await Promise.all([
      supabase.from('household_members').select('household_id, households(id, name)').eq('user_id', user.id),
      supabase
        .from('contractor_invoices')
        .select('id, invoice_number, created_by, household_id, category_id, amount, currency, description, service_date_start, service_date_end, status, admin_notes, image_path, image_mime, image_width, image_height, created_at, updated_at, paid_at')
        .order('created_at', { ascending: false }),
      supabase.from('categories').select('id, name'),
    ]);

    const hh = (memberRes.data || [])
      .map((item) => item.households)
      .filter(Boolean) as unknown as Household[];
    setHouseholds(hh);
    const hhMap = new Map(hh.map((h) => [h.id, h]));
    const catNameMap = new Map(
      ((catRes.data || []) as Array<{ id: string; name: string }>).map((c) => [c.id, c.name])
    );

    if (!invRes.error && invRes.data) {
      setInvoices(
        invRes.data.map((inv) => ({
          ...inv,
          household_name: (inv.household_id && hhMap.get(inv.household_id)?.name) || '—',
          category_name: inv.category_id ? catNameMap.get(inv.category_id) ?? null : null,
        }))
      );
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices, refreshKey]);

  return { invoices, households, loading, reloadInvoices: loadInvoices };
}
