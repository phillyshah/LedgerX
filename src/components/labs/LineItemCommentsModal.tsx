import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Loader2, Send } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useAuth } from '../../contexts/AuthContext';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { parseExpenseDate } from '../../lib/dateUtils';
import { MentionInput } from './MentionInput';

interface Comment {
  id: string;
  author_id: string;
  author_username: string;
  body: string;
  created_at: string;
}

interface LineItemCommentsModalProps {
  lineItemId: string;
  description: string;
  amount: number;
  lineDate: string;
  cardLabel: string;
  onClose: () => void;
  /** Called after a comment posts so the caller can refresh comment counts. */
  onPosted: () => void;
}

// Highlight @username tokens; the current viewer's own handle gets a stronger tint.
function renderBody(body: string, me: string | undefined) {
  const parts = body.split(/(@[A-Za-z0-9_]{3,20})/g);
  return parts.map((part, i) => {
    if (/^@[A-Za-z0-9_]{3,20}$/.test(part)) {
      const isMe = me && part.slice(1).toLowerCase() === me.toLowerCase();
      return (
        <span key={i} className={isMe ? 'font-semibold text-violet-800 bg-violet-100 rounded px-0.5' : 'font-medium text-violet-700'}>
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function LineItemCommentsModal({
  lineItemId, description, amount, lineDate, cardLabel, onClose, onPosted,
}: LineItemCommentsModalProps) {
  const { t, locale } = useT();
  const { user } = useAuth();
  useEscapeClose(onClose);
  const myUsername = user?.email?.split('@')[0];

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const listEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('list_line_item_comments', { p_line_item_id: lineItemId });
    setComments((data ?? []) as Comment[]);
    setLoading(false);
  }, [lineItemId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { listEndRef.current?.scrollIntoView({ block: 'end' }); }, [comments.length]);

  const post = async () => {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true);
    setError('');
    const { error: insErr } = await supabase
      .from('statement_line_item_comments')
      .insert({ line_item_id: lineItemId, body });
    if (insErr) {
      setError(insErr.message);
      setPosting(false);
      return;
    }
    // Fire-and-forget email fan-out for @mentions (bell + WhatsApp are handled
    // by the DB trigger automatically).
    if (body.includes('@')) {
      supabase.functions.invoke('send-reconcile-mention', {
        body: { line_item_id: lineItemId, body },
      }).catch(() => { /* non-fatal */ });
    }
    setDraft('');
    setPosting(false);
    await load();
    onPosted();
  };

  const formatAmount = (a: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(a);
  const formatDate = (d: string) =>
    parseExpenseDate(d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
        {/* Pinned context header — what the thread is about */}
        <div className="p-5 border-b border-slate-200">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-1">{t('labs.cc.comments.heading')}</p>
              <p className="font-semibold text-slate-900 truncate">{description}</p>
              <p className="text-xs text-slate-500">{formatDate(lineDate)} · {formatAmount(amount)} · {cardLabel}</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all shrink-0">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3 min-h-[8rem]">
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-violet-500 animate-spin" /></div>
          ) : comments.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">{t('labs.cc.comments.empty')}</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-slate-800">@{c.author_username}</span>
                  <span className="text-[11px] text-slate-400">{formatTime(c.created_at)}</span>
                </div>
                <p className="text-slate-700 whitespace-pre-wrap break-words">{renderBody(c.body, myUsername)}</p>
              </div>
            ))
          )}
          <div ref={listEndRef} />
        </div>

        {/* Composer */}
        <div className="p-4 border-t border-slate-200">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <p className="text-[11px] text-slate-400 mb-1.5">{t('labs.cc.comments.mentionHint')}</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <MentionInput
                value={draft}
                onChange={setDraft}
                onSubmit={post}
                placeholder={t('labs.cc.comments.placeholder')}
                disabled={posting}
              />
            </div>
            <button
              onClick={post}
              disabled={posting || !draft.trim()}
              className="p-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition-all disabled:opacity-50 shrink-0"
              title={t('labs.cc.comments.send')}
            >
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
