import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, FileText, Calendar, Home, Tag, DollarSign } from 'lucide-react';

interface Household {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  expense_date: string;
  vendor: string | null;
  total: number;
  currency: string;
  category: string | null;
  notes: string | null;
  household_id: string;
  household_name?: string;
  image_path: string | null;
}

interface ReportsProps {
  onClose: () => void;
}

export function Reports({ onClose }: ReportsProps) {
  console.log('Reports component rendered');
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]);
  const [selectedHouseholds, setSelectedHouseholds] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalAmount, setTotalAmount] = useState(0);
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    loadOptions();
  }, [user]);

  useEffect(() => {
    // Reset selected categories when households change
    setSelectedCategories([]);
  }, [selectedHouseholds]);

  useEffect(() => {
    const loadImageUrl = async () => {
      if (viewingImage) {
        const { data, error } = await supabase.storage
          .from('receipts')
          .createSignedUrl(viewingImage, 3600);
        if (!error && data) {
          setImageUrl(data.signedUrl);
        } else {
          console.error('Error loading image:', error);
          setImageUrl(null);
        }
      } else {
        setImageUrl(null);
      }
    };
    loadImageUrl();
  }, [viewingImage]);

  const loadOptions = async () => {
    if (!user) return;

    try {
      // Load households
      const { data: memberData, error: memberError } = await supabase
        .from('household_members')
        .select('household_id, households(id, name)')
        .eq('user_id', user.id);

      if (memberError) {
        console.error('Error loading households:', memberError);
        return;
      }

      const hh = (memberData || [])
        .map((item: any) => item.households)
        .filter(Boolean) as unknown as Household[];
      setHouseholds(hh);

      // Load categories: global + household-specific for user's households
      const householdIds = hh.map((h) => h.id);
      const { data: catData, error: catError } = await supabase
        .from('categories')
        .select('id, name, household_id')
        .or(`household_id.is.null,household_id.in.(${householdIds.join(',')})`);

      if (catError) {
        console.error('Error loading categories:', catError);
        return;
      }

      setAllCategories(catData || []);
    } catch (error) {
      console.error('Unexpected error in loadOptions:', error);
    }
  };

  const runReport = async () => {
    if (!user || selectedHouseholds.length === 0) return;

    setLoading(true);

    try {
      const householdMap = new Map(households.map((h: Household) => [h.id, h.name]));

      let query = supabase
        .from('expenses')
        .select('id, expense_date, vendor, total, currency, category, notes, household_id, image_path')
        .in('household_id', selectedHouseholds)
        .order('expense_date', { ascending: false });

      if (selectedCategories.length > 0) {
        const selectedCategoryNames = availableCategories
          .filter((c: Category) => selectedCategories.includes(c.id))
          .map((c: Category) => c.name);
        query = query.in('category', selectedCategoryNames);
      }

      if (startDate) {
        query = query.gte('expense_date', startDate);
      }

      if (endDate) {
        query = query.lte('expense_date', endDate);
      }

      const { data, error } = await query;

      if (!error && data) {
        const filteredExpenses = data.map((e: any) => ({
          ...e,
          household_name: householdMap.get(e.household_id) || 'Unknown',
        }));
        setExpenses(filteredExpenses);
        setTotalAmount(filteredExpenses.reduce((sum: number, e: Expense) => sum + e.total, 0));
      } else {
        if (error) console.error('Error running report:', error);
        setExpenses([]);
        setTotalAmount(0);
      }
    } catch (error) {
      console.error('Unexpected error running report:', error);
      setExpenses([]);
      setTotalAmount(0);
    } finally {
      setLoading(false);
    }
  };

  const toggleHousehold = (id: string) => {
    setSelectedHouseholds((prev: string[]) =>
      prev.includes(id) ? prev.filter((h: string) => h !== id) : [...prev, id]
    );
  };

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev: string[]) =>
      prev.includes(id) ? prev.filter((c: string) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Reports
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Households */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Home className="w-4 h-4" />
                Households
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {households.map((h: Household) => (
                  <label key={h.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedHouseholds.includes(h.id)}
                      onChange={() => toggleHousehold(h.id)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">{h.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Categories */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Tag className="w-4 h-4" />
                Categories
              </label>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {availableCategories.map((c: Category) => (
                  <label key={c.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(c.id)}
                      onChange={() => toggleCategory(c.id)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">{c.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Start Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              />
            </div>

            {/* End Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-slate-500 focus:border-slate-500"
              />
            </div>
          </div>

          {/* Run Report Button */}
          <div className="flex justify-center">
            <button
              onClick={runReport}
              disabled={selectedHouseholds.length === 0 || loading}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-xl transition-all shadow-sm font-medium"
            >
              {loading ? 'Running Report...' : 'Run Report'}
            </button>
          </div>

          {/* Results */}
          {expenses.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  Results ({expenses.length} transactions)
                </h3>
                <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                  <DollarSign className="w-5 h-5" />
                  Total: ${totalAmount.toFixed(2)}
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto border border-slate-200 rounded-xl">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Vendor</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Household</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {new Date(expense.expense_date).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.vendor || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.category || 'Uncategorized'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900">
                          {expense.household_name}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 text-right">
                          ${expense.total.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-900 text-center">
                          {expense.image_path ? (
                            <button
                              onClick={() => setViewingImage(expense.image_path)}
                              className="p-1 hover:bg-slate-100 rounded"
                              title="View Receipt"
                            >
                              <FileText className="w-4 h-4 text-slate-600" />
                            </button>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {expenses.length === 0 && !loading && (
            <div className="text-center py-8 text-slate-500">
              No transactions found for the selected filters.
            </div>
          )}
        </div>
      </div>

      {viewingImage && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Receipt Image</h3>
              <button
                onClick={() => setViewingImage(null)}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-6 flex justify-center">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt="Receipt"
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : (
                <div className="text-slate-500">Loading image...</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}