import { useEffect, useMemo, useState } from 'react';
import { X, Search, Check, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import type { Expense } from '../../types/expense';
import { scoreCandidate, type StatementLineItem } from '../../lib/statementMatching';
import { parseExpenseDate } from '../../lib/dateUtils';

interface UnmatchedLineItem extends StatementLineItem {
  card_label: string;
}

interface MatchToStatementModalProps {
  expense: Expense;
  onClose: () => void;
  onMatched: () => void;
}

/**
 * Reverse entry point: starting from an expense the user already has,
 * find and claim the card-statement line item it corresponds to. Uses the
 * same scoring module as the forward Reconcile screen, just applied
 * one-expense-against-many-line-items instead of the other way around.
 */
export function MatchToStatementModal({ expense, onClose, onMatched }: MatchToStatementModalProps) {
  const { t, locale } = useT();
  useEscapeClose(onClose);
  const [lineItems, setLineItems] = useState<UnmatchedLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase
      .from('statement_line_items')
      .select('id, statement_id, line_date, description, amount, matched_expense_id, credit_card_statements(card_label)')
      .is('matched_expense_id', null)
      .order('line_date', { ascending: false })
      .then(({ data }) => {
        setLineItems(
          (data ?? []).map((row) => ({
            id: row.id,
            line_date: row.line_date,
            description: row.description,
            amount: row.amount,
            matched_expense_id: row.matched_expense_id,
            card_label: (row.credit_card_statements as unknown as { card_label: string } | null)?.card_label ?? '',
          }))
        );
        setLoading(false);
      });
  }, []);

  const ranked = useMemo(() => {
    return lineItems
      .map((li) => ({ li, candidate: scoreCandidate(li, expense) }))
      .sort((a, b) => (b.candidate?.score ?? -1) - (a.candidate?.score ?? -1));
  }, [lineItems, expense]);

  const filtered = ranked.filter(({ li }) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return li.description.toLowerCase().includes(q) || li.card_label.toLowerCase().includes(q);
  });

  const suggested = filtered.filter(({ candidate }) => candidate !== null).slice(0, 3);
  const suggestedIds = new Set(suggested.map(({ li }) => li.id));
  const rest = filtered.filter(({ li }) => !suggestedIds.has(li.id));

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(amount);
  const formatDate = (dateString: string) =>
    parseExpenseDate(dateString).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });

  const confirmMatch = async (lineItemId: string) => {
    setBusyId(lineItemId);
    setError('');
    const { error: rpcError } = await supabase.rpc('match_statement_line_item', {
      p_line_item_id: lineItemId,
      p_expense_id: expense.id,
    });
    setBusyId(null);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onMatched();
    onClose();
  };

  const renderRow = ({ li }: { li: UnmatchedLineItem }) => (
    <div key={li.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-white">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900 truncate">{li.description}</p>
        <p className="text-xs text-slate-500">
          {formatDate(li.line_date)} · {formatAmount(li.amount)} · {li.card_label}
        </p>
      </div>
      <button
        onClick={() => confirmMatch(li.id)}
        disabled={busyId === li.id}
        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg transition-all disabled:opacity-50"
      >
        {busyId === li.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        {t('labs.cc.confirmMatch')}
      </button>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-start sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-none sm:rounded-2xl w-full max-w-lg shadow-xl min-h-screen sm:min-h-0 sm:max-h-[85vh] sm:my-4 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 rounded-t-2xl z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t('labs.cc.matchToStatement')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{expense.vendor} · {formatAmount(expense.total)}</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('labs.cc.searchLineItems')}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          {loading ? (
            <div className="h-32 bg-slate-50 rounded-xl animate-pulse" />
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">{t('labs.cc.noLineItems')}</p>
          ) : (
            <div className="space-y-3">
              {suggested.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('labs.cc.suggestedHeading')}</h3>
                  {suggested.map(renderRow)}
                </div>
              )}
              {rest.length > 0 && (
                <div className="space-y-2">
                  {suggested.length > 0 && (
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wide">{t('labs.cc.allLineItemsHeading')}</h3>
                  )}
                  {rest.map(renderRow)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
