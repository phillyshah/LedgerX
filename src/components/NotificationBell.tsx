import { useState, type ReactNode } from 'react';
import { Bell, MessageCircle, AtSign, ClipboardList, FileText, CheckCheck, Trash2, Mail, Tag, ChevronRight } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useNotifications } from '../hooks/useNotifications';
import { useReviewQueue } from '../hooks/useReviewQueue';
import type { AppNotification, NotificationKind } from '../types/notification';

/** What a pinned review-queue row links to when tapped. */
export type ReviewTarget = 'inbox' | 'uncategorized';

interface NotificationBellProps {
  /** Compact size for the contractor mobile header. */
  compact?: boolean;
  /** Dark emerald header palette (admin bar). */
  dark?: boolean;
  /**
   * Deep-link handler. Fired (in addition to mark-read) when a row is tapped,
   * so the host shell can open the referenced estimate/invoice. When omitted,
   * a tap only marks the row read (legacy behavior).
   */
  onOpen?: (n: AppNotification) => void;
  /**
   * Handler for the pinned review-queue rows. When omitted the rows still
   * render (the count is the point) but aren't tappable — so a shell that
   * hasn't wired up a destination degrades to informational rather than
   * offering a dead tap.
   */
  onOpenReview?: (target: ReviewTarget) => void;
}

const KIND_ICON: Record<NotificationKind, typeof Bell> = {
  chat_message: MessageCircle,
  chat_mention: AtSign,
  estimate_created: ClipboardList,
  estimate_status: ClipboardList,
  invoice_created: FileText,
  invoice_paid: FileText,
  reconcile_mention: AtSign,
};

function relativeTime(iso: string, locale: string): string {
  const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const min = Math.round(diffSec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (diffSec < 60) return rtf.format(-diffSec, 'second');
  if (min < 60) return rtf.format(-min, 'minute');
  if (hr < 24) return rtf.format(-hr, 'hour');
  return rtf.format(-day, 'day');
}

/**
 * One pinned review-queue row. Renders as a plain (non-interactive) row when
 * no handler is supplied so a shell without a destination never offers a tap
 * that goes nowhere.
 */
function ReviewRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="shrink-0 mt-0.5 text-amber-600">{icon}</span>
      <span className="min-w-0 flex-1 text-sm text-amber-900 leading-snug">{label}</span>
      {onClick && <ChevronRight className="shrink-0 w-4 h-4 text-amber-400 mt-0.5" aria-hidden="true" />}
    </>
  );
  return (
    <li>
      {onClick ? (
        <button
          onClick={onClick}
          className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-amber-100/70 transition-colors"
        >
          {content}
        </button>
      ) : (
        <div className="flex items-start gap-3 px-4 py-3">{content}</div>
      )}
    </li>
  );
}

/**
 * Header notification bell. Repurposed from the old "What's New" bell (release
 * notes moved to the footer in v11.3). Shows the unread count and opens a
 * dropdown of recent activity — new chat messages, new estimates/invoices, and
 * status changes. Data + read-tracking come from `useNotifications`.
 */
