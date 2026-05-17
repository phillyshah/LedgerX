/**
 * AdminEmailInbox
 *
 * Wraps the EmailInboxPanel for the admin and household-admin surfaces.
 * Before v9.9 the inbox was only rendered inside the regular Dashboard,
 * so admins and household admins who forwarded receipts to receipts@90ten.life
 * never saw the resulting pending rows — the data was being inserted, but
 * the UI surface that read it only existed for non-admin users.
 *
 * This component is self-contained: it owns the AddExpense / InvoiceForm
 * modals that open from inbox cards, the `pendingInboxId` bookkeeping that
 * marks a row accepted on save, and the post-save toast. AdminLayout just
 * drops it into the home view.
 *
 * For full admins it also renders a small "system inbound activity"
 * diagnostic — a read-only peek at the most recent rows across ALL users.
 * Without this surface, when the admin's own inbox is empty there's no
 * way to tell whether the IMAP → edge-function → DB pipeline is working
 * at all; with it, the admin can immediately see whether forwards from
 * any user are landing.
 */

import { Suspense, lazy, useState, useEffect, useCallback } from 'react';
import { Mail, ChevronDown, Loader2 } from 'lucide-react';
import { CollapsibleSection } from '../CollapsibleSection';
import { EmailInboxPanel } from '../EmailInboxPanel';
import { InboxAcceptToast } from '../InboxAcceptToast';
import { useEmailInbox, type InboxItem } from '../../hooks/useEmailInbox';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../hooks/useT';
import { supabase } from '../../lib/supabase';
import type { AddExpenseInitialData } from '../AddExpense';
import type { InvoiceFormInitialData } from '../InvoiceForm';

const AddExpense  = lazy(() => import('../AddExpense').then((m) => ({ default: m.AddExpense })));
const InvoiceForm = lazy(() => import('../InvoiceForm').then((m) => ({ default: m.InvoiceForm })));

// ── System-wide diagnostic row ────────────────────────────────────────────────
// Full admins only. Reads from `email_inbox` directly; the existing
// "email_inbox: admin select" RLS policy already permits this.
interface DiagRow {
  id: string;
  user_id: string;
  from_email: string;
  subject: string | null;
  status: 'pending' | 'accepted' | 'discarded';
  kind: 'expense' | 'invoice';
  received_at: string;
}

