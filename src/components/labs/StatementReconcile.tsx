import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronUp, Edit2, Loader2, MessageCircle, Search, Sparkles, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import type { Expense } from '../../types/expense';
import { rankCandidates, rankAllForBrowse, isHighConfidence, type StatementLineItem, type MatchCandidate } from '../../lib/statementMatching';
import { parseExpenseDate } from '../../lib/dateUtils';

const LineItemCommentsModal = lazy(() => import('./LineItemCommentsModal').then((m) => ({ default: m.LineItemCommentsModal })));

// How many strict, in-bounds suggestions to surface before the divider.
const MAX_SUGGESTIONS = 5;

interface StatementReconcileProps {
  statementId: string;
  cardLabel: string;
  candidateExpenses: Expense[];
  onBack: () => void;
  /** When set (from a notification deep-link), preselect this line item and open its comments. */
  openLineItemId?: string | null;
  /** Full admins only — lets fixing OCR mistakes on a line item's date/description/amount. */
  isAdmin: boolean;
}

const REASON_LABEL_KEYS: Record<string, string> = {
  exactAmount: 'labs.cc.reasonExactAmount',
  closeAmount: 'labs.cc.reasonCloseAmount',
  exactDate: 'labs.cc.reasonExactDate',
  closeDate: 'labs.cc.reasonCloseDate',
  vendorMatch: 'labs.cc.reasonVendorMatch',
};

