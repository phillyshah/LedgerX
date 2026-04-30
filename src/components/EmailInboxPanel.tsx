/**
 * EmailInboxPanel
 *
 * Shown on the dashboard for all roles. Displays pending email-forwarded
 * receipts/invoices that arrived at receipts@90ten.life from one of the
 * user's registered sender addresses.
 *
 * Each item shows:
 *  - Sender / subject
 *  - OCR-prefilled data (vendor, amount, date, etc.)
 *  - Attachment thumbnail / PDF icon
 *  - "Open form to review" button  → opens AddExpense or InvoiceForm
 *    pre-populated with the OCR data (user can edit before saving)
 *  - "Discard" button
 *
 * The panel also contains the "Sender Emails" manager so users can add /
 * remove the addresses they forward from.
 */

import { useState, useEffect } from 'react';
import { Mail, FileText, X, Loader2, ExternalLink } from 'lucide-react';
import { useEmailInbox, type InboxItem } from '../hooks/useEmailInbox';
import { supabase } from '../lib/supabase';
import { useT } from '../hooks/useT';
export type { InboxItem } from '../hooks/useEmailInbox';

// ── Attachment preview ────────────────────────────────────────────────────────
function AttachmentThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(path);

  useEffect(() => {
    supabase.storage.from('receipts').createSignedUrl(path, 3600).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path]);

  if (!url) return null;

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img
          src={url}
          alt="attachment"
          className="w-20 h-20 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition-opacity flex-shrink-0"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors flex-shrink-0 gap-1"
    >
      <FileText className="w-8 h-8 text-slate-400" />
      <span className="text-xs text-slate-500">PDF</span>
    </a>
  );
}

// ── Single inbox card ─────────────────────────────────────────────────────────
function InboxCard({
  item,
  onDiscard,
  onOpenForm,
  t,
}: {
  item: InboxItem;
  onDiscard: (id: string) => void;
  onOpenForm: (item: InboxItem) => void;
  t: (k: string) => string;
}) {
  const p = item.prefilled;
  const dateStr = p.transaction_date ?? p.invoice_date ?? null;

  function fmtDate(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }

  function fmtAmount(n: number | null | undefined): string {
    if (n == null) return '—';
    return `$${n.toFixed(2)}`;
  }

  const hasPrefilled =
    !!p.vendor_name || p.total_amount != null || !!dateStr || !!p.invoice_number;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 sm:gap-3 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
        <div className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center ${
          item.kind === 'invoice' ? 'bg-purple-100' : 'bg-emerald-100'
        }`}>
          <Mail className={`w-4 h-4 ${item.kind === 'invoice' ? 'text-purple-600' : 'text-emerald-600'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              item.kind === 'invoice'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}>
              {item.kind === 'invoice' ? t('inbox.kindInvoice') : t('inbox.kindExpense')}
            </span>
            <span className="text-xs text-slate-400 truncate min-w-0">{t('inbox.from')} {item.from_email}</span>
          </div>
          {item.subject && (
            <p className="text-sm text-slate-600 mt-1 break-words line-clamp-2 sm:line-clamp-1">{item.subject}</p>
          )}
        </div>
        <button
          onClick={() => onDiscard(item.id)}
          className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          title={t('inbox.discard')}
          aria-label={t('inbox.discard')}
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* OCR prefilled data */}
      {hasPrefilled && (
        <div className="px-3 sm:px-4 pb-3 grid grid-cols-[auto_1fr] gap-x-3 sm:gap-x-4 gap-y-1 text-sm">
          {p.vendor_name && (
            <>
              <span className="text-slate-500">{t('inbox.vendor')}</span>
              <span className="font-medium text-slate-800 truncate min-w-0">{p.vendor_name}</span>
            </>
          )}
          {p.total_amount != null && (
            <>
              <span className="text-slate-500">{t('inbox.amount')}</span>
              <span className="font-medium text-slate-800">{fmtAmount(p.total_amount)}</span>
            </>
          )}
          {dateStr && (
            <>
              <span className="text-slate-500">{t('inbox.date')}</span>
              <span className="font-medium text-slate-800">{fmtDate(dateStr)}</span>
            </>
          )}
          {p.invoice_number && (
            <>
              <span className="text-slate-500">{t('inbox.invoiceNo')}</span>
              <span className="font-medium text-slate-800 truncate min-w-0">{p.invoice_number}</span>
            </>
          )}
        </div>
      )}

      {/* No-OCR notice (e.g., PDF that couldn't be auto-read) */}
      {!hasPrefilled && item.attachment_paths.length > 0 && (
        <div className="mx-3 sm:mx-4 mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          {t('inbox.manualEntryNeeded')}
        </div>
      )}

      {/* Attachments */}
      {item.attachment_paths.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 flex gap-2 flex-wrap">
          {item.attachment_paths.map(p => (
            <AttachmentThumb key={p} path={p} />
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 flex gap-2">
        <button
          onClick={() => onOpenForm(item)}
          className="flex-1 flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-semibold transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          {t('inbox.reviewAndAccept')}
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
interface Props {
  /** Called when the user wants to open AddExpense pre-filled from an inbox item */
  onOpenExpense: (item: InboxItem) => void;
  /** Called when the user wants to open InvoiceForm pre-filled from an inbox item */
  onOpenInvoice: (item: InboxItem) => void;
}

export function EmailInboxPanel({ onOpenExpense, onOpenInvoice }: Props) {
  const { t } = useT();
  const [refresh, setRefresh] = useState(0);
  const { items, loading, discard } = useEmailInbox(refresh);

  const handleOpenForm = (item: InboxItem) => {
    if (item.kind === 'invoice') {
      onOpenInvoice(item);
    } else {
      onOpenExpense(item);
    }
  };

  const handleDiscard = async (id: string) => {
    await discard(id);
    setRefresh(r => r + 1);
  };

  // Only render when there are pending items
  if (!loading && items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Mail className="w-4 h-4 text-emerald-600" />
        <h3 className="text-sm font-semibold text-slate-700">
          {t('inbox.pendingTitle')}{items.length > 0 ? ` (${items.length})` : ''}
        </h3>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : (
        items.map(item => (
          <InboxCard
            key={item.id}
            item={item}
            onDiscard={handleDiscard}
            onOpenForm={handleOpenForm}
            t={t}
          />
        ))
      )}
    </div>
  );
}
