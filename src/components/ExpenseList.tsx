import { Suspense, lazy, useState, useMemo, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ShoppingBag, Trash2, Edit2, Home, Search, SlidersHorizontal, X, User as UserIcon, Plus, Mail, ArrowUpDown, CreditCard, ChevronDown } from 'lucide-react';
import type { Expense, Household } from '../types/expense';
import { useT } from '../hooks/useT';
import { useAuth } from '../contexts/AuthContext';
import { parseExpenseDate } from '../lib/dateUtils';
import { useLabsAccess } from '../hooks/useLabsAccess';
import { useMatchedCardLabels } from '../hooks/useMatchedCardLabels';
import type { MatchedFilter } from './ExpenseFilterSheet';

const EditExpense = lazy(() => import('./EditExpense').then((m) => ({ default: m.EditExpense })));
const MatchToStatementModal = lazy(() => import('./labs/MatchToStatementModal').then((m) => ({ default: m.MatchToStatementModal })));
const ExpenseFilterSheet = lazy(() => import('./ExpenseFilterSheet').then((m) => ({ default: m.ExpenseFilterSheet })));

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'vendor' | 'category';

// How many rows render before the user has to tap "Load more" — keeps long
// lists (and mobile scroll performance) in check without full virtualization.
const PAGE_SIZE = 20;

interface ExpenseListProps {
  expenses: Expense[];
  households: Household[];
  loading: boolean;
  onReload: () => void;
  /** When true, only shows expenses the current user submitted. Used by contractors. */
  ownSubmissionsOnly?: boolean;
  /** When true, drops the internal h2 — caller is providing a section
   *  header (e.g. CollapsibleSection on the dashboard). */
  hideHeader?: boolean;
  /** Optional CTA — when set, the empty state shows a primary "Add transaction"
   *  button that calls this. Without it, the empty state stays static. */
  onAdd?: () => void;
}

