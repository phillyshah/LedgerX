import { useEffect, useMemo, useState } from 'react';
import { Loader2, Download, AlertTriangle, Building2, Info } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useT } from '../../../hooks/useT';
import { buildCsv, downloadBlob } from '../../../lib/csvExport';
import {
  SCHEDULE_E_LINES, scheduleELineKey, pivotScheduleE, householdKey,
  type ScheduleERow,
} from '../../../lib/scheduleE';

interface ScheduleETabProps {
  taxYear: number;
}

export function ScheduleETab({ taxYear }: ScheduleETabProps) {
  const { t, locale } = useT();
  const [rows, setRows] = useState<ScheduleERow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    supabase.rpc('schedule_e_report', { p_tax_year: taxYear }).then(({ data, error: e }) => {
      if (cancelled) return;
      if (e) { setError(e.message); setLoading(false); return; }
      setRows(((data ?? []) as ScheduleERow[]).map((r) => ({ ...r, total: Number(r.total), txn_count: Number(r.txn_count) })));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [taxYear]);

  const pivot = useMemo(() => pivotScheduleE(rows), [rows]);
  const money = useMemo(
    () => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }),
    [locale]
  );

  // Only render lines that actually have money on them — a 15-row grid of
  // mostly zeros is noise, especially on a phone.
  const activeLines = useMemo(
    () => SCHEDULE_E_LINES.filter((l) => (pivot.lineTotals.get(l) ?? 0) !== 0),
    [pivot]
  );

  const exportCsv = () => {
    const csv = buildCsv(
      [t('tax.scheduleE.col.line'), ...pivot.households.map((h) => h.name || t('tax.noHousehold')), t('common.total')],
      activeLines.map((line) => [
        t(scheduleELineKey(line)),
        ...pivot.households.map((h) => pivot.cells.get(line)?.get(householdKey(h.id)) ?? 0),
        pivot.lineTotals.get(line) ?? 0,
      ])
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `schedule-e-${taxYear}.csv`);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>;
  }
  if (error) return <p className="p-6 text-sm text-red-600">{error}</p>;

  return (
    <div className="p-4 sm:p-5 space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-500 leading-relaxed">{t('tax.scheduleE.formNotice')}</p>
      </div>

      {pivot.unmapped > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            {t('tax.scheduleE.unmappedWarn', { amount: money.format(pivot.unmapped) })}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/70">{t('tax.scheduleE.deductible')}</p>
          <p className="text-xl font-bold text-emerald-800 mt-0.5 tabular-nums">{money.format(pivot.grandTotal)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t('tax.scheduleE.capitalized')}</p>
          <p className="text-xl font-bold text-slate-700 mt-0.5 tabular-nums">{money.format(pivot.capitalized)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">{t('tax.scheduleE.capitalizedHint')}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{t('tax.scheduleE.properties')}</p>
          <p className="text-xl font-bold text-slate-700 mt-0.5 tabular-nums">{pivot.households.length}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={exportCsv}
          disabled={activeLines.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {t('tax.exportCsv')}
        </button>
      </div>

      {activeLines.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-10">{t('tax.scheduleE.empty', { year: taxYear })}</p>
      ) : (
        // Wide matrix scrolls inside its own container so the modal body
        // never scrolls sideways.
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full min-w-[32rem] text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left font-semibold text-slate-500 text-xs uppercase tracking-wide py-2 pr-3 sticky left-0 bg-white">
                  {t('tax.scheduleE.col.line')}
                </th>
                {pivot.households.map((h) => (
                  <th key={householdKey(h.id)} className="text-right font-semibold text-slate-500 text-xs uppercase tracking-wide py-2 px-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {h.name || t('tax.noHousehold')}
                    </span>
                  </th>
                ))}
                <th className="text-right font-bold text-slate-700 text-xs uppercase tracking-wide py-2 pl-3">{t('common.total')}</th>
              </tr>
            </thead>
            <tbody>
              {activeLines.map((line) => (
                <tr key={line} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="py-2 pr-3 text-slate-700 sticky left-0 bg-white whitespace-nowrap">{t(scheduleELineKey(line))}</td>
                  {pivot.households.map((h) => {
                    const v = pivot.cells.get(line)?.get(householdKey(h.id)) ?? 0;
                    return (
                      <td key={householdKey(h.id)} className={`py-2 px-3 text-right tabular-nums ${v ? 'text-slate-900' : 'text-slate-300'}`}>
                        {v ? money.format(v) : '—'}
                      </td>
                    );
                  })}
                  <td className="py-2 pl-3 text-right font-semibold text-slate-900 tabular-nums">
                    {money.format(pivot.lineTotals.get(line) ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td className="py-2.5 pr-3 font-bold text-slate-900 sticky left-0 bg-white">{t('common.total')}</td>
                {pivot.households.map((h) => (
                  <td key={householdKey(h.id)} className="py-2.5 px-3 text-right font-bold text-slate-900 tabular-nums">
                    {money.format(pivot.householdTotals.get(householdKey(h.id)) ?? 0)}
                  </td>
                ))}
                <td className="py-2.5 pl-3 text-right font-bold text-emerald-800 tabular-nums">{money.format(pivot.grandTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
