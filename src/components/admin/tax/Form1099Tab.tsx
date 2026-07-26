import { useEffect, useMemo, useState, Suspense, lazy } from 'react';
import {
  Loader2, Download, AlertTriangle, CheckCircle2, ShieldCheck,
  CreditCard, HelpCircle, FileWarning, Pencil,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import { buildCsv, downloadBlob } from '../../../lib/csvExport';
import type { TaxEntityType } from '../../../lib/database.types';

const ContractorTaxProfileModal = lazy(() =>
  import('./ContractorTaxProfileModal').then((m) => ({ default: m.ContractorTaxProfileModal }))
);

interface Row {
  contractor_id: string;
  username: string | null;
  legal_name: string | null;
  entity_type: TaxEntityType | null;
  reportable_total: number;
  excluded_total: number;
  ambiguous_total: number;
  unknown_method_total: number;
  payment_count: number;
  threshold: number;
  crosses_threshold: boolean;
  w9_on_file: boolean;
  entity_exempt: boolean;
  requires_1099: boolean;
}

interface Form1099TabProps {
  taxYear: number;
}

export function Form1099Tab({ taxYear }: Form1099TabProps) {
  const { t, locale } = useT();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Row | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

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
  }, [taxYear, reloadKey]);

  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    [locale]
  );
  const moneyExact = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }),
    [locale]
  );

  const stats = useMemo(() => {
    const required = rows.filter((r) => r.requires_1099);
    return {
      required: required.length,
      missingW9: required.filter((r) => !r.w9_on_file).length,
      ambiguous: rows.filter((r) => r.ambiguous_total > 0).length,
      unknownMethod: rows.filter((r) => r.unknown_method_total > 0).length,
      threshold: rows[0]?.threshold ?? 0,
    };
  }, [rows]);

  const exportCsv = () => {
    const csv = buildCsv(
      [
        t('tax.f1099.col.contractor'), t('tax.f1099.col.legalName'), t('tax.f1099.col.entity'),
        t('tax.f1099.col.reportable'), t('tax.f1099.col.excluded'), t('tax.f1099.col.ambiguous'),
        t('tax.f1099.col.unknownMethod'), t('tax.f1099.col.w9'), t('tax.f1099.col.required'),
      ],
      rows.map((r) => [
        r.username ?? '', r.legal_name ?? '',
        r.entity_type ? t(`tax.entity.${r.entity_type}`) : '',
        r.reportable_total, r.excluded_total, r.ambiguous_total, r.unknown_method_total,
        r.w9_on_file ? t('common.yes') : t('common.no'),
        r.requires_1099 ? t('common.yes') : t('common.no'),
      ])
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `1099-nec-${taxYear}.csv`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      {/* Headline counters — the "what do I owe" answer, above the fold */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Stat label={t('tax.f1099.stat.required')} value={String(stats.required)} tone="emerald" />
        <Stat label={t('tax.f1099.stat.missingW9')} value={String(stats.missingW9)} tone={stats.missingW9 > 0 ? 'red' : 'slate'} />
        <Stat label={t('tax.f1099.stat.threshold')} value={money.format(stats.threshold)} tone="slate" />
        <Stat label={t('tax.f1099.stat.contractors')} value={String(rows.length)} tone="slate" />
      </div>

      {stats.missingW9 > 0 && (
        <Banner tone="red" icon={FileWarning}>
          {t('tax.f1099.warnMissingW9', { count: stats.missingW9 })}
        </Banner>
      )}
      {stats.ambiguous > 0 && (
        <Banner tone="amber" icon={HelpCircle}>{t('tax.f1099.warnVenmo')}</Banner>
      )}
      {stats.unknownMethod > 0 && (
        <Banner tone="amber" icon={AlertTriangle}>{t('tax.f1099.warnUnknownMethod')}</Banner>
      )}

      <div className="flex justify-end">
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {t('tax.exportCsv')}
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">{t('tax.f1099.empty', { year: taxYear })}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.contractor_id}
              className={`rounded-xl border p-3.5 transition-all ${
                r.requires_1099 && !r.w9_on_file
                  ? 'border-red-200 bg-red-50/50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 truncate">
                      {r.legal_name || r.username || '—'}
                    </span>
                    {r.legal_name && r.username && (
                      <span className="text-xs text-slate-400">@{r.username}</span>
                    )}
                    {r.entity_type && (
                      <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 rounded">
                        {t(`tax.entity.${r.entity_type}`)}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {r.requires_1099 ? (
                      <Pill tone="emerald" icon={CheckCircle2}>{t('tax.f1099.required')}</Pill>
                    ) : r.entity_exempt ? (
                      <Pill tone="slate" icon={ShieldCheck}>{t('tax.f1099.exempt')}</Pill>
                    ) : (
                      <Pill tone="slate">{t('tax.f1099.underThreshold')}</Pill>
                    )}
                    {r.requires_1099 && (
                      r.w9_on_file
                        ? <Pill tone="slate" icon={CheckCircle2}>{t('tax.f1099.w9OnFile')}</Pill>
                        : <Pill tone="red" icon={FileWarning}>{t('tax.f1099.noW9')}</Pill>
                    )}
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
                  <p className="text-lg font-bold text-slate-900 tabular-nums">
                    {moneyExact.format(r.reportable_total)}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {t(r.payment_count === 1 ? 'tax.f1099.paymentCountOne' : 'tax.f1099.paymentCount', { count: r.payment_count })}
                  </p>
                  <button
                    onClick={() => setEditing(r)}
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    <Pencil className="w-3 h-3" />
                    {t('tax.f1099.editProfile')}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-slate-400 leading-relaxed pt-2 border-t border-slate-100">
        {t('tax.f1099.footnote')}
      </p>

      {editing && (
        <Suspense fallback={null}>
          <ContractorTaxProfileModal
            contractorId={editing.contractor_id}
            username={editing.username}
            onSaved={() => { setEditing(null); setReloadKey((k) => k + 1); }}
            onClose={() => setEditing(null)}
          />
        </Suspense>
      )}
    </div>
  );
}

// ── Small presentational helpers ──────────────────────────────────────────

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  red:     'bg-red-50 text-red-700 border-red-200',
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