function SystemDiagnostic() {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DiagRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('email_inbox')
      .select('id, user_id, from_email, subject, status, kind, received_at')
      .order('received_at', { ascending: false })
      .limit(20);
    if (queryError) {
      setError(queryError.message);
      setRows([]);
    } else {
      setRows((data ?? []) as DiagRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open && rows === null) load();
  }, [open, rows, load]);

  const statusPillCls = (s: DiagRow['status']) => {
    if (s === 'pending') return 'bg-amber-100 text-amber-800';
    if (s === 'accepted') return 'bg-emerald-100 text-emerald-800';
    return 'bg-slate-200 text-slate-600';
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-700">
          {t('inbox.diagnosticTitle')}
        </span>
        <span className="text-xs text-slate-400 ml-auto mr-1">
          {rows ? `${rows.length}` : ''}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? '' : '-rotate-90'}`}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">{t('inbox.diagnosticHelp')}</p>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="text-xs font-medium px-2 py-1 rounded-md text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t('inbox.diagnosticRefresh')}
            </button>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {!loading && rows && rows.length === 0 && !error && (
            <p className="text-xs text-slate-500 italic py-2">
              {t('inbox.diagnosticEmpty')}
            </p>
          )}

          {rows && rows.length > 0 && (
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-50 text-xs"
                >
                  <span className={`px-1.5 py-0.5 rounded font-medium ${statusPillCls(r.status)}`}>
                    {r.status}
                  </span>
                  <span className="text-slate-700 font-medium truncate flex-1">
                    {r.from_email}
                  </span>
                  <span className="text-slate-500 truncate hidden sm:inline max-w-[40%]">
                    {r.subject ?? '—'}
                  </span>
                  <span className="text-slate-400 tabular-nums flex-shrink-0">
                    {new Date(r.received_at).toLocaleString(locale, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main wrapper ──────────────────────────────────────────────────────────────
interface Props {
  /** Stable localStorage key for the CollapsibleSection wrapper. */
  storageKey: string;
}

export function AdminEmailInbox({ storageKey }: Props) {
  const { isAdmin } = useAuth();
  const { t } = useT();
  const {
    items,
    loading,
    discard,
    accept,
  } = useEmailInbox(0);

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [expenseInitialData, setExpenseInitialData] = useState<AddExpenseInitialData | undefined>();
  const [invoiceInitialData, setInvoiceInitialData] = useState<InvoiceFormInitialData | undefined>();
  const [pendingInboxId, setPendingInboxId] = useState<string | null>(null);
  const [acceptToast, setAcceptToast] = useState<'expense' | 'invoice' | null>(null);

  const handleOpenExpense = (item: InboxItem) => {
    setExpenseInitialData({
      vendor: item.prefilled.vendor_name ?? undefined,
      total: item.prefilled.total_amount != null ? String(item.prefilled.total_amount) : undefined,
      expense_date: item.prefilled.transaction_date ?? undefined,
      notes: item.prefilled.handwritten_notes ?? undefined,
      attachment_paths: item.attachment_paths,
    });
    setPendingInboxId(item.id);
    setShowAddExpense(true);
  };

  const handleOpenInvoice = (item: InboxItem) => {
    setInvoiceInitialData({
      vendor_name: item.prefilled.vendor_name ?? undefined,
      invoice_number: item.prefilled.invoice_number ?? undefined,
      amount: item.prefilled.total_amount != null ? String(item.prefilled.total_amount) : undefined,
      description: item.prefilled.description ?? undefined,
      invoice_date: item.prefilled.invoice_date ?? undefined,
      attachment_paths: item.attachment_paths,
    });
    setPendingInboxId(item.id);
    setShowInvoiceForm(true);
  };

  const onExpenseSaved = async () => {
    if (pendingInboxId) {
      await accept(pendingInboxId);
      setPendingInboxId(null);
      setAcceptToast('expense');
    }
  };
  const onInvoiceSaved = async () => {
    if (pendingInboxId) {
      await accept(pendingInboxId);
      setPendingInboxId(null);
      setAcceptToast('invoice');
    }
  };

  // We always render the section for admins so they have a place to see
  // the diagnostic — even when their own pending count is zero. Household
  // admins follow the original auto-hide rule.
  const hasItems = items.length > 0;
  const hidden = isAdmin ? false : !hasItems;

  return (
    <>
      <CollapsibleSection
        storageKey={storageKey}
        title={t('inbox.pendingTitle')}
        icon={<Mail className="w-4 h-4" />}
        meta={hasItems ? `${items.length}` : undefined}
        hidden={hidden}
      >
        <div className="space-y-3">
          {hasItems || loading ? (
            <EmailInboxPanel
              items={items}
              loading={loading}
              onDiscard={discard}
              onOpenExpense={handleOpenExpense}
              onOpenInvoice={handleOpenInvoice}
            />
          ) : (
            <p className="text-sm text-slate-500 italic py-1">
              {t('inbox.emptyAdmin')}
            </p>
          )}
          {isAdmin && <SystemDiagnostic />}
        </div>
      </CollapsibleSection>

      <Suspense fallback={null}>
        {showAddExpense && (
          <AddExpense
            onClose={() => {
              setShowAddExpense(false);
              setExpenseInitialData(undefined);
              setPendingInboxId(null);
            }}
            onSaved={onExpenseSaved}
            initialData={expenseInitialData}
          />
        )}
        {showInvoiceForm && (
          <InvoiceForm
            onClose={() => {
              setShowInvoiceForm(false);
              setInvoiceInitialData(undefined);
              setPendingInboxId(null);
            }}
            onSaved={onInvoiceSaved}
            initialData={invoiceInitialData}
          />
        )}
      </Suspense>

      {acceptToast && (
        <InboxAcceptToast kind={acceptToast} onDismiss={() => setAcceptToast(null)} />
      )}
    </>
  );
}
