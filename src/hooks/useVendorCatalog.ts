import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface VendorMapping {
  id: string;
  household_id: string | null;  // NULL = global / admin-curated
  vendor_name: string;
  category_name: string;
  updated_at: string;
}

/**
 * Reads the full vendor-catalog visible to the current user — household
 * mappings (per RLS) + globals. Used by the admin "Manage Vendors" page
 * AND by the AddExpense / InvoiceForm vendor-input <datalist> for
 * autocomplete.
 *
 * RLS already filters globals + the user's household-scoped rows, so we
 * pull everything in one query. The dedupe logic in components decides
 * whether to favor household over global when both exist.
 */
export function useVendorCatalog(refreshKey?: number) {
  const [vendors, setVendors] = useState<VendorMapping[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('vendor_category_map')
      .select('id, household_id, vendor_name, category_name, updated_at')
      .order('vendor_name', { ascending: true });
    if (!error && data) setVendors(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload, refreshKey]);

  return { vendors, loading, reload };
}

/**
 * Returns a deduplicated list of vendor names suitable for a <datalist>
 * autocomplete on the vendor input — household entries take precedence
 * over global entries with the same name (case-insensitive).
 */
export function uniqueVendorNames(vendors: VendorMapping[]): string[] {
  const seen = new Map<string, string>();
  for (const v of vendors) {
    const key = v.vendor_name.toLowerCase();
    if (!seen.has(key)) seen.set(key, v.vendor_name);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
