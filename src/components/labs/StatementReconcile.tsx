import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, Sparkles, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import type { Expense } from '../../types/expense';
import { rankCandidates, isHighConfidence, type StatementLineItem, type MatchCandidate } from '../../lib/statementMatching';
import { parseExpenseDate } from '../../lib/dateUtils';

interface StatementReconcileProps {
  statementId: string;
  cardLabel: string;
  candidateExpenses: Expense[];
  onBack: () => void;
}

const REASON_LABEL_KEYS: Record<string, string> = {
  exactAmount: 'labs.cc.reasonExactAmount',
  closeAmount: 'labs.cc.reasonCloseAmount',
  exactDate: 'labs.cc.reasonExactDate',
  closeDate: 'labs.cc.reasonCloseDate',
  vendorMatch: 'labs.cc.reasonVendorMatch',
};

export function StatementReconcile({ statementId, cardLabel, candidateExpenses, onBack }: StatementReconcileProps) {
  const { t, locale } = useT();
  const [lineItems, setLineItems] = useState<StatementLineItem[]>([]);
  const [claimedElsewhere, setClaimedElsewhere] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [autoMatchPreview, setAutoMatchPreview] = useState<{ item: StatementLineItem; candidate: MatchCandidate }[] | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);

  const loadLineItems = useCallback(async () => {
    setLoading(true);
    const [{ data: items }, { data: allMatched }] = await Promise.all([
      supabase.from('statement_line_items').select('*').eq('statement_id', statementId).order('line_date'),
      supabase.from('statement_line_items').select('statement_id, matched_expense_id').not('matched_expense_id', 'is', null),
    ]);

    setLineItems((items ?? []) as StatementLineItem[]);
    setClaimedElsewhere(
      new Set(
        (allMatched ?? [])
          .filter((r) => r.statement_id !== statementId)
          .map((r) => r.matched_expense_id as string)
      )
    );
    setLoading(false);
  }, [statementId]);

  useEffect(() => {
    loadLineItems();
  }, [loadLineItems]);

  const unmatched = lineItems.filter((li) => !li.matched_expense_id);
  const matched = lineItems.filter((li) => li.matched_expense_id);

  // Candidates for a given line item, excluding expenses already claimed by
  // a *different* statement's line item (the DB's partial unique index is
  // global, not per-statement).
  const candidatesFor = useCallback(
    (item: StatementLineItem): MatchCandidate[] => {
      const pool = candidateExpenses.filter((e) => !claimedElsewhere.has(e.id));
      return rankCandidates(item, pool);
    },
    [candidateExpenses, claimedElsewhere]
  );

  const selectedItem = lineItems.find((li) => li.id === selectedId) ?? null;
  const selectedCandidates = selectedItem ? candidatesFor(selectedItem) : [];

  const advanceToNextUnmatched = (justMatchedId: string) => {
    const remaining = unmatched.filter((li) => li.id !== justMatchedId);
    setSelectedId(remaining[0]?.id ?? null);
  };

  const confirmMatch = async (lineItemId: string, expenseId: string) => {
    setBusyId(lineItemId);
    setError('');
    const { error: rpcError } = await supabase.rpc('match_statement_line_item', {
      p_line_item_id: lineItemId,
      p_expense_id: expenseId,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await loadLineItems();
    advanceToNextUnmatched(lineItemId);
  };

  const undoMatch = async (lineItemId: string) => {
    setBusyId(lineItemId);
    setError('');
    const { error: rpcError } = await supabase.rpc('unmatch_statement_line_item', { p_line_item_id: lineItemId });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await loadLineItems();
  };

  const highConfidenceMatches = useMemo(() => {
    return unmatched
      .map((item) => {
        const candidates = candidatesFor(item);
        return isHighConfidence(candidates) ? { item, candidate: candidates[0] } : null;
      })
      .filter((v): v is { item: StatementLineItem; candidate: MatchCandidate } => v !== null);
  }, [unmatched, candidatesFor]);

  const runAutoMatch = async () => {
    if (!autoMatchPreview || autoMatchPreview.length === 0) return;
    setAutoMatching(true);
    setError('');
    const { error: rpcError } = await supabase.rpc('bulk_match_statement_line_items', {
      p_matches: autoMatchPreview.map((p) => ({ line_item_id: p.item.id, expense_id: p.candidate.expense.id })),
    });
    setAutoMatching(false);
    setAutoMatchPreview(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await loadLineItems();
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(amount);
  const formatDate = (dateString: string) =>
    parseExpenseDate(dateString).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading) {
    return <div className="h-64 bg-white rounded-2xl border border-slate-200 animate-pulse" />;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h2 className="text-xl font-bold text-slate-900">{cardLabel}</h2>
          <p className="text-sm text-slate-500">{t('labs.cc.reconcileSubtitle', { matched: String(matched.length), total: String(lineItems.length) })}</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
      )}

      {highConfidenceMatches.length > 0 && !autoMatchPreview && (
        <button
          onClick={() => setAutoMatchPreview(highConfidenceMatches)}
          className="mb-4 w-full flex items-center justify-center gap-2 py-3 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl transition-all"
        >
          <Sparkles className="w-4 h-4" />
          {t('labs.cc.autoMatchButton', { count: String(highConfidenceMatches.length) })}
        </button>
      )}

      {autoMatchPreview && (
        <div className="mb-4 p-4 bg-violet-50 border border-violet-200 rounded-xl space-y-3">
          <p className="text-sm font-medium text-violet-900">{t('labs.cc.autoMatchConfirm', { count: String(autoMatchPreview.length) })}</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {autoMatchPreview.map(({ item, candidate }) => (
              <div key={item.id} className="text-xs text-violet-800 flex justify-between">
                <span className="truncate">{item.description}</span>
                <span className="shrink-0 ml-2">{candidate.expense.vendor || t('labs.cc.unknownVendor')}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={runAutoMatch}
              disabled={autoMatching}
              className="flex-1 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {autoMatching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {t('labs.cc.confirmAutoMatch')}
            </button>
            <button
              onClick={() => setAutoMatchPreview(null)}
              className="px-4 py-2 bg-white border border-violet-200 text-violet-700 text-sm font-medium rounded-lg transition-all"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left pane: line items */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('labs.cc.lineItemsHeading')}</h3>
          {lineItems.length === 0 && (
            <p className="text-sm text-slate-500 py-6 text-center">{t('labs.cc.noLineItems')}</p>
          )}
          {lineItems.map((item) => {
            const isSelected = selectedId === item.id;
            const isMatched = !!item.matched_expense_id;
            const matchedExpense = isMatched ? candidateExpenses.find((e) => e.id === item.matched_expense_id) : null;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedId(isSelected ? null : item.id)}
                disabled={isMatched}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isSelected ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white'
                } ${isMatched ? 'opacity-70' : 'hover:border-violet-300'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{item.description}</p>
                    <p className="text-xs text-slate-500">{formatDate(item.line_date)} · {formatAmount(item.amount)}</p>
                  </div>
                  {isMatched ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">
                      <Check className="w-3 h-3" />
                      {t('labs.cc.statusMatched')}
                    </span>
                  ) : (
                    <span className="shrink-0 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                      {t('labs.cc.statusUnmatched')}
                    </span>
                  )}
                </div>
                {isMatched && matchedExpense && (
                  <div className="mt-2 flex items-center justify-between text-xs text-emerald-700">
                    <span className="truncate">{matchedExpense.vendor || t('labs.cc.unknownVendor')}</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); undoMatch(item.id); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); undoMatch(item.id); } }}
                      className="inline-flex items-center gap-1 font-medium hover:underline"
                    >
                      {busyId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                      {t('labs.cc.undo')}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Right pane: candidates for the selected line item */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('labs.cc.candidatesHeading')}</h3>
          {!selectedItem ? (
            <p className="text-sm text-slate-500 py-6 text-center">{t('labs.cc.selectLineItemHint')}</p>
          ) : selectedCandidates.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">{t('labs.cc.noCandidates')}</p>
          ) : (
            selectedCandidates.map((c) => (
              <div key={c.expense.id} className="p-3 rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.expense.vendor || t('labs.cc.unknownVendor')}</p>
                    <p className="text-xs text-slate-500">{formatDate(c.expense.expense_date)} · {formatAmount(c.expense.total)}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                    {c.expense.household_name}
                  </span>
                </div>
                {c.reasons.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {c.reasons.map((r) => (
                      <span key={r} className="text-[10px] font-medium text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">
                        {t(REASON_LABEL_KEYS[r] ?? r)}
                      </span>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => confirmMatch(selectedItem.id, c.expense.id)}
                  disabled={busyId === selectedItem.id}
                  className="mt-2 w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {busyId === selectedItem.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {t('labs.cc.confirmMatch')}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
