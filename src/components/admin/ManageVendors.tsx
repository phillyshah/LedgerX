import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useT } from '../../hooks/useT';
import { useVendorCatalog, type VendorMapping } from '../../hooks/useVendorCatalog';
import { Plus, Trash2, Globe, Home, Save, X, Search } from 'lucide-react';

interface Category { id: string; name: string; household_id: string | null; }
interface Household { id: string; name: string; }

/**
 * Admin "Manage Vendors" page. Lists every vendor → category mapping
 * the admin can see (globals + per-household). Lets the admin add new
 * mappings, edit existing ones, promote a household-scoped row to
 * global (and demote back), and delete.
 *
 * Wire-level scope:
 * - Globals (household_id IS NULL) are written via admin_upsert_vendor_mapping
 *   (SECURITY DEFINER) since RLS forbids direct insert with NULL household.
 * - Household-scoped rows are upserted directly — RLS allows admins to
 *   write any household when is_admin() returns true.
 * - Deletes use the standard table API, gated by the new admin DELETE policy.
 */
export function ManageVendors() {
  const { t } = useT();
  const { vendors, loading, reload } = useVendorCatalog();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'household'>('all');

  // Add-form state
  const [newVendor, setNewVendor] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newHouseholdId, setNewHouseholdId] = useState<string>('');  // '' = global
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState('');

  useEffect(() => {
    (async () => {
      const [{ data: hh }, { data: cats }] = await Promise.all([
        supabase.from('households').select('id, name').order('name'),
        supabase.from('categories').select('id, name, household_id').order('name'),
      ]);
      if (hh) setHouseholds(hh);
      if (cats) setCategories(cats);
    })();
  }, []);

  const householdMap = useMemo(
    () => new Map(households.map((h) => [h.id, h.name])),
    [households]
  );

  const filtered = useMemo(() => {
    let rows = vendors;
    if (scopeFilter === 'global') rows = rows.filter((v) => v.household_id === null);
    if (scopeFilter === 'household') rows = rows.filter((v) => v.household_id !== null);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (v) => v.vendor_name.toLowerCase().includes(q)
            || v.category_name.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [vendors, scopeFilter, search]);

  // Categories valid for the household selected in the add-form. Globals
  // (categories with household_id === null) are always available.
  const addFormCategories = useMemo(() => {
    if (!newHouseholdId) return categories.filter((c) => c.household_id === null);
    return categories.filter(
      (c) => c.household_id === null || c.household_id === newHouseholdId
    );
  }, [categories, newHouseholdId]);

  const submitAdd = async () => {
    setError(null);
    const vendor = newVendor.trim();
    const category = newCategory.trim();
    if (!vendor || !category) {
      setError(t('admin.vendors.errMissing'));
      return;
    }
    setAdding(true);
    const householdId = newHouseholdId || null;
    const { error: rpcErr } = await supabase.rpc('admin_upsert_vendor_mapping', {
      p_household_id: householdId,
      p_vendor_name: vendor,
      p_category_name: category,
    });
    setAdding(false);
    if (rpcErr) {
      setError(rpcErr.message);
      return;
    }
    setNewVendor('');
    setNewCategory('');
    setNewHouseholdId('');
    setShowAdd(false);
    reload();
  };

  const saveEdit = async (row: VendorMapping) => {
    const category = editCategory.trim();
    if (!category) return;
    const { error: rpcErr } = await supabase.rpc('admin_upsert_vendor_mapping', {
      p_household_id: row.household_id,
      p_vendor_name: row.vendor_name,
      p_category_name: category,
    });
    if (rpcErr) { setError(rpcErr.message); return; }
    setEditingId(null);
    reload();
  };

  const remove = async (row: VendorMapping) => {
    if (!confirm(t('admin.vendors.confirmDelete', { vendor: row.vendor_name }))) return;
    const { error: delErr } = await supabase
      .from('vendor_category_map')
      .delete()
      .eq('id', row.id);
    if (delErr) { setError(delErr.message); return; }
    reload();
  };

  const promote = async (row: VendorMapping) => {
    // Promote a household-scoped row to global by inserting a new global
    // (idempotent via the RPC's ON CONFLICT) and deleting the original.
    const { error: rpcErr } = await supabase.rpc('admin_upsert_vendor_mapping', {
      p_household_id: null,
      p_vendor_name: row.vendor_name,
      p_category_name: row.category_name,
    });
    if (rpcErr) { setError(rpcErr.message); return; }
    await supabase.from('vendor_category_map').delete().eq('id', row.id);
    reload();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('admin.vendors.title')}</h2>
          <p className="text-slate-500 mt-1 text-sm">{t('admin.vendors.desc')}</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          {t('admin.vendors.add')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.vendors.searchPlaceholder')}
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
          />
        </div>
        <select
          value={scopeFilter}
          onChange={(e) => setScopeFilter(e.target.value as 'all' | 'global' | 'household')}
          className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
        >
          <option value="all">{t('admin.vendors.scopeAll')}</option>
          <option value="global">{t('admin.vendors.scopeGlobal')}</option>
          <option value="household">{t('admin.vendors.scopeHousehold')}</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 bg-white rounded-xl border border-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
          <p className="text-slate-500">{t('admin.vendors.empty')}</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filtered.map((row) => (
            <div key={row.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-[8rem]">
                {row.household_id === null ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-full">
                    <Globe className="w-3 h-3" />
                    {t('admin.vendors.scopeGlobal')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                    <Home className="w-3 h-3" />
                    {householdMap.get(row.household_id) || '—'}
                  </span>
                )}
                <span className="font-medium text-slate-900">{row.vendor_name}</span>
              </div>
              <div className="flex items-center gap-2">
                {editingId === row.id ? (
                  <>
                    <input
                      type="text"
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(row)}
                      className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg"
                      aria-label={t('common.save')}
                    >
                      <Save className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg"
                      aria-label={t('common.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => { setEditingId(row.id); setEditCategory(row.category_name); }}
                      className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm rounded-lg"
                    >
                      {row.category_name}
                    </button>
                    {row.household_id !== null && (
                      <button
                        onClick={() => promote(row)}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        title={t('admin.vendors.promoteTitle')}
                        aria-label={t('admin.vendors.promoteTitle')}
                      >
                        <Globe className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => remove(row)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add-mapping modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{t('admin.vendors.addTitle')}</h3>
              <button onClick={() => setShowAdd(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('admin.vendors.scope')}
                </label>
                <select
                  value={newHouseholdId}
                  onChange={(e) => { setNewHouseholdId(e.target.value); setNewCategory(''); }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="">{t('admin.vendors.scopeGlobal')}</option>
                  {households.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">{t('admin.vendors.scopeHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('admin.vendors.vendorLabel')}
                </label>
                <input
                  type="text"
                  value={newVendor}
                  onChange={(e) => setNewVendor(e.target.value)}
                  placeholder={t('admin.vendors.vendorPlaceholder')}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  {t('admin.vendors.categoryLabel')}
                </label>
                <input
                  type="text"
                  list="manage-vendors-cat-list"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder={t('admin.vendors.categoryPlaceholder')}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <datalist id="manage-vendors-cat-list">
                  {addFormCategories.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
                <p className="text-xs text-slate-500 mt-1">
                  {newHouseholdId ? t('admin.vendors.catHintHousehold') : t('admin.vendors.catHintGlobal')}
                </p>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitAdd}
                disabled={adding}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-medium rounded-xl"
              >
                {adding ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
