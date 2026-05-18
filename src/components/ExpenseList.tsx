import { Suspense, lazy, useState, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, ShoppingBag, Trash2, Edit2, Home, Search, SlidersHorizontal, X, User as UserIcon, Plus, Mail, ArrowUpDown } from 'lucide-react';
import type { Expense, Household } from '../types/expense';
import { useT } from '../hooks/useT';
import { useAuth } from '../contexts/AuthContext';
import { parseExpenseDate } from '../lib/dateUtils';

const EditExpense = lazy(() => import('./EditExpense').then((m) => ({ default: m.EditExpense })));

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' | 'vendor' | 'category';

interface ExpenseListProps {
  expenses: Expense[];
  households: Household[];
  loading: boolean;
  onReload: () => void;
  /** When true, only shows expenses the current user submitted. Used by contractors. */
  ownSubmissionsOnly?: boolean;
  /** When true, hides the filter bar entirely (contractor minimal view). */
  hideFilters?: boolean;
  /** When true, drops the internal h2 — caller is providing a section
   *  header (e.g. CollapsibleSection on the dashboard). */
  hideHeader?: boolean;
  /** Optional CTA — when set, the empty state shows a primary "Add transaction"
   *  button that calls this. Without it, the empty state stays static. */
  onAdd?: () => void;
}

export function ExpenseList({ expenses, households, loading, onReload, ownSubmissionsOnly = false, hideFilters = false, hideHeader = false, onAdd }: ExpenseListProps) {
  const { t, locale } = useT();
  const { user } = useAuth();
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

  // Search & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [householdFilter, setHouseholdFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('date_desc');

  // Two-tap delete: first tap arms the row for ~3s, second tap commits.
  // Replaces window.confirm() so the dialog matches the rest of the UI.
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const formatDate = (dateString: string) =>
    parseExpenseDate(dateString).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);

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
  }, [expenses, searchQuery, householdFilter, categoryFilter, dateFrom, dateTo, amountMin, amountMax, ownSubmissionsOnly, user?.id, sortKey]);

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
  const renderHeaderChrome = !hideHeader || (!hideFilters && filtersUseful);

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {/* Compact "Filter" chip when the list is short and the parent
            CollapsibleSection is providing the section title. */}
        {hideHeader && !hideFilters && !filtersUseful && (
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
              {hasAnyFilter && !hideFilters && (
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

          {/* Search bar + filter toggle — hidden in contractor-minimal view */}
          {!hideFilters && (
          <>
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

          {/* Expandable filter panel */}
          {showFilters && (
            <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {households.length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{t('expenses.household')}</label>
                  <select
                    value={householdFilter}
                    onChange={(e) => setHouseholdFilter(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="all">{t('expenses.all')}</option>
                    {households.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('expenses.category')}</label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="all">{t('expenses.all')}</option>
                  <option value="__uncategorized__">{t('expenses.uncategorized')}</option>
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('expenses.fromDate')}</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('expenses.toDate')}</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('expenses.minAmount')}</label>
                <input
                  type="number"
                  value={amountMin}
                  onChange={(e) => setAmountMin(e.target.value)}
                  placeholder="$0"
                  min="0"
                  step="0.01"
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">{t('expenses.maxAmount')}</label>
                <input
                  type="number"
                  value={amountMax}
                  onChange={(e) => setAmountMax(e.target.value)}
                  placeholder={t('expenses.noLimit')}
                  min="0"
                  step="0.01"
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          )}
          </>
          )}
        </div>
        )}

        {/* Results info bar — only when there's actually a filter applied. */}
        {hasAnyFilter && !hideFilters && filtersUseful && (
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
                {hideFilters && !hasAnyFilter
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
            filteredExpenses.map((expense) => (
              <div key={expense.id} className="p-4 sm:p-5 hover:bg-slate-50 transition-all group">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <h3 className="text-base font-semibold text-slate-900 truncate min-w-0 flex-1">
                    {expense.vendor || t('expenses.unnamed')}
                  </h3>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-base font-bold text-slate-900 tabular-nums">
                      {formatAmount(expense.total, expense.currency)}
                    </p>
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
    </>
  );
}
