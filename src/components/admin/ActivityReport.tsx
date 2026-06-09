import { useState, useEffect, useMemo, lazy, Suspense, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { loadUserHouseholds, loadAllHouseholds } from '../../lib/queries';
import {
  X, Activity, Home, Calendar, User as UserIcon, Filter, ChevronRight,
  FileText, Receipt, CheckCircle, HardHat, LogIn,
} from 'lucide-react';
import type { Expense, Household } from '../../types/expense';
import type { ContractorInvoice, InvoiceImage } from '../../types/invoice';

const EditExpense = lazy(() => import('../EditExpense').then((m) => ({ default: m.EditExpense })));

type EventType =
  | 'expense_created'
  | 'expense_paid'
  | 'invoice_created'
  | 'invoice_paid';

interface ActivityRow {
  event_id: string;
  event_type: EventType;
  entity_type: 'expense' | 'invoice';
  entity_id: string;
  actor_id: string | null;
  actor_username: string;
  household_id: string | null;
  household_name: string | null;
  category_id: string | null;
  amount: number | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
}

interface LastLoginRow {
  user_id: string;
  username: string;
  last_sign_in_at: string | null;
  household_names: string[];
}

type Tab = 'feed' | 'logins';

interface ActivityReportProps {
  onClose: () => void;
}

// Default the feed to the last 30 days — same window AdminAnalytics opens at.
function defaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 30);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(today) };
}

const EVENT_TYPES: EventType[] = [
  'expense_created',
  'expense_paid',
  'invoice_created',
  'invoice_paid',
];

