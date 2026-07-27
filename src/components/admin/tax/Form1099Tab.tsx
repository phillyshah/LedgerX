import { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Download, AlertTriangle, CheckCircle2,
  CreditCard, HelpCircle, ClipboardList, Info,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import { buildCsv, downloadBlob } from '../../../lib/csvExport';

interface Row {
  contractor_id: string;
  username: string | null;
  reportable_total: number;
  excluded_total: number;
  ambiguous_total: number;
  unknown_method_total: number;
  payment_count: number;
  methods: string | null;
  threshold: number;
  crosses_threshold: boolean;
}

interface Form1099TabProps {
  taxYear: number;
}

/**
 * Read-only. There is no contractor profile to fill in and no data entry at
 * all — every number here comes from invoices already in the system, and
 * everything else is a stated assumption rather than a question.
 *
 * The deliverable is the W-9 worksheet: one row per contractor over the
 * threshold, pre-filled with what the app knows and left blank where the
 * accountant collects the rest.
 */
export function Form1099Tab({ taxYear }: Form1099TabProps) {
  const { t, locale } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase.rpc('form_1099_summary', { p_tax_year: taxYear }).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) { setError(e.message); setLoading(false); return; }
      setRows(
        ((data ?? []) as Row[]).map((r) => ({
          ...r,
          reportable_total: Number(r.reportable_total),
          excluded_total: Number(r.excluded_total),
          ambiguous_total: Number(r.ambiguous_total),
          unknown_method_total: Number(r.unknown_method_total),
          threshold: Number(r.threshold),
        }))
      );
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [taxYear]);

  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    [locale]
  );
  const moneyExact = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }),
    [locale]
  );

  const listed = useMemo(() => rows.filter((r) => r.crosses_threshold), [rows]);
  const stats = useMemo(() => ({
    listed: listed.length,
    ambiguous: rows.filter((r) => r.ambiguous_total > 0).length,
    unknownMethod: rows.filter((r) => r.unknown_method_total > 0).length,
    threshold: rows[0]?.threshold ?? 0,
  }), [rows, listed]);

  /** Payment summary — every contractor, what they were paid and how. */
  const exportSummary = () => {
    const csv = buildCsv(
      [
        t('tax.f1099.col.contractor'), t('tax.f1099.col.reportable'),
        t('tax.f1099.col.excluded'), t('tax.f1099.col.ambiguous'),
        t('tax.f1099.col.unknownMethod'), t('tax.f1099.col.payments'),
        t('tax.f1099.col.methods'), t('tax.f1099.col.overThreshold'),
      ],
      rows.map((r) => [
        r.username ?? '', r.reportable_total, r.excluded_total, r.ambiguous_total,
        r.unknown_method_total, r.payment_count, r.methods ?? '',
        r.crosses_threshold ? t('common.yes') : t('common.no'),
      ])
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `1099-summary-${taxYear}.csv`);
  };

  /**
   * The W-9 worksheet. Left columns are what LedgerX knows; the right-hand
   * columns are the actual W-9 fields, deliberately blank — the accountant
   * (or the contractor) fills those in. None of it is ever stored here.
   */
  const exportWorksheet = () => {
    const csv = buildCsv(
      [
        t('tax.f1099.ws.contractor'), t('tax.f1099.ws.paid'), t('tax.f1099.ws.payments'),
        t('tax.f1099.ws.methods'),
        t('tax.f1099.ws.legalName'), t('tax.f1099.ws.businessName'),
        t('tax.f1099.ws.classification'), t('tax.f1099.ws.address'),
        t('tax.f1099.ws.cityStateZip'), t('tax.f1099.ws.tin'),
        t('tax.f1099.ws.exempt'), t('tax.f1099.ws.notes'),
      ],
      listed.map((r) => [
        r.username ?? '', r.reportable_total, r.payment_count, r.methods ?? '',
        '', '', '', '', '', '', '', '',
      ])
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `w9-worksheet-${taxYear}.csv`);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="grid grid-cols-3 gap-2.5">
        <Stat label={t('tax.f1099.stat.listed')} value={String(stats.listed)} tone="emerald" />
        <Stat label={t('tax.f1099.stat.threshold')} value={money.format(stats.threshold)} tone="slate" />
        <Stat label={t('tax.f1099.stat.contractors')} value={String(rows.length)} tone="slate" />
      </div>

      {/* What the app assumed, rather than asked. */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5" />
          {t('tax.f1099.assumptions')}
        </p>
        <ul className="text-[11px] text-slate-500 leading-relaxed space-y-1 list-disc pl-4">
          <li>{t('tax.f1099.assume.conservative')}</li>
          <li>{t('tax.f1099.assume.card')}</li>
          <li>{t('tax.f1099.assume.zelle')}</li>
          <li>{t('tax.f1099.assume.cashBasis')}</li>
        </ul>
      </div>

      {stats.ambiguous > 0 && (
        <Banner tone="amber" icon={HelpCircle}>{t('tax.f1099.warnVenmo')}</Banner>
      )}
      {stats.unknownMethod > 0 && (
        <Banner tone="amber" icon={AlertTriangle}>{t('tax.f1099.warnUnknownMethod')}</Banner>
      )}

      <div className="flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button
          onClick={exportWorksheet}
          disabled={listed.length === 0}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all disabled:opacity-50"
        >
          <ClipboardList className="w-4 h-4" />
          {t('tax.f1099.downloadWorksheet')}
        </button>
        <button
          onClick={exportSummary}
          disabled={rows.length === 0}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {t('tax.f1099.downloadSummary')}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">{t('tax.f1099.empty', { year: taxYear })}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.contractor_id}
              className={`rounded-xl border p-3.5 ${
                r.crosses_threshold ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900 truncate">{r.username ?? '—'}</span>
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {r.crosses_threshold
                      ? <Pill tone="emerald" icon={CheckCircle2}>{t('tax.f1099.onWorksheet')}</Pill>
                      : <Pill tone="slate">{t('tax.f1099.underThreshold')}</Pill>}
                    {r.excluded_total > 0 && (
                      <Pill tone="slate" icon={CreditCard}>
                        {t('tax.f1099.cardExcluded', { amount: money.format(r.excluded_total) })}
                      </Pill>
                    )}
                    {r.ambiguous_total > 0 && (
                      <Pill tone="amber" icon={HelpCircle}>
                        {t('tax.f1099.venmoAmbiguous', { amount: money.format(r.ambiguous_total) })}
                      </Pill>
                    )}
                    {r.unknown_method_total > 0 && (
                      <Pill tone="amber" icon={AlertTriangle}>
                        {t('tax.f1099.methodUnknown', { amount: money.format(r.unknown_method_total) })}
                      </Pill>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold text-slate-900 tabular-nums">{moneyExact.format(r.reportable_total)}</p>
                  <p className="text-[11px] text-slate-400">
                    {t(r.payment_count === 1 ? 'tax.f1099.paymentCountOne' : 'tax.f1099.paymentCount', { count: r.payment_count })}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-100">
        {t('tax.f1099.footnote')}
      </p>
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 text-amber-800 border-amber-200',
  slate:   'bg-slate-50 text-slate-600 border-slate-200',
} as const;

function Stat({ label, value, tone }: { label: string; value: string; tone: keyof typeof TONES }) {
  return (
    <div className={`rounded-xl border p-3 ${TONES[tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-bold mt-0.5 tabular-nums">{value}</p>
    </div>
  );
}

function Pill({
  children, tone, icon: Icon,
}: { children: React.ReactNode; tone: keyof typeof TONES; icon?: typeof CheckCircle2 }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border ${TONES[tone]}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </span>
  );
}

function Banner({
  children, tone, icon: Icon,
}: { children: React.ReactNode; tone: keyof typeof TONES; icon: typeof AlertTriangle }) {
  return (
    <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed ${TONES[tone]}`}>
      <Icon className="w-4 h-4 shrink-0 mt-0.5" />
      <p>{children}</p>
    </div>
  );
}
