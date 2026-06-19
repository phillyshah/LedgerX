/**
 * EmailInboxPanel
 *
 * Card list for pending inbox items. State is owned by the parent (which
 * holds the useEmailInbox() instance) and threaded through as props — that
 * way badge counts or other UI that reads the same hook stay in sync.
 *
 * Hand this component:
 *   - items / loading / onDiscard from useEmailInbox()
 *   - onOpenItem(item)  — open whatever form makes sense for `item.kind`,
 *                         pre-populated from `item.prefilled`. After save,
 *                         the parent should call hook.accept(item.id).
 *
 * CONFIGURE:
 *   - STORAGE_BUCKET if your bucket isn't named 'attachments'
 *   - The pill set in <PrefilledPills> to match your prefilled fields
 *   - Styling to taste — classes here use Tailwind
 */

import { useState, useEffect } from 'react';
import { Mail, FileText, X, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { InboxItem } from './useEmailInbox';

const STORAGE_BUCKET = 'attachments';

// ─── Prefilled pills ─────────────────────────────────────────────────────────
function PrefilledPills({ item, locale }: { item: InboxItem; locale: string }) {
  const p = item.prefilled;
  const pills: { label: string; value: string }[] = [];
  if (p.vendor_name) pills.push({ label: 'Vendor', value: String(p.vendor_name) });
  if (p.total_amount != null) {
    const n = typeof p.total_amount === 'number' ? p.total_amount : parseFloat(String(p.total_amount));
    if (Number.isFinite(n)) {
      pills.push({
        label: 'Amount',
        value: new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(n),
      });
    }
  }
  if (p.transaction_date) pills.push({ label: 'Date', value: String(p.transaction_date) });
  if (pills.length === 0) return null;
  return (
    <div className="px-3 sm:px-4 pb-2 flex flex-wrap gap-1.5">
      {pills.map((pill, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs">
          <span className="text-slate-500">{pill.label}:</span>
          <span className="font-medium">{pill.value}</span>
        </span>
      ))}
    </div>
  );
}

// ─── Attachment thumbnail ────────────────────────────────────────────────────
function AttachmentThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(path);
  const isHeic = /\.heic$/i.test(path);
  const isHtml = /\.html?$/i.test(path); // synthetic HTML body attachment

  useEffect(() => {
    supabase.storage.from(STORAGE_BUCKET).createSignedUrl(path, 3600).then(({ data }) => {
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

  if (isHtml) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors flex-shrink-0 gap-1"
      >
        <Mail className="w-8 h-8 text-emerald-500" />
        <span className="text-[10px] text-emerald-700 font-medium">EMAIL</span>
      </a>
    );
  }

  const label = isHeic ? 'HEIC' : 'PDF';
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors flex-shrink-0 gap-1"
    >
      <FileText className="w-8 h-8 text-slate-400" />
      <span className="text-xs text-slate-500">{label}</span>
    </a>
  );
}

// ─── Single card ─────────────────────────────────────────────────────────────
function InboxCard({
  item,
  onDiscard,
  onOpen,
  locale,
}: {
  item: InboxItem;
  onDiscard: (id: string) => Promise<void> | void;
  onOpen: (item: InboxItem) => void;
  locale: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-start gap-2 sm:gap-3 px-3 sm:px-4 pt-3 sm:pt-4 pb-2 sm:pb-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-100">
          <Mail className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-slate-500 truncate block">From {item.from_email}</span>
          {item.subject && (
            <p className="text-sm font-medium text-slate-800 mt-0.5 break-words line-clamp-2 sm:line-clamp-1">
              {item.subject}
            </p>
          )}
        </div>
        <button
          onClick={() => onDiscard(item.id)}
          className="flex-shrink-0 p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
          aria-label="Discard"
          title="Discard"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <PrefilledPills item={item} locale={locale} />

      {item.attachment_paths.length > 0 && (
        <div className="px-3 sm:px-4 pb-3 flex gap-2 flex-wrap">
          {item.attachment_paths.map((p) => <AttachmentThumb key={p} path={p} />)}
        </div>
      )}

      <div className="px-3 sm:px-4 pb-3 sm:pb-4 flex justify-end">
        <button
          type="button"
          onClick={() => onOpen(item)}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-medium transition-all"
        >
          Review
        </button>
      </div>
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
interface Props {
  items: InboxItem[];
  loading: boolean;
  onDiscard: (id: string) => Promise<void> | void;
  /** Open whatever form makes sense for the item's `kind`, pre-populated. */
  onOpenItem: (item: InboxItem) => void;
  /** Locale string for Intl.NumberFormat (e.g. 'en-US'). */
  locale?: string;
}

export function EmailInboxPanel({ items, loading, onDiscard, onOpenItem, locale = 'en-US' }: Props) {
  if (!loading && items.length === 0) return null;
  return (
    <div className="space-y-3">
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading…
        </div>
      ) : (
        items.map((item) => (
          <InboxCard
            key={item.id}
            item={item}
            onDiscard={onDiscard}
            onOpen={onOpenItem}
            locale={locale}
          />
        ))
      )}
    </div>
  );
}
