import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, ShoppingBag, Trash2, Edit2, Home, Filter } from 'lucide-react';
import { EditExpense } from './EditExpense';

interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  transcript: string | null;
  household_id: string;
  household_name?: string;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
}

interface Household {
  id: string;
  name: string;
}

interface ExpenseListProps {
  refreshKey: number;
}

export function ExpenseList({ refreshKey }: ExpenseListProps) {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [householdFilter, setHouseholdFilter] = useState<string>('all');

  useEffect(() => {
    loadExpenses();
  }, [refreshKey, user]);

  const loadExpenses = async () => {
    if (!user) return;
    setLoading(true);

    const { data: memberData } = await supabase
      .from('household_members')
      .select('household_id, households(id, name)')
      .eq('user_id', user.id);

    const hh = (memberData || [])
      .map((item) => item.households)
      .filter(Boolean) as unknown as Household[];
    setHouseholds(hh);

    const householdMap = new Map(hh.map((h) => [h.id, h.name]));
    const householdIds = hh.map((h) => h.id);

    if (householdIds.length === 0) {
      setExpenses([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('id, expense_date, vendor, total, currency, category, notes, transcript, household_id, image_path, image_mime, image_width, image_height')
      .in('household_id', householdIds)
      .order('expense_date', { ascending: false });

    if (!error && data) {
      setExpenses(
        data.map((e) => ({
          ...e,
          household_name: householdMap.get(e.household_id) || 'Unknown',
        }))
      );
    }
    setLoading(false);
  };

  const deleteExpense = async (id: string) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (!error) {
      setExpenses(expenses.filter((e) => e.id !== id));
    }
  };

  const handleExpenseUpdated = () => {
    setEditingExpense(null);
    loadExpenses();
  };

  const formatDate = (dateString: string) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number, currency: string) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(amount);

  const filteredExpenses =
    householdFilter === 'all'
      ? expenses
      : expenses.filter((e) => e.household_id === householdFilter);

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
      <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No transactions yet</h3>
        <p className="text-slate-500">
          Add your first transaction to get started tracking your household spending.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Transactions</h2>
          {households.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={householdFilter}
                onChange={(e) => setHouseholdFilter(e.target.value)}
                className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                <option value="all">All Households</option>
                {households.map((h) => (
                  <option key={h.id} value={h.id}>{h.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {filteredExpenses.map((expense) => (
            <div key={expense.id} className="p-4 sm:p-5 hover:bg-slate-50 transition-all group">
              <div className="flex items-center justify-between gap-3 mb-2">
                <h3 className="text-base font-semibold text-slate-900 truncate min-w-0 flex-1">
                  {expense.vendor || 'Unnamed'}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="text-base font-bold text-slate-900 tabular-nums">
                    {formatAmount(expense.total, expense.currency)}
                  </p>
                  <button
                    onClick={() => setEditingExpense(expense)}
                    className="p-1.5 hover:bg-slate-100 rounded-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4 text-slate-500" />
                  </button>
                  <button
                    onClick={() => deleteExpense(expense.id)}
                    className="p-1.5 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100 sm:opacity-0 max-sm:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500">
                {expense.category && (
                  <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
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
                {expense.notes && (
                  <p className="line-clamp-1 hidden sm:block text-slate-400">{expense.notes}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {editingExpense && (
        <EditExpense
          expense={editingExpense}
          onClose={() => setEditingExpense(null)}
          onSuccess={handleExpenseUpdated}
        />
      )}
    </>
  );
}
