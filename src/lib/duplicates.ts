import { supabase } from './supabase';

export interface ExpenseDuplicate {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
}

export interface InvoiceDuplicate {
  id: string;
  invoice_number: string | null;
  service_date_start: string | null;
  service_date_end: string | null;
  amount: number;
}

/**
 * Look for receipts the current user already submitted in the same
 * household with the same vendor + total within ±1 day of the candidate
 * date. The match is intentionally narrow — we want to catch "same
 * receipt photographed twice" without triggering on legitimate
 * same-amount lunches at the same restaurant on different days.
 *
 * Empty arguments short-circuit: if vendor or total isn't known yet
 * (OCR still pending, user is mid-entry), we don't block them with a
 * spurious warning.
 */
export async function findExpenseDuplicates({
  householdId,
  vendor,
  total,
  expenseDate,
  excludeId,
}: {
  householdId: string;
  vendor: string | null;
  total: number | null;
  expenseDate: string;       // YYYY-MM-DD
  excludeId?: string;        // skip this row when checking on edit
}): Promise<ExpenseDuplicate[]> {
  if (!householdId || total == null || !Number.isFinite(total) || !expenseDate) return [];

  // ±1 day window around the candidate date. Parse via .split + Date()
  // so we never trip on UTC off-by-one — see CLAUDE.md.
  const [y, m, d] = expenseDate.split('-').map(Number);
  if (!y || !m || !d) return [];
  const center = new Date(y, m - 1, d);
  const startD = new Date(center); startD.setDate(center.getDate() - 1);
  const endD = new Date(center); endD.setDate(center.getDate() + 1);
  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  let query = supabase
    .from('expenses')
    .select('id, expense_date, vendor, total')
    .eq('household_id', householdId)
    .eq('total', total)
    .gte('expense_date', fmt(startD))
    .lte('expense_date', fmt(endD));

  if (vendor && vendor.trim()) {
    // Case-insensitive vendor match. Empty vendor → match any (still
    // requires same total + date window, which is enough signal).
    query = query.ilike('vendor', vendor.trim());
  }

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query.limit(5);
  if (error || !data) return [];
  return data as ExpenseDuplicate[];
}

/**
 * Invoice duplicate check: same invoice_number within the same
 * household. Different criteria from expenses because invoice_number is
 * the canonical identifier — exact match is the right test.
 */
export async function findInvoiceDuplicates({
  householdId,
  invoiceNumber,
  excludeId,
}: {
  householdId: string;
  invoiceNumber: string | null;
  excludeId?: string;
}): Promise<InvoiceDuplicate[]> {
  if (!householdId || !invoiceNumber || !invoiceNumber.trim()) return [];

  let query = supabase
    .from('contractor_invoices')
    .select('id, invoice_number, service_date_start, service_date_end, amount')
    .eq('household_id', householdId)
    .ilike('invoice_number', invoiceNumber.trim());

  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.limit(5);
  if (error || !data) return [];
  return data as InvoiceDuplicate[];
}
