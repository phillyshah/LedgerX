import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { supabase } from '../lib/supabase';
import { Send, Loader2 } from 'lucide-react';
import type { EstimateMessage } from '../types/estimate';

interface EstimateChatProps {
  estimateId: string;
  /** Called after a successful post or after the thread is marked read,
   *  so the parent list can refresh its unread badge. */
  onActivity?: () => void;
  /** Hide the composer. Network viewers can read but not post. */
  readOnly?: boolean;
}

/**
 * Shared back-and-forth thread rendered inside both the contractor and admin
 * estimate-detail modals. Opening the thread marks it read (clearing the
 * unread badge); both parties can post. Messages are immutable.
 */
export function EstimateChat({ estimateId, onActivity, readOnly }: EstimateChatProps) {
  const { user } = useAuth();
  const { t, locale } = useT();
  const [messages, setMessages] = useState<EstimateMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });

  // The signed-in user's own username (login email is `username@ledgerx.local`),
  // used to give "@you" mentions a stronger highlight than other @names.
  const myUsername = user?.email?.split('@')[0]?.toLowerCase() ?? null;

  // Render a message body with @username tokens emphasized. A mention of the
  // current viewer gets an amber highlight; any other @name is just bolded.
  const renderBody = (text: string, mine: boolean) => {
    const parts = text.split(/(@[A-Za-z0-9_]{3,20})/g);
    return parts.map((part, i) => {
      const m = /^@([A-Za-z0-9_]{3,20})$/.exec(part);
      if (!m) return part;
      const isMe = myUsername !== null && m[1].toLowerCase() === myUsername;
      if (isMe) {
        return (
          <span key={i} className="font-semibold rounded px-1 bg-amber-200 text-amber-900">
            {part}
          </span>
        );
      }
      return (
        <span key={i} className={`font-semibold ${mine ? 'text-emerald-50' : 'text-emerald-700'}`}>
          {part}
        </span>
      );
    });
  };

  const loadMessages = useCallback(async () => {
    const { data } = await supabase.rpc('list_estimate_messages' as never, {
      p_estimate_id: estimateId,
    } as never);
    setMessages((data as unknown as EstimateMessage[]) || []);
    setLoading(false);
  }, [estimateId]);

  // On open: load the thread and mark it read so the badge clears.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await loadMessages();
      if (cancelled) return;
      await supabase.rpc('mark_estimate_read' as never, { p_estimate_id: estimateId } as never);
      onActivity?.();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estimateId]);

  // Auto-scroll to newest whenever the message list grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !user) return;
    setSending(true);
    setError(null);

    const { error: insErr } = await supabase
      .from('estimate_messages')
      .insert({ estimate_id: estimateId, sender_id: user.id, body } as never);

    if (insErr) {
      // Surface the real Postgres/RLS error to the console for diagnosis while
      // keeping a friendly message for the user (RLS rejections show here).
      // Also compare the app's cached user id against who Supabase actually
      // authenticated the request as — a stale/mismatched session (e.g. still
      // signed in as a different account) fails RLS's `sender_id = auth.uid()`
      // check regardless of any participant invite or role.
      const { data: authCheck } = await supabase.auth.getUser();
      console.error(
        '[EstimateChat] message insert failed:', insErr.message ?? insErr, insErr,
        '| app user.id=', user.id, '| actual authenticated uid=', authCheck?.user?.id,
        '| MATCH=', user.id === authCheck?.user?.id,
      );
      setError(t('estimate.chatSendError'));
      setSending(false);
      return;
    }

    // Fire-and-forget the @mention emails. The edge function (backed by
    // estimate_mention_recipients) decides who — if anyone — actually gets one;
    // we only bother invoking it when the message contains an "@" at all. A
    // failure here must never block or fail the post, so we swallow errors.
    if (body.includes('@')) {
      supabase.functions
        .invoke('send-mention-notification', {
          body: { estimate_id: estimateId, actor_id: user.id, body },
        })
        .catch(() => { /* mention email is best-effort */ });
    }

    setDraft('');
    await loadMessages();
    // Posting also counts as reading — keep our own pointer current.
    await supabase.rpc('mark_estimate_read' as never, { p_estimate_id: estimateId } as never);
    onActivity?.();
    setSending(false);
  };

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <p className="text-sm font-semibold text-slate-900">{t('estimate.chatTitle')}</p>
      </div>

      {/* Thread */}
      <div className="max-h-72 overflow-y-auto px-4 py-3 space-y-3 bg-white">
        {loading ? (
          <p className="text-sm text-slate-400 py-4 text-center">{t('estimate.chatLoading')}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">{t('estimate.chatEmpty')}</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                    mine
                      ? 'bg-emerald-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-800 rounded-bl-sm'
                  }`}
                >
                  {renderBody(m.body, mine)}
                </div>
                <span className="text-[11px] text-slate-400 mt-1 px-1">
                  {mine ? t('estimate.chatYou') : `@${m.sender_username}`} · {fmtTime(m.created_at)}
                </span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer — hidden for read-only (network) viewers */}
      {!readOnly && (
        <div className="border-t border-slate-200 p-3 bg-slate-50">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder={t('estimate.chatPlaceholder')}
              className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent resize-none"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !draft.trim()}
              className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-900 hover:bg-emerald-800 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span className="hidden sm:inline">{t('estimate.chatSend')}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
