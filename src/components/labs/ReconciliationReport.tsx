import { useEffect, useMemo, useState } from 'react';
import { X, Download, Loader2, FileBarChart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { parseExpenseDate, todayDateString } from '../../lib/dateUtils';
import { buildCsv, downloadBlob } from '../../lib/csvExport';

interface ReportRow {
  line_item_id: string;
  statement_id: string;
  card_label: string;
  line_date: string;
  description: string;
  amount: number;
  currency: string;
  is_matched: boolean;
  matched_household: string | null;
  matched_by_username: string | null;
  matched_at: string | null;
}

type StatusFilter = 'all' | 'reconciled' | 'unreconciled';

interface ReconciliationReportProps {
  onClose: () => void;
}

export function ReconciliationReport({ onClose }: ReconciliationReportProps) {
  const { t, locale } = useT();
  useEscapeClose(onClose);

  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [cardFilter, setCardFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [reconcilerFilter, setReconcilerFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    supabase.rpc('list_reconciliation_report').then(({ data, error: e }) => {
      if (e) { setError(e.message); setLoading(false); return; }
      setRows((data ?? []) as ReportRow[]);
      setLoading(false);
    });
  }, []);

  const cards = useMemo(() => [...new Set(rows.map((r) => r.card_label))].sort(), [rows]);
  const reconcilers = useMemo(
    () => [...new Set(rows.map((r) => r.matched_by_username).filter((v): v is string => !!v))].sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (cardFilter !== 'all' && r.card_label !== cardFilter) return false;
      if (statusFilter === 'reconciled' && !r.is_matched) return false;
      if (statusFilter === 'unreconciled' && r.is_matched) return false;
      if (reconcilerFilter !== 'all' && r.matched_by_username !== reconcilerFilter) return false;
      if (dateFrom && r.line_date < dateFrom) return false;
      if (dateTo && r.line_date > dateTo) return false;
      return true;
    });
  }, [rows, cardFilter, statusFilter, reconcilerFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const matched = filtered.filter((r) => r.is_matched).length;
    return { total, matched, unmatched: total - matched, pct: total ? Math.round((matched / total) * 100) : 0 };
  }, [filtered]);

  const formatAmount = (a: number, ccy: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: ccy || 'USD' }).format(a);
  const formatDate = (d: string) =>
    parseExpenseDate(d).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

  const exportRows = (data: ReportRow[], filename: string) => {
    const csv = buildCsv(
      ['Entry', 'Card', 'Date', 'Amount', 'Currency', 'Reconciled', 'Reconciled by', 'Reconciled at', 'Matched property'],
      data.map((r) => [
        r.description, r.card_label, r.line_date, r.amount, r.currency,
        r.is_matched ? 'Yes' : 'No',
        r.matched_by_username ?? '', r.matched_at ?? '', r.matched_household ?? '',
      ])
    );
    downloadBlob(new Blob([csv], { type: 'text/csv' }), filename);
  };

  const today = todayDateString();

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-6xl shadow-xl min-h-screen sm:min-h-0 sm:max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-5 rounded-t-2xl z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileBarChart className="w-5 h-5 text-emerald-600" />
            <h2 className="text-lg font-bold text-slate-900">{t('labs.cc.report.title')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

          {/* Stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: t('labs.cc.report.total'), value: stats.total, accent: 'text-slate-900' },
              { label: t('labs.cc.report.reconciled'), value: stats.matched, accent: 'text-emerald-700' },
              { label: t('labs.cc.report.unreconciled'), value: stats.unmatched, accent: 'text-emerald-700' },
              { label: t('labs.cc.report.percent'), value: `${stats.pct}%`, accent: 'text-slate-900' },
            ].map((s) => (
              <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
                <p className={`text-2xl font-bold mt-1 ${s.accent}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select value={cardFilter} onChange={(e) => setCardFilter(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="all">{t('labs.cc.report.allCards')}</option>
              {cards.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="all">{t('labs.cc.report.allStatus')}</option>
              <option value="reconciled">{t('labs.cc.report.reconciled')}</option>
              <option value="unreconciled">{t('labs.cc.report.unreconciled')}</option>
            </select>
            <select value={reconcilerFilter} onChange={(e) => setReconcilerFilter(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm">
              <option value="all">{t('labs.cc.report.allReconcilers')}</option>
              {reconcilers.map((u) => <option key={u} value={u}>@{u}</option>)}
            </select>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm" />
          </div>

          {/* Export */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => exportRows(filtered, `reconciliation-report-${today}.csv`)}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {t('labs.cc.report.exportCsv')}
            </button>
            <button
              onClick={() => exportRows(rows.filter((r) => !r.is_matched), `unreconciled-${today}.csv`)}
              disabled={rows.filter((r) => !r.is_matched).length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {t('labs.cc.report.exportUnreconciled')}
            </button>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-10">{t('labs.cc.report.noRows')}</p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-2.5 px-3">{t('labs.cc.report.colEntry')}</th>
                    <th className="py-2.5 px-3">{t('labs.cc.report.colDate')}</th>
                    <th className="py-2.5 px-3 text-right">{t('labs.cc.report.colAmount')}</th>
                    <th className="py-2.5 px-3">{t('labs.cc.report.colStatus')}</th>
                    <th className="py-2.5 px-3">{t('labs.cc.report.colBy')}</th>
                    <th className="py-2.5 px-3">{t('labs.cc.report.colAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.line_item_id}>
                      <td className="py-2.5 px-3">
                        <p className="font-medium text-slate-900 truncate max-w-[16rem]">{r.description}</p>
                        <p className="text-xs text-slate-400">{r.card_label}</p>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600">{formatDate(r.line_date)}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums text-slate-900">{formatAmount(r.amount, r.currency)}</td>
                      <td className="py-2.5 px-3">
                        {r.is_matched ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-100">{t('labs.cc.report.yes')}</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold text-emerald-700 bg-emerald-100">{t('labs.cc.report.no')}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{r.matched_by_username ? `@${r.matched_by_username}` : '—'}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">{r.matched_at ? formatTime(r.matched_at) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
