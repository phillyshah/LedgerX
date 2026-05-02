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

import { useState, useEffect, useRef } from 'react';
import { Mail, FileText, X, Loader2, ChevronDown, Receipt, FileSignature } from 'lucide-react';
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
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
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

      {/* Actions — compact split button. The user picks receipt vs invoice;
          we OCR after the form opens so the answer is correct either way. */}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 flex justify-end">
        <ReviewMenu item={item} onOpenAs={onOpenAs} t={t} />
      </div>
    </div>
  );
}

// ── Review menu (small split button → dropdown) ───────────────────────────────
function ReviewMenu({
  item,
  onOpenAs,
  t,
}: {
  item: InboxItem;
  onOpenAs: (item: InboxItem, as: 'expense' | 'invoice') => void;
  t: (k: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click and Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('mousedown', handleClick);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-medium transition-all"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {t('inbox.review')}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="absolute right-0 mt-1 w-52 bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden z-10"
          role="menu"
        >
          <button
            type="button"
            onClick={() => { setOpen(false); onOpenAs(item, 'expense'); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-emerald-50 transition-colors"
            role="menuitem"
          >
            <Receipt className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="flex-1">{t('inbox.reviewAsReceipt')}</span>
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onOpenAs(item, 'invoice'); }}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-purple-50 transition-colors border-t border-slate-100"
            role="menuitem"
          >
            <FileSignature className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span className="flex-1">{t('inbox.reviewAsInvoice')}</span>
          </button>
        </div>
      )}
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

  // The wrapping CollapsibleSection on the dashboard provides the section
  // title — we just render the cards directly here.
  return (
    <div className="space-y-3">
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
