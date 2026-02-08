import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Trash2, Edit2, Check, Home, Globe } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  created_at: string;
  household_id: string | null;
}

interface Household {
  id: string;
  name: string;
}

export function ManageCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [selectedCategoryName, setSelectedCategoryName] = useState<string>('');
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadCategories(), loadHouseholds()]);
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (data) setCategories(data);
    setLoading(false);
  };

  const loadHouseholds = async () => {
    const { data } = await supabase
      .from('households')
      .select('id, name')
      .order('name');

    if (data) setHouseholds(data);
  };

  const addCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    setError('');

    const { error: insertError } = await supabase
      .from('categories')
      .insert({ name: newName.trim() });

    if (insertError) {
      setError(insertError.message.includes('duplicate') ? 'Category already exists' : insertError.message);
    } else {
      setNewName('');
      setShowAdd(false);
      await loadCategories();
    }
    setAdding(false);
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setEditName(category.name);
  };

  const saveEdit = async () => {
    if (!editingId || !editName.trim()) return;
    setError('');

    const { error: updateError } = await supabase
      .from('categories')
      .update({ name: editName.trim() })
      .eq('id', editingId);

    if (updateError) {
      setError(updateError.message);
    } else {
      setEditingId(null);
      await loadCategories();
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('Delete this category? Expenses using this category will be moved to Uncategorized.')) return;

    await supabase.from('categories').delete().eq('id', id);
    await loadCategories();
  };

  const openAssignModal = (category: Category) => {
    setSelectedCategoryId(category.id);
    setSelectedCategoryName(category.name);
    setSelectedHouseholdId(category.household_id || 'global');
    setShowAssignModal(true);
    setError('');
  };

  const saveAssignment = async () => {
    setAssigning(true);
    setError('');

    try {
      if (selectedHouseholdId === 'global') {
        await supabase.rpc('admin_make_category_global', {
          p_category_id: selectedCategoryId,
        });
      } else {
        await supabase.rpc('admin_assign_category_to_household', {
          p_category_id: selectedCategoryId,
          p_household_id: selectedHouseholdId,
        });
      }

      setShowAssignModal(false);
      await loadCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign category');
    } finally {
      setAssigning(false);
    }
  };

  const getHouseholdName = (householdId: string | null) => {
    if (!householdId) return 'Global';
    return households.find(h => h.id === householdId)?.name || 'Unknown';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-14 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Categories</h2>
          <p className="text-slate-500 mt-1">Manage expense categories available to all users.</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Category
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {showAdd && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">Add Category</h3>
            <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <form onSubmit={addCategory} className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              required
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={adding}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50"
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">No categories yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {categories.map((category) => (
              <div key={category.id} className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-all group">
                {editingId === category.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button onClick={saveEdit} className="p-2 hover:bg-green-50 rounded-lg transition-all">
                      <Check className="w-4 h-4 text-green-600" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-900">{category.name}</span>
                        {category.household_id ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg">
                            <Home className="w-3 h-3" />
                            {getHouseholdName(category.household_id)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg">
                            <Globe className="w-3 h-3" />
                            Global
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => openAssignModal(category)}
                        className="p-2 hover:bg-blue-50 rounded-lg transition-all"
                        title="Assign to Household"
                      >
                        <Home className="w-4 h-4 text-blue-600" />
                      </button>
                      <button
                        onClick={() => startEdit(category)}
                        className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                      >
                        <Edit2 className="w-4 h-4 text-slate-600" />
                      </button>
                      <button
                        onClick={() => deleteCategory(category.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAssignModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Assign Category</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedCategoryName}</p>
                </div>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Choose whether this category is available globally or only to a specific household:
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all">
                  <input
                    type="radio"
                    name="household"
                    value="global"
                    checked={selectedHouseholdId === 'global'}
                    onChange={(e) => setSelectedHouseholdId(e.target.value)}
                    className="w-4 h-4 text-emerald-600"
                  />
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-600" />
                    <span className="text-sm font-medium text-slate-900">Global (All Households)</span>
                  </div>
                </label>

                {households.map((household) => (
                  <label
                    key={household.id}
                    className="flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all"
                  >
                    <input
                      type="radio"
                      name="household"
                      value={household.id}
                      checked={selectedHouseholdId === household.id}
                      onChange={(e) => setSelectedHouseholdId(e.target.value)}
                      className="w-4 h-4 text-emerald-600"
                    />
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-slate-900">{household.name}</span>
                    </div>
                  </label>
                ))}
              </div>

              {error && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <div className="flex gap-3 pt-6">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveAssignment}
                  disabled={assigning}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigning ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
