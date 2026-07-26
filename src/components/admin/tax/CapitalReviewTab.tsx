import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Wrench, Building, CheckCircle2, Info, Calendar, Home } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import { parseExpenseDate } from '../../../lib/dateUtils';
import { suggestTreatment } from '../../../lib/scheduleE';
import type { CapitalTreatment, ScheduleELine } from '../../../lib/database.types';

interface QueueRow {
  kind: 'expense' | 'invoice';
  id: string;
  household_id: string | null;
  household_name: string | null;
  txn_date: string;
  vendor: string | null;
  description: string | null;
  category: string | null;
  line: ScheduleELine | null;
  amount: number;
  currency: string;
}

interface CapitalReviewTabProps {
  taxYear: number;
  deMinimis: number;
}

/**
 * The repair-vs-improvement queue. Only items at or above the de minimis
 * threshold appear — anything under it is currently deductible under the
 * safe harbor and doesn't need a per-item judgment call.
 *
 * Suggestions are pre-filled but never auto-applied: the
 * betterment/restoration/adaptation test is a legal judgment, and a wrong
 * answer flowing silently into a return is worse than no answer.
 */
export function CapitalReviewTab({ taxYear, deMinimis }: CapitalReviewTabProps) {
  const { t, locale } = useT();
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    return supabase.rpc('list_capital_review_queue', { p_tax_year: taxYear }).then(({ data, error: e }) => {
      if (e) { setError(e.message); setLoading(false); return; }
      setRows(((data ?? []) as QueueRow[]).map((r) => ({ ...r, amount: Number(r.amount) })));
      setLoading(false);
    });
  }, [taxYear]);

  useEffect(() => { void load(); }, [load]);

  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }),
    [locale]
  );
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    [locale]
  );

  const apply = async (row: QueueRow, treatment: CapitalTreatment) => {
    const key = `${row.kind}:${row.id}`;
    setSavingId(key);
    const { error: e } = await supabase.rpc('admin_set_capital_treatment', {
      p_kind: row.kind,
      p_id: row.id,
      p_treatment: treatment,
    });
    setSavingId(null);
    if (e) { setError(e.message); return; }
    // Optimistically drop the row — it no longer qualifies for the queue.
    setJustDone((d) => [...d, key]);
    setRows((rs) => rs.filter((r) => !(r.kind === row.kind && r.id === row.id)));
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">
          {t('tax.review.explainer', { amount: money.format(deMinimis) })}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 ring-1 ring-emerald-200/60 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <p className="text-sm font-semibold text-slate-900">{t('tax.review.allClear')}</p>
          <p className="text-xs text-slate-500 mt-1">
            {justDone.length > 0
              ? t('tax.review.reviewedCount', { count: justDone.length })
              : t('tax.review.allClearHint', { year: taxYear })}
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500">{t('tax.review.pending', { count: rows.length })}</p>
          <div className="space-y-2">
            {rows.map((row) => {
              const key = `${row.kind}:${row.id}`;
              const suggestion = suggestTreatment({
                amount: row.amount,
                deMinimisThreshold: deMinimis,
                line: row.line,
                text: [row.description, row.vendor, row.category],
              });
              const busy = savingId === key;

              return (
                <div key={key} className="rounded-xl border border-slate-200 bg-white p-3.5 hover:border-slate-300 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900 truncate">
                        {row.vendor || row.description || t('expenses.unnamed')}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap mt-1 text-xs text-slate-500">
                        <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-semibold uppercase tracking-wide">
                          {t(`tax.review.kind.${row.kind}`)}
                        </span>
                        {row.category && (
                          <span className="px-2 py-0.5 bg-slate-100 rounded-full truncate max-w-[10rem]">{row.category}</span>
                        )}
                        <span className="inline-flex items-center gap-1 whitespace-nowrap">
                          <Calendar className="w-3 h-3" />
                          {dateFmt.format(parseExpenseDate(row.txn_date))}
                        </span>
                        {row.household_name && (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap">
                            <Home className="w-3 h-3" />
                            {row.household_name}
                          </span>
                        )}
                      </div>
                      {row.description && row.vendor && (
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{row.description}</p>
                      )}
                    </div>
                    <p className="text-base font-bold text-slate-900 tabular-nums shrink-0">
                      {money.format(row.amount)}
                    </p>
                  </div>

                  {suggestion.treatment && (
                    <p className="text-[11px] text-slate-400 mt-2">
                      {t('tax.review.suggests', {
                        treatment: t(`tax.treatment.${suggestion.treatment}`),
                        reason: t(suggestion.reasonKey),
                      })}
                    </p>
                  )}

                  <div className="flex gap-2 mt-2.5">
                    <TreatmentButton
                      active={suggestion.treatment === 'repair'}
                      busy={busy}
                      icon={Wrench}
                      tone="emerald"
                      onClick={() => apply(row, 'repair')}
                      label={t('tax.treatment.repair')}
                      hint={t('tax.review.repairHint')}
                    />
                    <TreatmentButton
                      active={suggestion.treatment === 'improvement'}
                      busy={busy}
                      icon={Building}
                      tone="violet"
                      onClick={() => apply(row, 'improvement')}
                      label={t('tax.treatment.improvement')}
                      hint={t('tax.review.improvementHint')}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function TreatmentButton({
  active, busy, icon: Icon, tone, onClick, label, hint,
}: {
  active: boolean; busy: boolean; icon: typeof Wrench;
  tone: 'emerald' | 'violet'; onClick: () => void; label: string; hint: string;
}) {
  const base = tone === 'emerald'
    ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
    : 'border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100';
  const idle = 'border-slate-200 bg-white text-slate-600 hover:border-slate-300';

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={hint}
      className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border transition-all disabled:opacity-50 ${active ? base : idle}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {label}
      {active && <span className="text-[10px] font-bold uppercase opacity-60">{'★'}</span>}
    </button>
  );
}
