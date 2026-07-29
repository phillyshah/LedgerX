/**
 * EstimateLinkModal
 *
 * Pick a transaction or contractor invoice to attach to an estimate, so a
 * quote can be reconciled against what was actually spent.
 *
 * Follows the shape of labs/MatchToStatementModal: a flat ranked list, a
 * client-side text filter, one confirm button per row, per-row busy state
 * and an inline error banner.
 *
 * Deliberately NOT scored. `scoreCandidate` in lib/statementMatching.ts
 * treats the amount as a hard gate — right when one card charge must equal
 * one receipt, wrong here, where a $5,000 quote is satisfied by an invoice
 * plus several smaller receipts. Every candidate would score null. The
 * server returns unlinked rows for the estimate's property, newest first,
 * and the admin picks.
 */

import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Search, Receipt, HardHat } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { parseExpenseDate } from '../../lib/dateUtils';
import type { Estimate, EstimateLinkCandidate } from '../../types/estimate';

interface Props {
  estimate: Estimate;
  onClose: () => void;
  /** Called after a successful link so the host can refresh its totals. */
  onLinked: () => void;
}

export function EstimateLinkModal({ estimate, onClose, onLinked }: Props) {
  const { t, locale } = useT();
  useEscapeClose(onClose);

  const [candidates, setCandidates] = useState<EstimateLinkCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc('list_estimate_link_candidates' as never, { p_estimate_id: estimate.id } as never)
      .then(({ data, error: rpcError }) => {
        if (cancelled) return;
        if (rpcError) setError(rpcError.message);
        // Explicit field mapping with a Number() coercion, same as the
        // reconciliation hooks — an unchecked cast hides shape drift.
        setCandidates(
          ((data ?? []) as Record<string, unknown>[]).map((r) => ({
            kind: r.kind as 'expense' | 'invoice',
            item_id: String(r.item_id),
            occurred_on: String(r.occurred_on),
            label: String(r.label ?? '—'),
            detail: (r.detail as string | null) ?? null,
            amount: Number(r.amount),
            currency: String(r.currency ?? 'USD'),
            household_id: (r.household_id as string | null) ?? null,
          })),
        );
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [estimate.id]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.label, c.detail].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [candidates, query]);

  const fmtDate = (d: string) =>
    parseExpenseDate(d).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  const fmtAmount = (n: number, currency: string) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: currency || 'USD' }).format(n);

  const confirm = async (c: EstimateLinkCandidate) => {
    setBusyId(c.item_id);
    setError('');
    const { error: rpcError } = await supabase.rpc('link_estimate_item' as never, {
      p_estimate_id: estimate.id,
      p_expense_id: c.kind === 'expense' ? c.item_id : null,
      p_invoice_id: c.kind === 'invoice' ? c.item_id : null,
    } as never);
    setBusyId(null);
    if (rpcError) {
      // The RPC raises a distinguishable message when the partial unique
      // index rejects a second claim on the same row.
      setError(
        /already linked/i.test(rpcError.message)
          ? t('estimate.link.errorAlreadyLinked')
          : rpcError.message,
      );
      return;
    }
    onLinked();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">{t('estimate.link.title')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-all" aria-label={t('common.close')}>
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="px-5 pt-4">
          <p className="text-sm text-slate-500 mb-3">{t('estimate.link.subtitle')}</p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('estimate.link.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
          </div>
          {error && (
            <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              {candidates.length === 0 ? t('estimate.link.noneAvailable') : t('estimate.link.noMatches')}
            </p>
          ) : (
            filtered.map((c) => (
              <div
                key={`${c.kind}:${c.item_id}`}
                className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  c.kind === 'invoice' ? 'bg-amber-100' : 'bg-emerald-100'
                }`}>
                  {c.kind === 'invoice'
                    ? <HardHat className="w-4 h-4 text-amber-700" />
                    : <Receipt className="w-4 h-4 text-emerald-700" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{c.label}</p>
                  <p className="text-xs text-slate-500 truncate">
                    {fmtDate(c.occurred_on)}
                    {c.detail ? ` · ${c.detail}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-slate-900 shrink-0">
                  {fmtAmount(c.amount, c.currency)}
                </span>
                <button
                  onClick={() => confirm(c)}
                  disabled={busyId !== null}
                  className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-all disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  {busyId === c.item_id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {t('estimate.link.confirm')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