export function StatementReconcile({ statementId, cardLabel, candidateExpenses, onBack, openLineItemId, isAdmin }: StatementReconcileProps) {
  const { t, locale } = useT();
  const [lineItems, setLineItems] = useState<StatementLineItem[]>([]);
  const [claimedElsewhere, setClaimedElsewhere] = useState<Set<string>>(new Set());
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map());
  const [commentsFor, setCommentsFor] = useState<StatementLineItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [autoMatchPreview, setAutoMatchPreview] = useState<{ item: StatementLineItem; candidate: MatchCandidate }[] | null>(null);
  const [autoMatching, setAutoMatching] = useState(false);
  // Manual "browse all receipts" picker state, reset whenever the selected
  // line item changes (see effect below).
  const [browseSearch, setBrowseSearch] = useState('');
  const [browseExpanded, setBrowseExpanded] = useState(false);
  // Admin-only inline edit of a line item's raw OCR'd fields (date/description/
  // amount) — fixes misreads without needing to delete and re-upload.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ line_date: '', description: '', amount: '' });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  const loadCommentCounts = useCallback(async (ids: string[]) => {
    if (ids.length === 0) { setCommentCounts(new Map()); return; }
    const { data } = await supabase
      .from('statement_line_item_comments')
      .select('line_item_id')
      .in('line_item_id', ids);
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const id = row.line_item_id as string;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    setCommentCounts(counts);
  }, []);

  const loadLineItems = useCallback(async () => {
    setLoading(true);
    const [{ data: items }, { data: allMatched }] = await Promise.all([
      supabase.from('statement_line_items').select('*').eq('statement_id', statementId).order('line_date'),
      supabase.from('statement_line_items').select('statement_id, matched_expense_id').not('matched_expense_id', 'is', null),
    ]);

    const lis = (items ?? []) as StatementLineItem[];
    setLineItems(lis);
    setClaimedElsewhere(
      new Set(
        (allMatched ?? [])
          .filter((r) => r.statement_id !== statementId)
          .map((r) => r.matched_expense_id as string)
      )
    );
    void loadCommentCounts(lis.map((li) => li.id));
    setLoading(false);
  }, [statementId, loadCommentCounts]);

  useEffect(() => {
    loadLineItems();
  }, [loadLineItems]);

  // Deep-link from a comment notification: once line items load, preselect the
  // target and open its comments thread.
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  useEffect(() => {
    if (deepLinkHandled || !openLineItemId || lineItems.length === 0) return;
    const target = lineItems.find((li) => li.id === openLineItemId);
    if (target) {
      setSelectedId(target.id);
      setCommentsFor(target);
      setDeepLinkHandled(true);
    }
  }, [openLineItemId, lineItems, deepLinkHandled]);

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

  // Strict, in-bounds suggestions (score-ordered, capped) — these keep the
  // reason chips and feed bulk auto-match.
  const suggestions = useMemo(
    () => (selectedItem ? candidatesFor(selectedItem).slice(0, MAX_SUGGESTIONS) : []),
    [selectedItem, candidatesFor]
  );

  // The full "universe" of receipts the user may match by hand — every
  // available expense sorted by closeness with NO exclusion, minus the ones
  // already shown as suggestions, then filtered by the search box.
  const browseList = useMemo(() => {
    if (!selectedItem) return [];
    const suggestedIds = new Set(suggestions.map((c) => c.expense.id));
    const pool = candidateExpenses.filter((e) => !claimedElsewhere.has(e.id) && !suggestedIds.has(e.id));
    const q = browseSearch.trim().toLowerCase();
    const filtered = q
      ? pool.filter((e) =>
          (e.vendor ?? '').toLowerCase().includes(q) || (e.household_name ?? '').toLowerCase().includes(q)
        )
      : pool;
    return rankAllForBrowse(selectedItem, filtered);
  }, [selectedItem, suggestions, candidateExpenses, claimedElsewhere, browseSearch]);

  // Reset the picker each time a different line item is selected.
  useEffect(() => {
    setBrowseSearch('');
    setBrowseExpanded(false);
  }, [selectedId]);

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

  const startEditItem = (item: StatementLineItem) => {
    setEditError('');
    setEditingId(item.id);
    setEditDraft({ line_date: item.line_date, description: item.description, amount: String(item.amount) });
  };

  const cancelEditItem = () => {
    setEditingId(null);
    setEditError('');
  };

  const saveEditItem = async () => {
    if (!editingId) return;
    const description = editDraft.description.trim();
    const amount = parseFloat(editDraft.amount);
    if (!description) {
      setEditError(t('labs.cc.edit.descriptionRequired'));
      return;
    }
    if (!editDraft.line_date || Number.isNaN(amount) || amount < 0) {
      setEditError(t('labs.cc.edit.invalidAmount'));
      return;
    }
    setSavingEdit(true);
    setEditError('');
    const { error: rpcError } = await supabase.rpc('admin_update_statement_line_item', {
      p_line_item_id: editingId,
      p_line_date: editDraft.line_date,
      p_description: description,
      p_amount: amount,
    });
    setSavingEdit(false);
    if (rpcError) {
      setEditError(t('labs.cc.edit.error'));
      return;
    }
    setEditingId(null);
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
            const isEditing = editingId === item.id;

            if (isEditing) {
              return (
                <div key={item.id} className="w-full text-left p-3 rounded-xl border border-violet-400 bg-violet-50">
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={editDraft.line_date}
                      onChange={(e) => setEditDraft((d) => ({ ...d, line_date: e.target.value }))}
                      disabled={savingEdit}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                    />
                    <input
                      type="text"
                      value={editDraft.description}
                      onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                      placeholder={t('labs.cc.edit.descriptionPlaceholder')}
                      autoFocus
                      disabled={savingEdit}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editDraft.amount}
                      onChange={(e) => setEditDraft((d) => ({ ...d, amount: e.target.value }))}
                      placeholder={t('labs.cc.edit.amountPlaceholder')}
                      disabled={savingEdit}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                    />
                  </div>
                  {editError && <p className="text-xs text-red-600 mt-2">{editError}</p>}
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={saveEditItem}
                      disabled={savingEdit}
                      className="flex-1 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      {t('common.save')}
                    </button>
                    <button
                      onClick={cancelEditItem}
                      disabled={savingEdit}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                // Not `disabled` when matched: a disabled button can swallow
                // clicks on its child controls (the comment + undo spans). We
                // just make the card body itself non-selecting instead.
                onClick={() => { if (!isMatched) setSelectedId(isSelected ? null : item.id); }}
                aria-disabled={isMatched}
                className={`w-full text-left p-3 rounded-xl border transition-all ${
                  isSelected ? 'border-violet-400 bg-violet-50' : 'border-slate-200 bg-white'
                } ${isMatched ? 'opacity-70' : 'hover:border-violet-300 cursor-pointer'}`}
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
                {/* Comment / ask + edit — work on matched (disabled) cards too
                    via role=button spans, same pattern as Undo. */}
                <div className="mt-2 flex items-center justify-between">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setCommentsFor(item); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setCommentsFor(item); } }}
                    className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5 transition-colors ${
                      (commentCounts.get(item.id) ?? 0) > 0
                        ? 'text-violet-700 bg-violet-100 hover:bg-violet-200'
                        : 'text-slate-400 hover:text-violet-700 hover:bg-violet-50'
                    }`}
                  >
                    <MessageCircle className="w-3 h-3" />
                    {(commentCounts.get(item.id) ?? 0) > 0 ? commentCounts.get(item.id) : t('labs.cc.comments.add')}
                  </span>
                  {isAdmin && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); startEditItem(item); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); startEditItem(item); } }}
                      title={t('labs.cc.edit.tooltip')}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-violet-700 hover:bg-violet-50 rounded-full px-2 py-0.5 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                      {t('labs.cc.edit.tooltip')}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Right pane: suggestions + a searchable universe of all receipts */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('labs.cc.candidatesHeading')}</h3>
          {!selectedItem ? (
            <p className="text-sm text-slate-500 py-6 text-center">{t('labs.cc.selectLineItemHint')}</p>
          ) : (
            <>
              {/* Persistent search — typing auto-reveals the full list. */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={browseSearch}
                  onChange={(e) => setBrowseSearch(e.target.value)}
                  placeholder={t('labs.cc.searchReceipts')}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                />
              </div>

              {/* Suggested: strict in-bounds matches, with reason chips. */}
              {suggestions.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('labs.cc.suggestedHeading')}</h4>
                  {suggestions.map((c) => renderCandidateRow(c.expense, c.reasons))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 py-2">{t('labs.cc.noCloseMatchesBrowse')}</p>
              )}

              {/* All receipts: the full universe, no score exclusion. Collapsed
                  by default when there are suggestions; auto-open on search or
                  when there are no suggestions to fall back on. */}
              {(() => {
                const showBrowse = browseExpanded || browseSearch.trim() !== '' || suggestions.length === 0;
                return (
                  <div className="space-y-2">
                    {suggestions.length > 0 && (
                      <button
                        onClick={() => setBrowseExpanded((v) => !v)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-slate-500 hover:text-violet-700 font-medium transition-colors"
                      >
                        {showBrowse ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        {t('labs.cc.browseAllReceipts', { count: String(browseList.length) })}
                      </button>
                    )}
                    {showBrowse && (
                      <>
                        {suggestions.length === 0 && (
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('labs.cc.allReceiptsHeading')}</h4>
                        )}
                        {browseList.length === 0 ? (
                          <p className="text-sm text-slate-500 py-2 text-center">{t('labs.cc.noReceiptsFound')}</p>
                        ) : (
                          browseList.map((e) => renderCandidateRow(e))
                        )}
                      </>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </div>
      </div>

      {commentsFor && (
        <Suspense fallback={null}>
          <LineItemCommentsModal
            lineItemId={commentsFor.id}
            description={commentsFor.description}
            amount={commentsFor.amount}
            lineDate={commentsFor.line_date}
            cardLabel={cardLabel}
            onClose={() => setCommentsFor(null)}
            onPosted={() => loadCommentCounts(lineItems.map((li) => li.id))}
          />
        </Suspense>
      )}
    </div>
  );

  // Renders one selectable receipt row. `reasons` present → Suggested section
  // (shows the violet reason chips); absent → the plain browse universe.
  function renderCandidateRow(expense: Expense, reasons?: string[]) {
    if (!selectedItem) return null;
    return (
      <div key={expense.id} className="p-3 rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{expense.vendor || t('labs.cc.unknownVendor')}</p>
            <p className="text-xs text-slate-500">{formatDate(expense.expense_date)} · {formatAmount(expense.total)}</p>
          </div>
          <span className="shrink-0 text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            {expense.household_name}
          </span>
        </div>
        {reasons && reasons.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {reasons.map((r) => (
              <span key={r} className="text-[10px] font-medium text-violet-700 bg-violet-100 px-1.5 py-0.5 rounded">
                {t(REASON_LABEL_KEYS[r] ?? r)}
              </span>
            ))}
          </div>
        )}
        <button
          onClick={() => confirmMatch(selectedItem.id, expense.id)}
          disabled={busyId === selectedItem.id}
          className="mt-2 w-full py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
        >
          {busyId === selectedItem.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          {t('labs.cc.confirmMatch')}
        </button>
      </div>
    );
  }
}
