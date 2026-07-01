import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { loadUserHouseholds, loadAllHouseholds } from '../../lib/queries';
import {
  X, ClipboardList, PieChart, Clock, Home, Calendar, TrendingUp,
} from 'lucide-react';
import type { Household } from '../../types/expense';

interface EstimateReportRow {
  estimate_id: string;
  title: string;
  status: 'open' | 'accepted' | 'rejected';
  billing_type: 'total' | 'labor_only';
  household_id: string | null;
  household_name: string | null;
  submitter_id: string | null;
  submitter_username: string;
  created_at: string;   // ISO timestamptz
  decided_at: string | null; // ISO timestamptz, set when status != 'open'
}

type Tab = 'summary' | 'aging';

interface EstimateReportProps {
  onClose: () => void;
}

// Default the summary window to the last 90 days.
function defaultDateRange(): { start: string; end: string } {
  const today = new Date();
  const start = new Date();
  start.setDate(today.getDate() - 90);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(today) };
}

interface ContractorStat {
  username: string;
  submitted: number;
  accepted: number;
  rejected: number;
}

export function EstimateReport({ onClose }: EstimateReportProps) {
  const { t, locale } = useT();
  const { isAdmin, user } = useAuth();
  useEscapeClose(onClose);

  const initial = defaultDateRange();
  const [tab, setTab] = useState<Tab>('summary');
  const [startDate, setStartDate] = useState(initial.start);
  const [endDate, setEndDate] = useState(initial.end);
  const [householdFilter, setHouseholdFilter] = useState<string>('all');

  const [households, setHouseholds] = useState<Household[]>([]);
  const [rows, setRows] = useState<EstimateReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Re-query whenever the household filter changes.
  useEffect(() => {
    void loadEstimates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdFilter]);

  const loadEstimates = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc('list_estimate_report' as never, {
        p_household_id: householdFilter === 'all' ? null : householdFilter,
      } as never);
      if (rpcErr) {
        console.error('list_estimate_report failed', rpcErr);
        setError(t('estimateReport.loadError'));
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as EstimateReportRow[]);
      }
    } catch (e) {
      console.error('list_estimate_report exception', e);
      setError(t('estimateReport.loadError'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });

  // Summary rows: created_at day within [startDate, endDate] inclusive. Day
  // math follows the repo rule — split 'YYYY-MM-DD' on '-' rather than
  // new Date(bareString). The end bound is bumped to end-of-day so the whole
  // end date is inclusive.
  const inRange = useMemo(() => {
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    const startMs = new Date(sy, sm - 1, sd, 0, 0, 0, 0).getTime();
    const endMs = new Date(ey, em - 1, ed, 23, 59, 59, 999).getTime();
    return rows.filter((r) => {
      const created = new Date(r.created_at).getTime();
      return created >= startMs && created <= endMs;
    });
  }, [rows, startDate, endDate]);

  const summary = useMemo(() => {
    const submitted = inRange.length;
    const accepted = inRange.filter((r) => r.status === 'accepted').length;
    const rejected = inRange.filter((r) => r.status === 'rejected').length;
    const open = inRange.filter((r) => r.status === 'open').length;

    const decided = accepted + rejected;
    const acceptanceRate = decided > 0 ? Math.round((accepted / decided) * 100) : null;

    const withDecision = inRange.filter((r) => r.decided_at != null);
    let avgTurnaround: number | null = null;
    if (withDecision.length > 0) {
      const totalDays = withDecision.reduce((sum, r) => {
        const created = new Date(r.created_at).getTime();
        const decided2 = new Date(r.decided_at as string).getTime();
        return sum + (decided2 - created) / 86400000;
      }, 0);
      avgTurnaround = Math.round((totalDays / withDecision.length) * 10) / 10;
    }

    return { submitted, accepted, rejected, open, acceptanceRate, avgTurnaround };
  }, [inRange]);

  // Per-contractor breakdown over the in-range rows, sorted by submitted desc.
  const byContractor = useMemo<ContractorStat[]>(() => {
    const map = new Map<string, ContractorStat>();
    for (const r of inRange) {
      const existing = map.get(r.submitter_username)
        ?? { username: r.submitter_username, submitted: 0, accepted: 0, rejected: 0 };
      existing.submitted += 1;
      if (r.status === 'accepted') existing.accepted += 1;
      if (r.status === 'rejected') existing.rejected += 1;
      map.set(r.submitter_username, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.submitted - a.submitted);
  }, [inRange]);

  const contractorRate = (s: ContractorStat): string => {
    const decided = s.accepted + s.rejected;
    if (decided === 0) return t('estimateReport.rateNa');
    return `${Math.round((s.accepted / decided) * 100)}%`;
  };

  // Open & aging: ALL rows (date range ignored) where status is open, oldest
  // first.
  const aging = useMemo(() =>
    rows
      .filter((r) => r.status === 'open')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [rows],
  );

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl shadow-xl w-full max-w-6xl sm:max-h-[90vh] sm:my-4 overflow-hidden flex flex-col">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 sm:px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-emerald-700" />
              {t('estimateReport.title')}
            </h2>
            <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">{t('estimateReport.subtitle')}</p>
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
              onClick={() => setTab('summary')}
              className={`px-4 py-2 text-sm font-medium rounded-t-xl transition-colors ${
                tab === 'summary'
                  ? 'bg-emerald-50 text-emerald-800 border-x border-t border-emerald-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <PieChart className="w-4 h-4" />
                {t('estimateReport.tabSummary')}
              </span>
            </button>
            <button
              onClick={() => setTab('aging')}
              className={`px-4 py-2 text-sm font-medium rounded-t-xl transition-colors ${
                tab === 'aging'
                  ? 'bg-emerald-50 text-emerald-800 border-x border-t border-emerald-200'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {t('estimateReport.tabAging')}
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

          {/* Shared filters — household applies to both tabs. Date range below
              only applies to the summary. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Home className="w-3.5 h-3.5" />
                {t('estimateReport.filterHousehold')}
              </label>
              <select
                value={householdFilter}
                onChange={(e) => setHouseholdFilter(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="all">{t('estimateReport.filterAll')}</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>

            {tab === 'summary' && (
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {t('estimateReport.filterDateRange')}
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
                <p className="text-xs text-slate-400 mt-1.5">{t('estimateReport.dateRangeNote')}</p>
              </div>
            )}
          </div>

          {/* Summary tab */}
          {tab === 'summary' && (
            <>
              {loading ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-8 text-center text-slate-500 text-sm">{t('estimateReport.loading')}</div>
                </div>
              ) : inRange.length === 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-8 text-center text-slate-500 text-sm">{t('estimateReport.emptySummary')}</div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <SummaryCard icon={ClipboardList} label={t('estimateReport.cardSubmitted')} value={String(summary.submitted)} />
                    <SummaryCard icon={ClipboardList} label={t('estimateReport.cardAccepted')} value={String(summary.accepted)} />
                    <SummaryCard icon={ClipboardList} label={t('estimateReport.cardRejected')} value={String(summary.rejected)} />
                    <SummaryCard icon={Clock} label={t('estimateReport.cardOpen')} value={String(summary.open)} />
                    <SummaryCard
                      icon={TrendingUp}
                      label={t('estimateReport.cardAcceptanceRate')}
                      value={summary.acceptanceRate == null ? t('estimateReport.rateNa') : `${summary.acceptanceRate}%`}
                    />
                    <SummaryCard
                      icon={Clock}
                      label={t('estimateReport.cardAvgTurnaround')}
                      value={summary.avgTurnaround == null
                        ? t('estimateReport.turnaroundNa')
                        : `${summary.avgTurnaround} ${t('estimateReport.days')}`}
                    />
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
                      <h3 className="text-sm font-semibold text-slate-900">{t('estimateReport.byContractorTitle')}</h3>
                    </div>
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colContractor')}</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colSubmitted')}</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colAccepted')}</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colRejected')}</th>
                          <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colRate')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-slate-200">
                        {byContractor.map((s) => (
                          <tr key={s.username} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5 text-sm text-slate-900">@{s.username}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.submitted}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.accepted}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 text-right">{s.rejected}</td>
                            <td className="px-3 py-2.5 text-sm text-slate-900 text-right font-medium">{contractorRate(s)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* Open & aging tab */}
          {tab === 'aging' && (
            <>
              <h3 className="text-sm font-semibold text-slate-900">{t('estimateReport.agingTitle')}</h3>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                {loading ? (
                  <div className="p-8 text-center text-slate-500 text-sm">{t('estimateReport.loading')}</div>
                ) : aging.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">{t('estimateReport.emptyAging')}</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colEstimate')}</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{t('estimateReport.colHousehold')}</th>
                        <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colSubmittedDate')}</th>
                        <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('estimateReport.colAge')}</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {aging.map((r) => {
                        const age = Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000);
                        const stale = age > 14;
                        return (
                          <tr key={r.estimate_id} className="hover:bg-slate-50">
                            <td className="px-3 py-2.5">
                              <div className="text-sm text-slate-900">{r.title}</div>
                              <div className="text-xs text-slate-400">@{r.submitter_username}</div>
                            </td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 hidden sm:table-cell">
                              {r.household_name ?? <span className="text-slate-300">—</span>}
                            </td>
                            <td className="px-3 py-2.5 text-sm text-slate-600 whitespace-nowrap">{fmtDate(r.created_at)}</td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <span className={`text-sm font-medium ${stale ? 'text-amber-600' : 'text-slate-900'}`}>
                                {age} {t('estimateReport.days')}
                              </span>
                              {stale && (
                                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                                  {t('estimateReport.stale')}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          <p className="text-xs text-slate-400 text-center">
            {t('estimateReport.scopeNote')}
          </p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof ClipboardList; label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
          <Icon className="w-5 h-5 text-emerald-700" />
        </div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
