import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import type { ContractorInvoice } from '../types/invoice';

interface Household {
  id: string;
  name: string;
  property_type: string | null;
}

export function useInvoices(refreshKey?: number) {
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<ContractorInvoice[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);

  const loadInvoices = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // Load households the contractor is a member of (for household_name join)
    const { data: memberData } = await supabase
      .from('household_members')
      .select('household_id, households(id, name, property_type)')
      .eq('user_id', user.id);

    const hh = (memberData || [])
      .map((item) => item.households)
      .filter(Boolean) as unknown as Household[];
    setHouseholds(hh);

    const hhMap = new Map(hh.map((h) => [h.id, h]));

    // Load this contractor's invoices (RLS scopes to own)
    const { data, error } = await supabase
      .from('contractor_invoices')
      .select(
        'id, invoice_number, created_by, household_id, amount, currency, description, ' +
        'service_date_start, service_date_end, due_date, status, admin_notes, ' +
        'image_path, image_mime, image_width, image_height, created_at, updated_at, paid_at'
      )
      .order('created_at', { ascending: false });

    if (!error && data) {
      setInvoices(
        data.map((inv) => {
          const hhEntry = inv.household_id ? hhMap.get(inv.household_id) : null;
          return {
            ...inv,
            household_name: hhEntry?.name ?? '—',
            property_type: (hhEntry?.property_type as ContractorInvoice['property_type']) ?? null,
          };
        })
      );
    }

    setLoading(false);
  }, [user]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices, refreshKey]);

  return { invoices, households, loading, reloadInvoices: loadInvoices };
}