export function ExpenseList({ expenses, households, loading, onReload, ownSubmissionsOnly = false, hideHeader = false, onAdd }: ExpenseListProps) {
  const { t, locale } = useT();
  const { user } = useAuth();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [matchingExpense, setMatchingExpense] = useState<Expense | null>(null);
  const { hasFlag } = useLabsAccess();
  const labsEnabled = hasFlag('labs_cc_reconciliation');

  // Which of the currently-loaded expenses are matched to a card statement
  // line item, and which card — see useMatchedCardLabels for why this is
  // its own hook rather than folded into useExpenses.
  const matchedCardLabels = useMatchedCardLabels(
    useMemo(() => expenses.map((e) => e.id), [expenses]),
    labsEnabled
  );

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [householdFilter, setHouseholdFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [matchedFilter, setMatchedFilter] = useState<MatchedFilter>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');

  // How many of the filtered/sorted rows are currently rendered ("Load more"
  // pagination). Resets to the first page whenever a filter/sort/search
  // input actually changes — but NOT when `expenses` itself changes (a
  // background reload/poll shouldn't yank a scrolled-down user back to page 1).
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, householdFilter, categoryFilter, matchedFilter, dateFrom, dateTo, amountMin, amountMax, sortKey]);

  // Two-tap delete: first tap arms the row for ~3s, second tap commits.
  // Replaces window.confirm() so the dialog matches the rest of the UI.
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fade the quick-chip row's trailing edge, but only while it actually
  // overflows — a static fade would permanently clip the last chip for
  // anyone whose chips happen to fit on one line (e.g. just 2 households).
  //
  // The row element is held in state rather than a ref so this effect re-runs
  // exactly when the node mounts/unmounts (a ref wouldn't notify us), not on
  // every render. Chip *content* can change without the box resizing, so the
  // chip-count inputs are deps too; ResizeObserver covers the rest.
  const [chipsEl, setChipsEl] = useState<HTMLDivElement | null>(null);
  const [chipsOverflowing, setChipsOverflowing] = useState(false);
  useEffect(() => {
    if (!chipsEl) {
      setChipsOverflowing(false);
      return;
    }
    const check = () => setChipsOverflowing(chipsEl.scrollWidth > chipsEl.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(chipsEl);
    return () => ro.disconnect();
  }, [chipsEl, households.length, labsEnabled]);

  const deleteExpense = async (id: string) => {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id);
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      armTimerRef.current = setTimeout(() => setArmedDeleteId(null), 3000);
      return;
    }
    if (armTimerRef.current) clearTimeout(armTimerRef.current);
    setArmedDeleteId(null);
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) {
      onReload();
    }
  };

  const handleExpenseUpdated = () => {
    setEditingExpense(null);
    onReload();
  };

  // Intl formatter construction is expensive relative to .format(), and both
  // of these run once per rendered row. Building them per-call meant ~2x
  // PAGE_SIZE constructions on every keystroke in the search box; hoisting
  // them out makes typing cost only the formatting itself. Currency varies
  // per row, so amounts are cached in a per-locale Map keyed by currency
  // (realistically 1-2 entries) rather than a single formatter.
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }),
    [locale]
  );
  // `locale` looks unused to the linter because the initializer doesn't read
  // it — but the formatters cached inside are locale-bound, so switching
  // language must discard them. The dep is the cache-invalidation key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const amountFormatters = useMemo(() => new Map<string, Intl.NumberFormat>(), [locale]);

  const formatDate = (dateString: string) => dateFormatter.format(parseExpenseDate(dateString));

  const formatAmount = (amount: number, currency: string) => {
    const code = currency || 'USD';
    let formatter = amountFormatters.get(code);
    if (!formatter) {
      formatter = new Intl.NumberFormat(locale, { style: 'currency', currency: code });
      amountFormatters.set(code, formatter);
    }
    return formatter.format(amount);
  };

  // Derive unique categories from loaded expenses
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    expenses.forEach((e) => {
      if (e.category) cats.add(e.category);
    });
    return [...cats].sort();
  }, [expenses]);

  // Count active filters (excluding search, which is always visible)
  const activeFilterCount = [
    householdFilter !== 'all',
    categoryFilter !== 'all',
    matchedFilter !== 'all',
    dateFrom !== '',
    dateTo !== '',
    amountMin !== '',
    amountMax !== '',
  ].filter(Boolean).length;

  const hasAnyFilter = activeFilterCount > 0 || searchQuery !== '';

  const clearAllFilters = () => {
    setSearchQuery('');
    setHouseholdFilter('all');
    setCategoryFilter('all');
    setMatchedFilter('all');
    setDateFrom('');
    setDateTo('');
    setAmountMin('');
    setAmountMax('');
  };

  // Apply filters and sort in a single pass — one memo, one array
  // allocation. The server already orders by expense_date DESC, so the
  // default `date_desc` branch skips re-sorting.
  const filteredExpenses = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    const minAmt = amountMin ? parseFloat(amountMin) : null;
    const maxAmt = amountMax ? parseFloat(amountMax) : null;
    const userId = user?.id;

    const filtered = expenses.filter((e) => {
      if (ownSubmissionsOnly && userId && e.created_by !== userId) return false;
      if (householdFilter !== 'all' && e.household_id !== householdFilter) return false;

      if (categoryFilter !== 'all') {
        if (categoryFilter === '__uncategorized__') {
          if (e.category) return false;
        } else if (e.category !== categoryFilter) {
          return false;
        }
      }

      if (dateFrom && e.expense_date < dateFrom) return false;
      if (dateTo && e.expense_date > dateTo) return false;

      if (minAmt !== null && e.total < minAmt) return false;
      if (maxAmt !== null && e.total > maxAmt) return false;

      if (labsEnabled && matchedFilter !== 'all') {
        const isMatched = matchedCardLabels.has(e.id);
        if (matchedFilter === 'matched' && !isMatched) return false;
        if (matchedFilter === 'unmatched' && isMatched) return false;
      }

      if (query) {
        const haystack = [e.vendor, e.category, e.notes, e.household_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      return true;
    });

    const cmpStr = (a: string | null | undefined, b: string | null | undefined) =>
      (a ?? '').localeCompare(b ?? '');
    switch (sortKey) {
      case 'date_asc':    filtered.sort((a, b) => cmpStr(a.expense_date, b.expense_date)); break;
      case 'amount_desc': filtered.sort((a, b) => b.total - a.total); break;
      case 'amount_asc':  filtered.sort((a, b) => a.total - b.total); break;
      case 'vendor':      filtered.sort((a, b) => cmpStr(a.vendor, b.vendor)); break;
      case 'category':    filtered.sort((a, b) => cmpStr(a.category, b.category)); break;
      // date_desc: server already returns rows in this order — no resort
    }
    return filtered;
  }, [expenses, searchQuery, householdFilter, categoryFilter, matchedFilter, dateFrom, dateTo, amountMin, amountMax, ownSubmissionsOnly, user?.id, sortKey, labsEnabled, matchedCardLabels]);

  const visibleExpenses = filteredExpenses.slice(0, visibleCount);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-10 sm:p-12 shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-1 ring-emerald-200/50">
          <ShoppingBag className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-1.5">{t('expenses.noneYet')}</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto">{t('expenses.getStarted')}</p>
        {onAdd && (
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={onAdd}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-xl transition-all shadow-sm font-medium active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              {t('expenses.emptyCta')}
            </button>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-slate-400">
              <Mail className="w-3.5 h-3.5" />
              {t('expenses.emptyTip')}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Filter chrome adds clutter for short lists; hide it until the user
  // either has enough transactions to need it or explicitly opens filters.
  const largeList = expenses.length > 25;
  const filtersUseful = largeList || showFilters || activeFilterCount > 0;
  const renderHeaderChrome = !hideHeader || filtersUseful;
  const showChips = households.length > 1 || labsEnabled;

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Compact "Filter" chip when the list is short and the parent
            CollapsibleSection is providing the section title. */}
        {hideHeader && !filtersUseful && (
          <div className="flex justify-end px-4 py-2 border-b border-slate-100">
            <button
              onClick={() => setShowFilters(true)}
              className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {t('expenses.filter')}
            </button>
          </div>
        )}
        {/* Full header chrome — used when caller wants its own title, OR
            when filters become useful (>25 txns, or user opened them). */}
        {renderHeaderChrome && (
        <div className={hideHeader ? 'p-3 border-b border-slate-100' : 'p-5 border-b border-slate-200 bg-slate-50'}>
          {!hideHeader && (
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {ownSubmissionsOnly ? t('dashboard.yourSubmissions') : t('expenses.heading')}
              </h2>
              {hasAnyFilter && (
                <button
                  onClick={clearAllFilters}
                  className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                >
                  <X className="w-3 h-3" />
                  {t('expenses.clearAll')}
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('expenses.searchPlaceholder')}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded"
                >
                  <X className="w-3.5 h-3.5 text-slate-400" />
                </button>
              )}
            </div>
            <label
              className="flex items-center gap-1 text-slate-500 shrink-0"
              title={t('reports.sortBy')}
            >
              <ArrowUpDown className="w-4 h-4" aria-hidden />
              <span className="sr-only">{t('reports.sortBy')}</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="text-sm bg-white border border-slate-200 rounded-lg pl-2 pr-1 py-2 focus:outline-none focus:ring-2 focus:ring-slate-900 text-slate-700"
              >
                <option value="date_desc">{t('reports.sortDateDesc')}</option>
                <option value="date_asc">{t('reports.sortDateAsc')}</option>
                <option value="amount_desc">{t('reports.sortAmountDesc')}</option>
                <option value="amount_asc">{t('reports.sortAmountAsc')}</option>
                <option value="vendor">{t('reports.sortVendor')}</option>
                <option value="category">{t('reports.sortCategory')}</option>
              </select>
            </label>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`relative p-2 border rounded-lg transition-colors shrink-0 ${
                showFilters || activeFilterCount > 0
                  ? 'bg-slate-900 border-slate-900 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
              title={t('expenses.filters')}
            >
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Quick one-tap chips — the fast path on mobile, no sheet needed.
              Tapping the active chip again clears it back to "all". The
              trailing fade hints there's more to swipe when the row overflows
              (chip count is dynamic, so a hard cutoff would look broken). */}
          {showChips && (
            <div
              ref={setChipsEl}
              className="flex items-center gap-1.5 overflow-x-auto mt-2.5 -mx-0.5 px-0.5"
              style={
                chipsOverflowing
                  ? { WebkitMaskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent)', maskImage: 'linear-gradient(to right, black calc(100% - 20px), transparent)' }
                  : undefined
              }
            >
              {households.length > 1 && households.map((h) => {
                const active = householdFilter === h.id;
                return (
                  <button
                    key={h.id}
                    onClick={() => setHouseholdFilter(active ? 'all' : h.id)}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-all ${
                      active
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {h.name}
                  </button>
                );
              })}
              {labsEnabled && (
                <>
                  <button
                    onClick={() => setMatchedFilter(matchedFilter === 'matched' ? 'all' : 'matched')}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-all ${
                      matchedFilter === 'matched'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {t('labs.cc.matchedBadge')}
                  </button>
                  <button
                    onClick={() => setMatchedFilter(matchedFilter === 'unmatched' ? 'all' : 'unmatched')}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap transition-all ${
                      matchedFilter === 'unmatched'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {t('expenses.unmatched')}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        )}

        {/* Results info bar — only when there's actually a filter applied. */}
        {hasAnyFilter && filtersUseful && (
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
            {t('expenses.showingOf', { shown: filteredExpenses.length, total: expenses.length })}
          </div>
        )}

        {/* Transaction list */}
        <div className="divide-y divide-slate-100">
          {filteredExpenses.length === 0 ? (
            <div className="p-8 text-center">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {!hasAnyFilter
                  ? (ownSubmissionsOnly ? t('expenses.noReceiptsYet') : t('expenses.noExpensesYet'))
                  : t('expenses.noMatch')}
              </p>
              {hasAnyFilter && (
                <button
                  onClick={clearAllFilters}
                  className="mt-2 text-sm text-slate-900 font-medium hover:underline"
                >
                  {t('expenses.clearFilters')}
                </button>
              )}
            </div>
          ) : (
            visibleExpenses.map((expense) => (
              <div key={expense.id} className="p-4 sm:p-5 hover:bg-slate-50 transition-all group">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-base font-semibold text-slate-900 truncate min-w-0 flex-1">
                    {expense.vendor || t('expenses.unnamed')}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-base font-bold text-slate-900 tabular-nums">
                      {formatAmount(expense.total, expense.currency)}
                    </p>
                    {labsEnabled && !matchedCardLabels.has(expense.id) && (
                      <button
                        onClick={() => setMatchingExpense(expense)}
                        className="p-1.5 hover:bg-emerald-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100"
                        title={t('labs.cc.matchToStatement')}
                      >
                        <CreditCard className="w-4 h-4 text-emerald-500" />
                      </button>
                    )}
                    <button
                      onClick={() => setEditingExpense(expense)}
                      className="p-1.5 hover:bg-slate-100 rounded-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100"
                      title={t('common.edit')}
                    >
                      <Edit2 className="w-4 h-4 text-slate-500" />
                    </button>
                    <button
                      onClick={() => deleteExpense(expense.id)}
                      className={
                        armedDeleteId === expense.id
                          ? 'inline-flex items-center gap-1 px-2 py-1.5 bg-red-500 hover:bg-red-600 rounded-lg transition-all text-xs font-semibold text-white shadow-sm'
                          : 'p-1.5 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100'
                      }
                      title={armedDeleteId === expense.id ? t('common.tapAgainToConfirm') : t('common.delete')}
                    >
                      {armedDeleteId === expense.id ? (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{t('common.tapAgainShort')}</span>
                        </>
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-500" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                  {expense.category && (
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full truncate max-w-[10rem] sm:max-w-[14rem]" title={expense.category}>
                      {expense.category}
                    </span>
                  )}
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <Calendar className="w-3.5 h-3.5" />
                    {formatDate(expense.expense_date)}
                  </span>
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <Home className="w-3.5 h-3.5" />
                    {expense.household_name}
                  </span>
                  {expense.submitter_username && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full whitespace-nowrap"
                      title={`${t('expenses.submittedBy')} ${expense.submitter_username}`}
                    >
                      <UserIcon className="w-3 h-3" />
                      @{expense.submitter_username}
                    </span>
                  )}
                  {matchedCardLabels.has(expense.id) && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full whitespace-nowrap"
                      title={t('labs.cc.matchedTooltip', { label: matchedCardLabels.get(expense.id) ?? '' })}
                    >
                      <CreditCard className="w-3 h-3" />
                      {t('labs.cc.matchedBadge')}
                    </span>
                  )}
                  {expense.paid_at && (
                    <span className="inline-flex items-center px-2 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full whitespace-nowrap">
                      {t('expenses.paidBadge')}
                    </span>
                  )}
                  {expense.notes && (
                    <p className="line-clamp-1 hidden sm:block text-slate-400">{expense.notes}</p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {filteredExpenses.length > visibleCount && (
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="w-full py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-all flex items-center justify-center gap-1.5"
            >
              <ChevronDown className="w-4 h-4" />
              {t('expenses.loadMore', { count: Math.min(PAGE_SIZE, filteredExpenses.length - visibleCount) })}
            </button>
          </div>
        )}
      </div>

      {editingExpense && (
        <Suspense fallback={null}>
          <EditExpense
            expense={editingExpense}
            onClose={() => setEditingExpense(null)}
            onSuccess={handleExpenseUpdated}
          />
        </Suspense>
      )}
      {matchingExpense && (
        <Suspense fallback={null}>
          <MatchToStatementModal
            expense={matchingExpense}
            onClose={() => setMatchingExpense(null)}
            onMatched={onReload}
          />
        </Suspense>
      )}
      {showFilters && (
        <Suspense fallback={null}>
          <ExpenseFilterSheet
            households={households}
            householdFilter={householdFilter}
            onHouseholdChange={setHouseholdFilter}
            categories={uniqueCategories}
            categoryFilter={categoryFilter}
            onCategoryChange={setCategoryFilter}
            showMatchedFilter={labsEnabled}
            matchedFilter={matchedFilter}
            onMatchedChange={setMatchedFilter}
            dateFrom={dateFrom}
            onDateFromChange={setDateFrom}
            dateTo={dateTo}
            onDateToChange={setDateTo}
            amountMin={amountMin}
            onAmountMinChange={setAmountMin}
            amountMax={amountMax}
            onAmountMaxChange={setAmountMax}
            resultCount={filteredExpenses.length}
            onClear={clearAllFilters}
            onClose={() => setShowFilters(false)}
          />
        </Suspense>
      )}
    </>
  );
}
