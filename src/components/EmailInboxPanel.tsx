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
  onOpenAs,
  t,
}: {
  item: InboxItem;
  onDiscard: (id: string) => void;
  onOpenAs: (item: InboxItem, as: 'expense' | 'invoice') => void;
  t: (k: string) => string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header — kind-agnostic now; user picks at action time */}
      <div className="flex items-start gap-2 sm:gap-3 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-100">
          <Mail className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-slate-500 truncate block">
            {t('inbox.from')} {item.from_email}
          </span>
          {item.subject && (
            <p className="text-sm font-medium text-slate-800 mt-0.5 break-words line-clamp-2 sm:line-clamp-1">
              {item.subject}
            </p>
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

      {/* Attachments — clickable thumbs to view source before deciding kind */}
      {item.attachment_paths.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 flex gap-2 flex-wrap">
          {item.attachment_paths.map(p => (
            <AttachmentThumb key={p} path={p} />
          ))}
        </div>
      )}

      {/* Actions — user decides receipt vs invoice; we OCR after the form
          opens so the answer is correct for whichever path they pick. */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          onClick={() => onOpenAs(item, 'expense')}
          className="flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-semibold transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          {t('inbox.reviewAsReceipt')}
        </button>
        <button
          onClick={() => onOpenAs(item, 'invoice')}
          className="flex items-center justify-center gap-2 py-3 sm:py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-[0.98] text-white text-sm font-semibold transition-all"
        >
          <ExternalLink className="w-4 h-4" />
          {t('inbox.reviewAsInvoice')}
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

  // User picks receipt vs invoice on each card now (the auto-detected
  // `item.kind` is no longer used for routing — it was a guess). This
  // matches the user's preference: "no guessing we need to do."
  const handleOpenAs = (item: InboxItem, as: 'expense' | 'invoice') => {
    if (as === 'invoice') onOpenInvoice(item);
    else onOpenExpense(item);
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
            onOpenAs={handleOpenAs}
            t={t}
          />
        ))
      )}
    </div>
  );
}
