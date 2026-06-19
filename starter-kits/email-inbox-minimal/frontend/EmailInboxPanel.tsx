/**
 * EmailInboxPanel
 *
 * A minimal card list for pending inbox items. Each card shows the sender,
 * subject, a short body preview, and any attachment thumbnails — plus a
 * Discard button. Use it as-is for a quick admin/inbox UI, or copy it as a
 * reference and build your own.
 *
 * Hand this component:
 *   - items / loading / onDiscard from useEmailInbox()
 *   - onOpenItem(item) — your own handler that processes the row however you
 *     like (e.g. open a review modal, route to a typed form, etc.). After
 *     you've handled it, call the hook's accept(item.id) to flip the row.
 */

import { useState, useEffect } from 'react';
import { Mail, FileText, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { InboxItem } from './useEmailInbox';

// ─── CONFIGURE ───────────────────────────────────────────────────────────────
// Must match the bucket name in 0002_storage_policy.sql + edge function.
const STORAGE_BUCKET = 'attachments';

// ─── Attachment thumbnail ────────────────────────────────────────────────────
function AttachmentThumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = /\.(jpe?g|png|webp|gif)$/i.test(path);

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

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col items-center justify-center w-20 h-20 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors flex-shrink-0 gap-1"
    >
      <FileText className="w-8 h-8 text-slate-400" />
      <span className="text-xs text-slate-500 truncate max-w-full px-1">
        {path.split('.').pop()?.toUpperCase() ?? 'FILE'}
      </span>
    </a>
  );
}

// ─── Single card ─────────────────────────────────────────────────────────────
function InboxCard({
  item,
  onDiscard,
  onOpen,
}: {
  item: InboxItem;
  onDiscard: (id: string) => Promise<void> | void;
  onOpen?: (item: InboxItem) => void;
}) {
  const preview = (item.body_text ?? '').slice(0, 220).trim();
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-start gap-3 px-4 pt-4 pb-2">
        <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-100">
          <Mail className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-slate-500 truncate block">From {item.from_email}</span>
          {item.subject && (
            <p className="text-sm font-medium text-slate-800 mt-0.5 break-words line-clamp-2">
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

      {preview && (
        <p className="px-4 pb-2 text-xs text-slate-600 whitespace-pre-wrap line-clamp-3">
          {preview}
        </p>
      )}

      {item.attachment_paths.length > 0 && (
        <div className="px-4 pb-3 flex gap-2 flex-wrap">
          {item.attachment_paths.map((p) => <AttachmentThumb key={p} path={p} />)}
        </div>
      )}

      {onOpen && (
        <div className="px-4 pb-4 flex justify-end">
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-sm font-medium transition-all"
          >
            Review
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
interface Props {
  items: InboxItem[];
  loading: boolean;
  onDiscard: (id: string) => Promise<void> | void;
  /** Optional: open whatever review UI / form your app uses. */
  onOpenItem?: (item: InboxItem) => void;
}

export function EmailInboxPanel({ items, loading, onDiscard, onOpenItem }: Props) {
  if (!loading && items.length === 0) return null;
  return (
    <div className="space-y-3">
      {loading ? (
        <div className="text-sm text-slate-500 py-2">Loading…</div>
      ) : (
        items.map((item) => (
          <InboxCard
            key={item.id}
            item={item}
            onDiscard={onDiscard}
            onOpen={onOpenItem}
          />
        ))
      )}
    </div>
  );
}