export function NotificationBell({ compact = false, dark = false, onOpen, onOpenReview }: NotificationBellProps) {
  const { t, locale } = useT();
  const { notifications, unreadCount, markRead, remove } = useNotifications();
  const { summary, total: reviewCount } = useReviewQueue();
  const [open, setOpen] = useState(false);

  // The badge is everything demanding attention, not just unread events — a
  // forwarded receipt nobody has reviewed is exactly the thing users were
  // missing, and it never produced a notification row.
  const badgeCount = unreadCount + reviewCount;

  const iconSize = compact ? 'w-5 h-5' : 'w-4 h-4';
  const colorClass = dark
    ? badgeCount > 0
      ? 'text-amber-300 hover:text-amber-200 hover:bg-emerald-800'
      : 'text-emerald-200 hover:text-white hover:bg-emerald-800'
    : badgeCount > 0
      ? 'text-amber-600 hover:text-amber-700 hover:bg-amber-50'
      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50';

  const messageFor = (n: AppNotification): string => {
    const name = n.actor_username || t('notifications.someone');
    // Estimates always have a title; invoices may lack an invoice number, so
    // fall back to number-free copy rather than an awkward "invoice: an invoice".
    switch (n.kind) {
      case 'chat_message':
        return t('notifications.kindChatMessage', { name, title: n.title || t('notifications.anEstimate') });
      case 'chat_mention':
        return t('notifications.kindChatMention', { name, title: n.title || t('notifications.anEstimate') });
      case 'estimate_created':
        return t('notifications.kindEstimateCreated', { name, title: n.title || t('notifications.anEstimate') });
      case 'estimate_status':
        return t('notifications.kindEstimateStatus', { title: n.title || t('notifications.anEstimate') });
      case 'invoice_created':
        return n.title
          ? t('notifications.kindInvoiceCreated', { name, title: n.title })
          : t('notifications.kindInvoiceCreatedNoTitle', { name });
      case 'invoice_paid':
        return n.title
          ? t('notifications.kindInvoicePaid', { title: n.title })
          : t('notifications.kindInvoicePaidNoTitle');
      case 'reconcile_mention':
        return t('notifications.kindReconcileMention', { name, title: n.title || t('labs.cc.report.title') });
      default:
        return n.title || '';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`relative flex items-center p-2 rounded-xl transition-all ${colorClass}`}
        aria-label={t('notifications.title')}
        title={t('notifications.title')}
      >
        <Bell className={iconSize} />
        {badgeCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ${dark ? 'ring-emerald-900' : 'ring-white'}`}
            aria-hidden="true"
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />

          <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <p className="text-sm font-semibold text-slate-900">{t('notifications.title')}</p>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markRead()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    {t('notifications.markAllRead')}
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    onClick={() => remove()}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t('notifications.clearAll')}
                  </button>
                )}
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto">
              {/* Pinned review queue. Not dismissible and carries no read
                  state — these are live counts, so they disappear on their own
                  once the underlying items are dealt with. */}
              {reviewCount > 0 && (
                <ul className="divide-y divide-amber-100 bg-amber-50/70 border-b border-amber-100">
                  {summary.pendingInbox > 0 && (
                    <ReviewRow
                      icon={<Mail className="w-4 h-4" />}
                      label={
                        summary.pendingInbox === 1
                          ? t('reviewQueue.pendingInboxOne')
                          : t('reviewQueue.pendingInboxMany', { count: String(summary.pendingInbox) })
                      }
                      onClick={onOpenReview ? () => { onOpenReview('inbox'); setOpen(false); } : undefined}
                    />
                  )}
                  {summary.uncategorized > 0 && (
                    <ReviewRow
                      icon={<Tag className="w-4 h-4" />}
                      label={
                        summary.uncategorized === 1
                          ? t('reviewQueue.uncategorizedOne')
                          : t('reviewQueue.uncategorizedMany', { count: String(summary.uncategorized) })
                      }
                      onClick={onOpenReview ? () => { onOpenReview('uncategorized'); setOpen(false); } : undefined}
                    />
                  )}
                </ul>
              )}

              {notifications.length === 0 ? (
                reviewCount === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-10 px-4">{t('notifications.empty')}</p>
                ) : null
              ) : (
                <ul className="divide-y divide-slate-100">
                  {notifications.map((n) => {
                    const Icon = KIND_ICON[n.kind] ?? Bell;
                    const unread = !n.read_at;
                    return (
                      <li
                        key={n.id}
                        className={`relative group transition-colors ${
                          unread ? 'bg-emerald-50/60 hover:bg-emerald-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <button
                          onClick={() => {
                            if (unread) markRead([n.id]);
                            onOpen?.(n);
                            setOpen(false);
                          }}
                          className="w-full text-left flex items-start gap-3 pl-4 pr-10 py-3"
                        >
                          <span className={`shrink-0 mt-0.5 ${unread ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm text-slate-800 leading-snug">{messageFor(n)}</span>
                            <span className="block text-xs text-slate-400 mt-0.5">
                              {relativeTime(n.created_at, locale)}
                            </span>
                          </span>
                          {unread && <span className="shrink-0 mt-1.5 w-2 h-2 rounded-full bg-emerald-600" aria-hidden="true" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); remove([n.id]); }}
                          className="absolute top-1/2 -translate-y-1/2 right-2 p-1.5 rounded-lg text-slate-300 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all"
                          aria-label={t('notifications.delete')}
                          title={t('notifications.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