export function ActivityReport({ onClose }: ActivityReportProps) {
  const { t, locale } = useT();
  const { isAdmin, user } = useAuth();
  useEscapeClose(onClose);

  const initial = defaultDateRange();
  const [tab, setTab] = useState<Tab>('feed');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [householdFilter, setHouseholdFilter] = useState<string>('all');
  const [actorFilter, setActorFilter] = useState<string[]>([]);
  // Default: all four event types selected. An empty set means "show none",
  // which is rarely useful but keeps the UX symmetric.
  const [eventTypes, setEventTypes] = useState<Set<EventType>>(new Set(EVENT_TYPES));

  const [households, setHouseholds] = useState<Household[]>([]);
  const [teamMembers, setTeamMembers] = useState<LastLoginRow[]>([]);
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [logins, setLogins] = useState<LastLoginRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingLogins, setLoadingLogins] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<ContractorInvoice | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Load household list once. Admins see every household; HAs only their own.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const hh = isAdmin ? await loadAllHouseholds() : await loadUserHouseholds(user.id);
      if (!cancelled) setHouseholds(hh);
    })();
    return () => { cancelled = true; };
  }, [isAdmin, user]);

  // Load the team-member list up front so the User filter is populated on
  // both tabs from the moment the modal opens — independent of whether the
  // feed has returned any rows yet. We reuse list_team_member_last_login
  // since it already returns one row per allowed user under the same
  // scope rules as the activity feed.
  useEffect(() => {
    void loadLogins();
  }, []);

  // Re-query whenever any filter changes (cheap — capped at 2000 rows server-side).
  useEffect(() => {
    void loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, householdFilter, eventTypes, actorFilter]);

  const loadActivity = async () => {
    setLoading(true);
    setError(null);
    try {
      const startTs = new Date(`${startDate}T00:00:00`).toISOString();
      // End is exclusive — bump to the next day so endDate is inclusive.
      const endParts = endDate.split('-').map(Number);
      const endTs = new Date(endParts[0], endParts[1] - 1, endParts[2] + 1).toISOString();

      const types = Array.from(eventTypes);
      const { data, error: rpcErr } = await supabase.rpc(
        'list_team_activity' as never,
        {
          p_start: startTs,
          p_end: endTs,
          p_household_id: householdFilter === 'all' ? null : householdFilter,
          p_actor_ids: actorFilter.length ? actorFilter : null,
          p_event_types: types.length === EVENT_TYPES.length ? null : types,
        } as never,
      );
      if (rpcErr) {
        console.error('list_team_activity failed', rpcErr);
        setError(t('activityReport.loadError'));
        setRows([]);
      } else {
        setRows((data ?? []) as ActivityRow[]);
      }
    } catch (e) {
      console.error('list_team_activity exception', e);
      setError(t('activityReport.loadError'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const loadLogins = async () => {
    setLoadingLogins(true);
    try {
      const { data, error: rpcErr } = await supabase.rpc('list_team_member_last_login' as never);
      if (rpcErr) {
        console.error('list_team_member_last_login failed', rpcErr);
        setLogins([]);
        setTeamMembers([]);
      } else {
        const rowsList = (data ?? []) as LastLoginRow[];
        setLogins(rowsList);
        setTeamMembers(rowsList);
      }
    } finally {
      setLoadingLogins(false);
    }
  };

  // User-picker options come from the pre-loaded team-member list so the
  // filter is fully populated before any feed rows are returned.
  const actorOptions = useMemo(() =>
    [...teamMembers]
      .map((m) => ({ id: m.user_id, username: m.username }))
      .sort((a, b) => a.username.localeCompare(b.username)),
    [teamMembers],
  );

  // Logins are filtered client-side by household + user so the Last-logins
  // tab honours the same selection as the feed.
  const filteredLogins = useMemo(() => {
    const householdName = householdFilter === 'all'
      ? null
      : households.find((h) => h.id === householdFilter)?.name ?? null;
    return logins.filter((l) => {
      if (actorFilter.length && !actorFilter.includes(l.user_id)) return false;
      if (householdName && !l.household_names.includes(householdName)) return false;
      return true;
    });
  }, [logins, actorFilter, householdFilter, households]);

  const fmtDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  };

  const fmtAmount = (n: number | null, ccy?: string) => {
    if (n == null) return '';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: ccy || 'USD',
    }).format(n);
  };

  // The detail click loads the underlying row in full and opens the matching
  // modal. For invoices we open an inline read-only panel that mirrors the
  // AdminInvoices detail panel so household_admins (no mark-paid powers) see
  // the same shape admins do.
  const openDetail = async (row: ActivityRow) => {
    setLoadingDetail(true);
    try {
      if (row.entity_type === 'expense') {
        const { data } = await supabase
          .from('expenses')
          .select('*')
          .eq('id', row.entity_id)
          .maybeSingle();
        if (data) {
          setEditingExpense({
            ...data,
            household_name: row.household_name ?? undefined,
          } as Expense);
        }
      } else {
        const { data: inv } = await supabase
          .from('contractor_invoices')
          .select('*')
          .eq('id', row.entity_id)
          .maybeSingle();
        if (inv) {
          setDetailInvoice(inv as ContractorInvoice);
          const { data: imgs } = await supabase
            .from('invoice_images')
            .select('image_path')
            .eq('invoice_id', row.entity_id)
            .order('display_order');
          const images = (imgs ?? []) as Pick<InvoiceImage, 'image_path'>[];
          const paths = Array.from(new Set(
            [inv.image_path, ...images.map((i) => i.image_path)]
              .filter((p): p is string => !!p),
          ));
          const signed = await Promise.all(paths.map((p) =>
            supabase.storage.from('receipts').createSignedUrl(p, 3600)
              .then((r) => [p, r.data?.signedUrl] as const),
          ));
          const urls: Record<string, string> = {};
          for (const [p, u] of signed) if (u) urls[p] = u;
          setSignedUrls(urls);
        }
      }
    } finally {
      setLoadingDetail(false);
    }
  };

  const eventLabel = (type: EventType) => {
    switch (type) {
      case 'expense_created': return t('activityReport.eventExpenseCreated');
      case 'expense_paid':    return t('activityReport.eventExpensePaid');
      case 'invoice_created': return t('activityReport.eventInvoiceCreated');
      case 'invoice_paid':    return t('activityReport.eventInvoicePaid');
    }
  };

  const eventIcon = (type: EventType) => {
    switch (type) {
      case 'expense_created': return Receipt;
      case 'expense_paid':    return CheckCircle;
      case 'invoice_created': return HardHat;
      case 'invoice_paid':    return CheckCircle;
    }
  };

  const eventTone = (type: EventType): string => {
    switch (type) {
      case 'expense_created': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'expense_paid':    return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'invoice_created': return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'invoice_paid':    return 'bg-green-50 text-green-700 border-green-200';
    }
  };

  const toggleEventType = (e: EventType) => {
    setEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(e)) next.delete(e); else next.add(e);
      return next;
    });
  };

  const toggleActor = (id: string) => {
    setActorFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-6xl sm:max-h-[90vh] sm:my-4 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-700" />
              {t('activityReport.title')}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">{t('activityReport.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
            aria-label={t('common.close')}
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="px-5 sm:px-6 pt-4 border-b border-slate-200 shrink-0">
          <div className="flex gap-1">
            <button
              onClick={() => setTab('feed')}
              className={`px-4 py-2 text-sm font-medium rounded-t-xl transition-colors ${
                tab === 'feed'
                  ? 'bg-emerald-50 text-emerald-800 border-x border-t border-emerald-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Activity className="w-4 h-4" />
                {t('activityReport.tabFeed')}
              </span>
            </button>
            <button
              onClick={() => setTab('logins')}
              className={`px-4 py-2 text-sm font-medium rounded-t-xl transition-colors ${
                tab === 'logins'
                  ? 'bg-emerald-50 text-emerald-800 border-x border-t border-emerald-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <LogIn className="w-4 h-4" />
                {t('activityReport.tabLogins')}
              </span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">

          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Shared filters — household + user are available on both tabs.
              Date range and event-type chips below only apply to the feed. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Home className="w-3.5 h-3.5" />
                {t('activityReport.filterHousehold')}
              </label>
              <select
                value={householdFilter}
                onChange={(e) => setHouseholdFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">{t('activityReport.filterAll')}</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <UserIcon className="w-3.5 h-3.5" />
                {t('activityReport.filterActor')}
                {actorFilter.length > 0 && (
                  <button
                    onClick={() => setActorFilter([])}
                    className="ml-2 normal-case text-emerald-700 hover:text-emerald-800 font-normal"
                  >
                    {t('activityReport.clearAll')}
                  </button>
                )}
              </label>
              {actorOptions.length === 0 ? (
                <p className="text-xs text-slate-400 px-1 py-2">
                  {loadingLogins ? t('activityReport.loading') : t('activityReport.noTeamMembers')}
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto bg-white border border-slate-200 rounded-xl p-2">
                  {actorOptions.map((a) => {
                    const active = actorFilter.includes(a.id);
                    return (
                      <button
                        key={a.id}
                        onClick={() => toggleActor(a.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
                        }`}
                      >
                        @{a.username}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {tab === 'feed' && (
            <>
              {/* Feed-only filters: date range + event type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {t('activityReport.filterDateRange')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="flex-1 px-2.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                    <span className="text-slate-400 text-sm">–</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="flex-1 px-2.5 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" />
                    {t('activityReport.filterEventType')}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {EVENT_TYPES.map((et) => {
                      const active = eventTypes.has(et);
                      return (
                        <button
                          key={et}
                          onClick={() => toggleEventType(et)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            active
                              ? 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-300'
                          }`}
                        >
                          {eventLabel(et)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Feed table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {loading ? (
                  <div className="p-8 text-center text-slate-500 text-sm">{t('activityReport.loading')}</div>
                ) : rows.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">{t('activityReport.emptyFeed')}</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('activityReport.colTime')}</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('activityReport.colUser')}</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('activityReport.colAction')}</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{t('activityReport.colHousehold')}</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('activityReport.colAmount')}</th>
                        <th className="px-2 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {rows.map((r) => {
                        const Icon = eventIcon(r.event_type);
                        const ccy = (r.metadata && typeof r.metadata.currency === 'string')
                          ? (r.metadata.currency as string)
                          : 'USD';
                        return (
                          <tr
                            key={r.event_id}
                            className="hover:bg-slate-50 cursor-pointer transition-colors"
                            onClick={() => openDetail(r)}
                          >
                            <td className="px-3 py-2.5 text-sm text-slate-600 whitespace-nowrap">{fmtDateTime(r.occurred_at)}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-900">
                              @{r.actor_username}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${eventTone(r.event_type)}`}>
                                <Icon className="w-3 h-3" />
                                {eventLabel(r.event_type)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 hidden sm:table-cell">
                              {r.household_name ?? <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-sm text-slate-900 text-right whitespace-nowrap font-medium">
                              {fmtAmount(r.amount, ccy)}
                            </td>
                            <td className="px-2 py-2.5 text-right">
                              <ChevronRight className="w-4 h-4 text-slate-400 inline" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <p className="text-xs text-slate-400 text-center">
                {t('activityReport.scopeNote')}
              </p>
            </>
          )}

          {tab === 'logins' && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {loadingLogins ? (
                <div className="p-8 text-center text-slate-500 text-sm">{t('activityReport.loading')}</div>
              ) : filteredLogins.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">{t('activityReport.emptyLogins')}</div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('activityReport.colUser')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('activityReport.colLastLogin')}</th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{t('activityReport.colHouseholds')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {filteredLogins.map((l) => (
                      <tr key={l.user_id} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-sm text-slate-900">@{l.username}</td>
                        <td className="px-3 py-2.5 text-sm text-slate-600 whitespace-nowrap">
                          {l.last_sign_in_at
                            ? fmtDateTime(l.last_sign_in_at)
                            : <span className="text-slate-400">{t('activityReport.lastLoginNever')}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-600 hidden sm:table-cell">
                          {l.household_names.length === 0
                            ? <span className="text-slate-300">—</span>
                            : l.household_names.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expense detail — reuses the existing EditExpense modal */}
      <Suspense fallback={null}>
        {editingExpense && (
          <EditExpense
            expense={editingExpense}
            onClose={() => setEditingExpense(null)}
            onSuccess={async () => {
              setEditingExpense(null);
              await loadActivity();
            }}
          />
        )}
      </Suspense>

      {/* Invoice detail — read-only panel that mirrors AdminInvoices' detail
          (no mark-paid here; admins use the full Invoices view for that). */}
      {detailInvoice && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-2xl sm:max-h-[90vh] sm:my-4 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-5 rounded-t-2xl z-10 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{t('adminInvoices.detailTitle')}</h3>
              <button
                onClick={() => { setDetailInvoice(null); setSignedUrls({}); }}
                className="p-2 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Field
                  label={t('adminInvoices.detailInvoiceNumber')}
                  value={detailInvoice.invoice_number
                    ? <span className="font-mono">{detailInvoice.invoice_number}</span>
                    : <span className="text-slate-400">{t('invoice.noNumberPlaceholder')}</span>}
                />
                <Field
                  label={t('adminInvoices.detailAmount')}
                  value={fmtAmount(detailInvoice.amount, detailInvoice.currency)}
                />
                <Field
                  label={t('adminInvoices.detailServicePeriod')}
                  value={
                    detailInvoice.service_date_start === detailInvoice.service_date_end
                      ? detailInvoice.service_date_start
                      : `${detailInvoice.service_date_start} – ${detailInvoice.service_date_end}`
                  }
                />
                <Field
                  label={t('adminInvoices.detailStatus')}
                  value={
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                      detailInvoice.status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {detailInvoice.status === 'paid' ? t('invoice.statusPaid') : t('invoice.statusPending')}
                    </span>
                  }
                />
              </div>

              {detailInvoice.description && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">{t('adminInvoices.detailDescription')}</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{detailInvoice.description}</p>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold text-slate-900 mb-2">{t('adminInvoices.detailAttachments')}</p>
                {loadingDetail ? (
                  <p className="text-sm text-slate-400">{t('adminInvoices.loadingImages')}</p>
                ) : Object.keys(signedUrls).length === 0 ? (
                  <p className="text-sm text-slate-400">{t('adminInvoices.detailNoAttachments')}</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {Object.entries(signedUrls).map(([path, url]) => {
                      const isPdf = path.toLowerCase().endsWith('.pdf');
                      return isPdf ? (
                        <a
                          key={path}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex flex-col items-center justify-center h-28 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100 transition-colors gap-1 text-slate-500"
                        >
                          <FileText className="w-7 h-7 text-red-400" />
                          <span className="text-xs">{t('adminInvoices.detailClickToOpen')}</span>
                        </a>
                      ) : (
                        <a
                          key={path}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block rounded-xl overflow-hidden border border-slate-200 hover:opacity-90 transition-opacity"
                        >
                          <img src={url} alt="Invoice attachment" className="w-full h-28 object-cover" />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-0.5">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}
