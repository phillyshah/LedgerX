import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, Trash2, Edit2, Check, Home, Globe } from 'lucide-react';
import { useT } from '../../hooks/useT';

interface Category {
  id: string;
  name: string;
  created_at: string;
  household_id: string | null;
}

interface CategoryHousehold {
  category_id: string;
  household_id: string;
}

interface Household {
  id: string;
  name: string;
}

export function ManageCategories() {
  const { t } = useT();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryHouseholds, setCategoryHouseholds] = useState<CategoryHousehold[]>([]);
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
  const [selectedHouseholdIds, setSelectedHouseholdIds] = useState<string[]>([]);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await Promise.all([loadCategories(), loadCategoryHouseholds(), loadHouseholds()]);
  };

  const loadCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('*')
      .order('name');

    if (data) setCategories(data);
    setLoading(false);
  };

  const loadCategoryHouseholds = async () => {
    const { data } = await supabase
      .from('category_households')
      .select('category_id, household_id');

    if (data) setCategoryHouseholds(data);
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
      setError(insertError.message.includes('duplicate') ? t('admin.cat.duplicate') : insertError.message);
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
    if (!confirm(t('admin.cat.deleteConfirm'))) return;

    await supabase.from('categories').delete().eq('id', id);
    await loadCategories();
  };

  const openAssignModal = (category: Category) => {
    setSelectedCategoryId(category.id);
    setSelectedCategoryName(category.name);
    const assignedHouseholds = categoryHouseholds
      .filter(ch => ch.category_id === category.id)
      .map(ch => ch.household_id);
    setSelectedHouseholdIds(assignedHouseholds);
    setShowAssignModal(true);
    setError('');
  };

  const saveAssignment = async () => {
    setAssigning(true);
    setError('');

    try {
      const householdIds = selectedHouseholdIds.length > 0 ? selectedHouseholdIds : null;

      const { error: rpcError } = await supabase.rpc('admin_set_category_households', {
        p_category_id: selectedCategoryId,
        p_household_ids: householdIds,
      });

      if (rpcError) throw rpcError;

      setShowAssignModal(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.cat.failedAssign'));
    } finally {
      setAssigning(false);
    }
  };

  const toggleHousehold = (householdId: string) => {
    setSelectedHouseholdIds(prev => {
      if (prev.includes(householdId)) {
        return prev.filter(id => id !== householdId);
      } else {
        return [...prev, householdId];
      }
    });
  };

  const getHouseholdNames = (categoryId: string) => {
    const assignedHouseholds = categoryHouseholds
      .filter(ch => ch.category_id === categoryId)
      .map(ch => households.find(h => h.id === ch.household_id)?.name || 'Unknown');

    return assignedHouseholds.length > 0 ? assignedHouseholds : ['Global'];
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
          <h2 className="text-2xl font-bold text-slate-900">{t('admin.manageCategories')}</h2>
          <p className="text-slate-500 mt-1">{t('admin.cat.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('admin.cat.newCategory')}
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
            <h3 className="font-semibold text-slate-900">{t('admin.cat.addCategory')}</h3>
            <button onClick={() => setShowAdd(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <form onSubmit={addCategory} className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('admin.cat.categoryNamePlaceholder')}
              required
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={adding}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50"
            >
              {adding ? t('admin.cat.adding') : t('admin.cat.add')}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">{t('admin.cat.noneYet')}</p>
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{category.name}</span>
                        {getHouseholdNames(category.id).map((name, idx) => (
                          name === 'Global' ? (
                            <span key="global" className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded-lg">
                              <Globe className="w-3 h-3" />
                              {t('admin.cat.globalBadge')}
                            </span>
                          ) : (
                            <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg">
                              <Home className="w-3 h-3" />
                              {name}
                            </span>
                          )
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => openAssignModal(category)}
                        className="p-2 hover:bg-blue-50 rounded-lg transition-all"
                        title={t('admin.cat.assignToHousehold')}
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
                  <h3 className="text-xl font-bold text-slate-900">{t('admin.cat.assignCategory')}</h3>
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
                {t('admin.cat.assignHelp')}
              </p>

              <div className="space-y-2">
                {households.map((household) => (
                  <label
                    key={household.id}
                    className="flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={selectedHouseholdIds.includes(household.id)}
                      onChange={() => toggleHousehold(household.id)}
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-600"
                    />
                    <div className="flex items-center gap-2">
                      <Home className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-slate-900">{household.name}</span>
                    </div>
                  </label>
                ))}
              </div>

              {selectedHouseholdIds.length === 0 && (
                <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-slate-600" />
                    <p className="text-sm text-slate-700 font-medium">{t('admin.cat.assignedToAll')}</p>
                  </div>
                </div>
              )}

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
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={saveAssignment}
                  disabled={assigning}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {assigning ? t('admin.cat.assigning') : t('admin.cat.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
