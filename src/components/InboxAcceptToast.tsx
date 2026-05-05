/**
 * InboxAcceptToast
 *
 * Shown for ~5s after a forwarded-email item is reviewed and saved as
 * either a receipt or an invoice. Confirms two things at once:
 *   1. The item was added to the relevant list (Recent Transactions / Invoices).
 *   2. The original email card was removed from the Email Inbox.
 *
 * Lives at the dashboard level so it survives the closing AddExpense /
 * InvoiceForm modals, and dismisses on click or after 5s.
 */

import { useEffect } from 'react';
import { Check, X } from 'lucide-react';
import { useT } from '../hooks/useT';

interface Props {
  kind: 'expense' | 'invoice';
  onDismiss: () => void;
}

export function InboxAcceptToast({ kind, onDismiss }: Props) {
  const { t } = useT();

  useEffect(() => {
    const id = window.setTimeout(onDismiss, 5000);
    return () => window.clearTimeout(id);
  }, [onDismiss]);

  const message =
    kind === 'invoice' ? t('inbox.savedAsInvoice') : t('inbox.savedAsExpense');

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4">
      <div
        role="status"
        className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-900 text-white shadow-xl border border-emerald-700/40 max-w-md animate-in slide-in-from-bottom-2 fade-in"
      >
        <div className="w-8 h-8 rounded-xl bg-emerald-700/50 flex items-center justify-center shrink-0">
          <Check className="w-4 h-4" />
        </div>
        <p className="text-sm leading-snug flex-1">{message}</p>
        <button
          onClick={onDismiss}
          aria-label={t('common.dismiss')}
          className="p-1 rounded-lg text-emerald-200 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
