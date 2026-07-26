import { X } from 'lucide-react';
import { useT } from '../hooks/useT';
import { useEscapeClose } from '../hooks/useEscapeClose';
import type { Household } from '../types/expense';

export type MatchedFilter = 'all' | 'matched' | 'unmatched';

interface ExpenseFilterSheetProps {
  households: Household[];
  householdFilter: string;
  onHouseholdChange: (v: string) => void;
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (v: string) => void;
  /** Only credit-card-reconciliation Labs households ever have matched expenses. */
  showMatchedFilter: boolean;
  matchedFilter: MatchedFilter;
  onMatchedChange: (v: MatchedFilter) => void;
  dateFrom: string;
  onDateFromChange: (v: string) => void;
  dateTo: string;
  onDateToChange: (v: string) => void;
  amountMin: string;
  onAmountMinChange: (v: string) => void;
  amountMax: string;
  onAmountMaxChange: (v: string) => void;
  resultCount: number;
  onClear: () => void;
  onClose: () => void;
}

const fieldLabel = 'block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5';
const fieldInput = 'w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900';

/**
 * Full filter panel — bottom sheet on mobile, centered modal on desktop
 * (same convention as StatementHouseholdsModal). Quick one-tap chips live
 * inline in ExpenseList itself; this sheet holds the long-tail fields that
 * don't fit as chips (date/amount ranges, category).
 */
export function ExpenseFilterSheet({
  households,
  householdFilter,
  onHouseholdChange,
  categories,
  categoryFilter,
  onCategoryChange,
  showMatchedFilter,
  matchedFilter,
  onMatchedChange,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
  amountMin,
  onAmountMinChange,
  amountMax,
  onAmountMaxChange,
  resultCount,
  onClear,
  onClose,
}: ExpenseFilterSheetProps) {
  const { t } = useT();
  useEscapeClose(onClose);

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md shadow-xl flex flex-col max-h-[85vh]">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <h3 className="text-base font-semibold text-slate-900">{t('expenses.filters')}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg transition-all" aria-label={t('common.close')}>
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {households.length > 1 && (
            <div>
              <label className={fieldLabel}>{t('expenses.household')}</label>
              <select value={householdFilter} onChange={(e) => onHouseholdChange(e.target.value)} className={fieldInput}>
                <option value="all">{t('expenses.all')}</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={fieldLabel}>{t('expenses.category')}</label>
            <select value={categoryFilter} onChange={(e) => onCategoryChange(e.target.value)} className={fieldInput}>
              <option value="all">{t('expenses.all')}</option>
              <option value="__uncategorized__">{t('expenses.uncategorized')}</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {showMatchedFilter && (
            <div>
              <label className={fieldLabel}>{t('expenses.matchStatus')}</label>
              <select value={matchedFilter} onChange={(e) => onMatchedChange(e.target.value as MatchedFilter)} className={fieldInput}>
                <option value="all">{t('expenses.all')}</option>
                <option value="matched">{t('labs.cc.matchedBadge')}</option>
                <option value="unmatched">{t('expenses.unmatched')}</option>
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>{t('expenses.fromDate')}</label>
              <input type="date" value={dateFrom} onChange={(e) => onDateFromChange(e.target.value)} className={fieldInput} />
            </div>
            <div>
              <label className={fieldLabel}>{t('expenses.toDate')}</label>
              <input type="date" value={dateTo} onChange={(e) => onDateToChange(e.target.value)} className={fieldInput} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>{t('expenses.minAmount')}</label>
              <input
                type="number"
                value={amountMin}
                onChange={(e) => onAmountMinChange(e.target.value)}
                placeholder="$0"
                min="0"
                step="0.01"
                className={fieldInput}
              />
            </div>
            <div>
              <label className={fieldLabel}>{t('expenses.maxAmount')}</label>
              <input
                type="number"
                value={amountMax}
                onChange={(e) => onAmountMaxChange(e.target.value)}
                placeholder={t('expenses.noLimit')}
                min="0"
                step="0.01"
                className={fieldInput}
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
          <button
            onClick={onClear}
            className="px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg transition-all hover:bg-slate-50"
          >
            {t('expenses.clearAll')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-all"
          >
            {t('expenses.showResults', { count: resultCount })}
          </button>
        </div>
      </div>
    </div>
  );
}
