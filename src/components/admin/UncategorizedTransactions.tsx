import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertCircle, Home, Tag, Check, X } from 'lucide-react';

interface UncategorizedExpense {
  id: string;
  household_id: string | null;
  household_name: string | null;
  created_by: string;
  creator_email: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  image_path: string | null;
  image_mime: string | null;
  image_width: number | null;
  image_height: number | null;
  created_at: string;
  updated_at: string;
  is_orphaned_household: boolean;
  is_invalid_category: boolean;
}

interface Household {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  household_id: string | null;
}

export function UncategorizedTransactions() {
  const [expenses, setExpenses] = useState<UncategorizedExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedHousehold && categories.length > 0) {
      const filtered = categories.filter(
        (c) => c.household_id === null || c.household_id === selectedHousehold
      );
      setFilteredCategories(filtered);
    }
  }, [selectedHousehold, categories]);

  const loadData = async () => {
    setLoading(true);

    const [expensesRes, householdsRes, categoriesRes] = await Promise.all([
      supabase.rpc('admin_get_uncategorized_expenses'),
      supabase.from('households').select('id, name').order('name'),
      supabase.from('categories').select('id, name, household_id').order('name'),
    ]);

    if (expensesRes.data) setExpenses(expensesRes.data);
    if (householdsRes.data) setHouseholds(householdsRes.data);
    if (categoriesRes.data) setCategories(categoriesRes.data);

    setLoading(false);
  };

  const startEdit = (expense: UncategorizedExpense) => {
    setEditingId(expense.id);
    setSelectedHousehold(expense.household_id || '');
    setSelectedCategory(expense.category || '');
    setError('');

    if (expense.household_id) {
      const filtered = categories.filter(
        (c) => c.household_id === null || c.household_id === expense.household_id
      );
      setFilteredCategories(filtered);
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setSelectedHousehold('');
    setSelectedCategory('');
    setError('');
  };

  const saveReallocation = async (expenseId: string) => {
    setSaving(true);
    setError('');

    const { error: saveError } = await supabase.rpc('admin_reallocate_expense', {
      p_expense_id: expenseId,
      p_new_household_id: selectedHousehold || null,
      p_new_category: selectedCategory || null,
    });

    if (saveError) {
      setError(saveError.message);
      setSaving(false);
    } else {
      setSaving(false);
      setEditingId(null);
      await loadData();
    }
  };

  const getImageUrl = (path: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from('receipts').getPublicUrl(path);
    return data.publicUrl;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-32 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Uncategorized Transactions</h2>
        <p className="text-slate-500 mt-1">
          Transactions with missing households or invalid categories. Re-allocate them to restore proper organization.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {expenses.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <AlertCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">All Clean!</h3>
          <p className="text-slate-500">No uncategorized transactions found. Everything is properly organized.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {expenses.map((expense) => {
            const isEditing = editingId === expense.id;
            const imageUrl = getImageUrl(expense.image_path);

            return (
              <div key={expense.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex gap-4">
                    {imageUrl && (
                      <div className="shrink-0">
                        <img
                          src={imageUrl}
                          alt="Receipt"
                          className="w-24 h-24 object-cover rounded-xl border border-slate-200"
                        />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-slate-900 text-lg">
                            {expense.vendor || 'Unknown Vendor'}
                          </h3>
                          <p className="text-sm text-slate-500 mt-0.5">
                            {new Date(expense.expense_date).toLocaleDateString()} • Created by {expense.creator_email}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-slate-900">
                            {expense.currency} {expense.total.toFixed(2)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mb-3">
                        {expense.is_orphaned_household && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-red-50 text-red-700 text-xs font-medium rounded-full border border-red-200">
                            <Home className="w-3 h-3" />
                            No Household
                          </span>
                        )}
                        {expense.is_invalid_category && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full border border-amber-200">
                            <Tag className="w-3 h-3" />
                            Invalid Category: {expense.category}
                          </span>
                        )}
                        {!expense.is_orphaned_household && expense.household_name && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-full">
                            <Home className="w-3 h-3" />
                            {expense.household_name}
                          </span>
                        )}
                      </div>

                      {expense.notes && (
                        <p className="text-sm text-slate-600 mb-3 line-clamp-2">{expense.notes}</p>
                      )}

                      {isEditing ? (
                        <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                Household
                              </label>
                              <select
                                value={selectedHousehold}
                                onChange={(e) => {
                                  setSelectedHousehold(e.target.value);
                                  setSelectedCategory('');
                                }}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="">Select Household</option>
                                {households.map((h) => (
                                  <option key={h.id} value={h.id}>
                                    {h.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                                Category
                              </label>
                              <select
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                              >
                                <option value="">Select Category</option>
                                {filteredCategories.map((c) => (
                                  <option key={c.id} value={c.name}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveReallocation(expense.id)}
                              disabled={saving || (!selectedHousehold && !selectedCategory)}
                              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Check className="w-4 h-4" />
                              {saving ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={saving}
                              className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg transition-all"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEdit(expense)}
                          className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-all"
                        >
                          Re-allocate
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
