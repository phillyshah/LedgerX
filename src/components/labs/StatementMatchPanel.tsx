import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { scoreCandidate, type StatementLineItem, type MatchCandidate } from '../../lib/statementMatching';
import { parseExpenseDate } from '../../lib/dateUtils';
import type { Expense } from '../../types/expense';

interface OpenLineItem extends StatementLineItem {
  statement_id: string;
  card_label: string;
  currency: string;
  household_ids: string[];
}

interface StatementMatchPanelProps {
  householdId: string;
  vendor: string;
  /** Raw form value — may be an in-progress/invalid number string. */
  total: string;
  expenseDate: string;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/**
 * Live "possible card charge" suggestions while reviewing a forwarded
 * receipt in Add Transaction — before the expense exists. Scoring is
 * `scoreCandidate` from statementMatching.ts, unmodified: it only ever reads
 * total/expense_date/vendor off a plain object, so a draft built from the
 * form's own field values scores exactly like a real saved expense would.
 *
 * This is a selector only — there's no expense id yet to confirm a match
 * against. The caller (AddExpense) is responsible for calling
 * match_statement_line_item with the real id once the save actually
 * succeeds, using whichever id `onSelect` last reported.
 */
export function StatementMatchPanel({
  householdId,
  vendor,
  total,
  expenseDate,
  selectedId,
  onSelect,
}: StatementMatchPanelProps) {
  const { t, locale } = useT();
  const [openItems, setOpenItems] = useState<OpenLineItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetched once — this is a plain read with no household argument, and
  // rescoring against live form edits is cheap client-side work that needs
  // no refetch. is_labs_eligible() gates the RPC itself, so an ineligible
  // caller simply gets an empty list back, same as every other consumer.
  useEffect(() => {
    let cancelled = false;
    supabase.rpc('list_open_statement_line_items' as never).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error('[statement-match-panel] load failed', error);
        setOpenItems([]);
      } else {
        setOpenItems(
          ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
            id: r.id as string,
            statement_id: r.statement_id as string,
            card_label: r.card_label as string,
            line_date: r.line_date as string,
            description: r.description as string,
            amount: Number(r.amount),
            currency: (r.currency as string) ?? 'USD',
            matched_expense_id: null,
            household_ids: (r.household_ids as string[]) ?? [],
          })),
        );
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const scoped = useMemo(
    () => openItems.filter((li) => li.household_ids.length === 0 || li.household_ids.includes(householdId)),
    [openItems, householdId],
  );

  // A throwaway Expense-shaped draft, exactly the pattern
  // inboxCandidateToExpense() already uses to score unsaved data through the
  // same scorer real saved expenses go through.
  const draft = useMemo<Expense>(() => ({
    id: 'draft',
    expense_date: expenseDate,
    vendor: vendor || null,
    total: parseFloat(total) || 0,
    currency: 'USD',
    category: null,
    notes: null,
    transcript: null,
    household_id: householdId,
    image_path: null,
    image_mime: null,
    image_width: null,
    image_height: null,
    created_by: '',
    paid_at: null,
  }), [expenseDate, vendor, total, householdId]);

  const ranked = useMemo(() => {
    const amount = parseFloat(total);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    return scoped
      .map((li) => ({ li, candidate: scoreCandidate(li, draft) }))
      .filter((r): r is { li: OpenLineItem; candidate: MatchCandidate } => r.candidate !== null)
      .sort((a, b) => b.candidate.score - a.candidate.score)
      .slice(0, 3);
  }, [scoped, draft, total]);

  const formatAmount = (amount: number, currency = 'USD') =>
    new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  const formatDate = (dateString: string) =>
    parseExpenseDate(dateString).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

  if (loading || ranked.length === 0) return null;

  return (
    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-emerald-800">
        <CreditCard className="w-4 h-4" />
        {t('addExpense.statementMatchTitle')}
      </div>
      <div className="space-y-1.5">
        {ranked.map(({ li, candidate }) => {
          const isSelected = selectedId === li.id;
          return (
            <button
              key={li.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : li.id)}
              className={`w-full flex items-center justify-between gap-3 p-2.5 rounded-lg border text-left transition-all ${
                isSelected
                  ? 'border-emerald-500 bg-white ring-1 ring-emerald-500'
                  : 'border-emerald-200 bg-white hover:border-emerald-300'
              }`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{li.description}</p>
                <p className="text-xs text-slate-500">
                  {formatDate(li.line_date)} · {formatAmount(li.amount, li.currency)} · {li.card_label}
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-xs font-semibold text-emerald-700">
                  {Math.round(candidate.score * 100)}%
                </span>
                <span
                  className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    isSelected ? 'bg-emerald-600 border-emerald-600' : 'border-slate-300'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" />}
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-emerald-700">
        {t('addExpense.statementMatchHint')}
      </p>
    </div>
  );
}
