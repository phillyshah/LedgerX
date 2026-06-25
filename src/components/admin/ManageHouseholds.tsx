import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, UserPlus, Trash2, Tag, Check, Loader2 } from 'lucide-react';
import { useT } from '../../hooks/useT';

interface Household {
  id: string;
  name: string;
  created_at: string;
  features_enabled?: Record<string, boolean> | null;
}

interface HouseholdMember {
  id: string;
  user_id: string;
  role: string;
  username?: string;
}

interface User {
  id: string;
  username: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

export function ManageHouseholds() {
  const { t, locale } = useT();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);

  // Category-assignment state — scoped to the currently expanded household.
  // We load the full category list once and the per-household assignments
  // on demand so opening another household doesn't re-fetch the whole set.
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [assignedCategoryIds, setAssignedCategoryIds] = useState<string[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState('');

  useEffect(() => {
    loadHouseholds();
    loadAllUsers();
    loadAllCategories();
  }, []);

  const loadHouseholds = async () => {
    const { data } = await supabase
      .from('households')
      .select('*')
      .order('name');

    if (data) setHouseholds(data);
    setLoading(false);
  };

  const loadAllUsers = async () => {
    const { data } = await supabase.rpc('admin_list_users');
    if (data) {
      setAllUsers(data.map((u: { id: string; username: string }) => ({ id: u.id, username: u.username })));
    }
  };

  const loadAllCategories = async () => {
    const { data } = await supabase
      .from('categories')
      .select('id, name')
      .order('name');
    if (data) setAllCategories(data as CategoryOption[]);
  };

  const loadAssignedCategories = async (householdId: string) => {
    setLoadingCategories(true);
    setCategoryError('');
    const { data } = await supabase
      .from('category_households')
      .select('category_id')
      .eq('household_id', householdId);
    setAssignedCategoryIds(((data ?? []) as { category_id: string }[]).map((r) => r.category_id));
    setLoadingCategories(false);
  };

  // Toggle a single category on/off for the expanded household via the
  // inverse RPC. We compute the next set client-side and ship it to the
  // server in one call (which also fixes up the legacy categories.household_id
  // field). Optimistic UI: flip the checkbox immediately, roll back on error.
  const toggleCategoryForHousehold = async (householdId: string, categoryId: string) => {
    const currentlyAssigned = assignedCategoryIds.includes(categoryId);
    const next = currentlyAssigned
      ? assignedCategoryIds.filter((id) => id !== categoryId)
      : [...assignedCategoryIds, categoryId];
    setAssignedCategoryIds(next);
    setSavingCategoryId(categoryId);
    setCategoryError('');

    const { error } = await supabase.rpc(
      'admin_set_household_categories' as never,
      {
        p_household_id: householdId,
        p_category_ids: next.length > 0 ? next : null,
      } as never,
    );

    if (error) {
      // Roll back the optimistic flip and surface the error.
      setAssignedCategoryIds(assignedCategoryIds);
      setCategoryError(error.message);
    }
    setSavingCategoryId(null);
  };

  const createHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);

    const { error } = await supabase.rpc('admin_create_household', {
      household_name: newName.trim(),
    });

    if (!error) {
      setNewName('');
      setShowCreate(false);
      await loadHouseholds();
    }
    setCreating(false);
  };

  const loadMembers = async (householdId: string) => {
    if (expandedId === householdId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(householdId);
    setLoadingMembers(true);
    setMemberError('');

    const { data: memberData } = await supabase
      .from('household_members')
      .select('id, user_id, role')
      .eq('household_id', householdId);

    if (memberData && memberData.length > 0) {
      const { data: users } = await supabase.rpc('admin_list_users');
      const userMap = new Map((users || []).map((u: { id: string; username: string }) => [u.id, u.username]));

      setMembers(
        memberData.map((m) => ({
          ...m,
          username: userMap.get(m.user_id) || 'Unknown',
        }))
      );
    } else {
      setMembers([]);
    }

    setLoadingMembers(false);

    // Categories load in parallel from the user's perspective — independent
    // state so it can show its own spinner without blocking the member list.
    void loadAssignedCategories(householdId);
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expandedId || !selectedUserId) return;
    setAddingMember(true);
    setMemberError('');

    const { error } = await supabase.rpc('admin_add_household_member_by_id', {
      p_household_id: expandedId,
      p_user_id: selectedUserId,
      p_role: 'member',
    });

    if (error) {
      setMemberError(error.message);
    } else {
      setSelectedUserId('');
      await loadMembers(expandedId);
      setExpandedId(expandedId);
    }
    setAddingMember(false);
  };

  const toggleFeature = async (householdId: string, key: string, value: boolean) => {
    const current = households.find((h) => h.id === householdId)?.features_enabled ?? {};
    const next = { ...current, [key]: value };
    const { error } = await supabase.rpc('admin_update_household_features', {
      p_household_id: householdId,
      p_features: next,
    });
    if (error) {
      setMemberError(error.message);
      return;
    }
    setHouseholds((prev) =>
      prev.map((h) => (h.id === householdId ? { ...h, features_enabled: next } : h))
    );
  };

  const removeMember = async (memberId: string) => {
    if (!expandedId) return;
    const { error } = await supabase.rpc('admin_remove_household_member', { p_member_id: memberId });
    if (error) {
      setMemberError(error.message);
      return;
    }
    // Optimistic update — `loadMembers(expandedId)` would *toggle* the
    // expansion off (it's also the open/close handler), so we patch local
    // state directly instead. Server-side delete already happened.
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  };

  const deleteHousehold = async (householdId: string) => {
    if (!confirm(t('admin.hh.deleteConfirm'))) return;

    setDeleteError('');

    try {
      const { error } = await supabase.rpc('admin_delete_household', { p_household_id: householdId });

      if (error) {
        console.error('Error deleting household:', error);
        setDeleteError(t('admin.hh.failedDelete', { message: error.message }));
        return;
      }

      // Successfully deleted, refresh list
      setExpandedId(null);
      await loadHouseholds();
    } catch (err) {
      console.error('Unexpected error deleting household:', err);
      setDeleteError(t('admin.hh.unexpectedDelete'));
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t('admin.manageHouseholds')}</h2>
          <p className="text-slate-500 mt-1">{t('admin.hh.subtitleLong')}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          {t('admin.hh.newHousehold')}
        </button>
      </div>

      {deleteError && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6">
          <div className="flex items-start justify-between">
            <p className="text-sm text-red-600">{deleteError}</p>
            <button onClick={() => setDeleteError('')} className="p-1 hover:bg-red-100 rounded-lg">
              <X className="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900">{t('admin.hh.createHousehold')}</h3>
            <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <form onSubmit={createHousehold} className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('admin.hh.householdNamePlaceholder')}
              required
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50"
            >
              {creating ? t('admin.hh.creating') : t('admin.hh.create')}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {households.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">{t('admin.hh.noHouseholds')}</p>
          </div>
        )}

        {households.map((household) => (
          <div key={household.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-5">
              <button
                onClick={() => loadMembers(household.id)}
                className="flex-1 flex items-center justify-between text-left hover:bg-slate-50 transition-all -m-5 p-5 rounded-2xl"
              >
                <div>
                  <h3 className="font-semibold text-slate-900">{household.name}</h3>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {t('admin.hh.created', { date: new Date(household.created_at).toLocaleDateString(locale) })}
                  </p>
                </div>
                <span className="text-sm text-slate-400 font-medium">
                  {expandedId === household.id ? t('admin.hh.collapse') : t('admin.hh.manage')}
                </span>
              </button>
              <button
                onClick={() => deleteHousehold(household.id)}
                className="ml-2 p-2 hover:bg-red-50 rounded-lg transition-all"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>

            {expandedId === household.id && (
              <div className="border-t border-slate-100 p-5 bg-slate-50">
                <form onSubmit={addMember} className="flex gap-2 mb-4">
                  <div className="flex-1 relative">
                    <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <select
                      value={selectedUserId}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent appearance-none"
                    >
                      <option value="">{t('admin.hh.selectUser')}</option>
                      {allUsers
                        .filter((user) => !members.some((m) => m.user_id === user.id))
                        .map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.username}
                          </option>
                        ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={addingMember}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
                  >
                    {addingMember ? t('admin.hh.adding') : t('admin.hh.add')}
                  </button>
                </form>

                {memberError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                    <p className="text-sm text-red-600">{memberError}</p>
                  </div>
                )}

                <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">{t('admin.hh.features')}</h4>
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div>
                      <p className="text-sm text-slate-700">{t('admin.hh.surgeonNPI')}</p>
                      <p className="text-xs text-slate-500">
                        {t('admin.hh.surgeonNPIHelp')}
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={!!household.features_enabled?.surgeon_npi_lookup}
                      onChange={(e) =>
                        toggleFeature(household.id, 'surgeon_npi_lookup', e.target.checked)
                      }
                      className="w-4 h-4 accent-emerald-600 shrink-0"
                    />
                  </label>
                </div>

                {/* Categories — bulk toggle which categories apply to this
                    household. The single-category modal in ManageCategories
                    still works; this is the inverse view for when you've
                    just created a household and want to wire up ten
                    categories at once. */}
                <div className="mb-4 bg-white border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-sm font-semibold text-slate-900">{t('admin.hh.categories')}</h4>
                      <span className="text-xs text-slate-500">
                        {t('admin.hh.categoriesCount', { count: assignedCategoryIds.length })}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 mb-3">{t('admin.hh.categoriesHelp')}</p>

                  {categoryError && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs text-red-600">{categoryError}</p>
                    </div>
                  )}

                  {loadingCategories ? (
                    <div className="py-4 text-center text-sm text-slate-500">{t('admin.hh.loadingCategories')}</div>
                  ) : allCategories.length === 0 ? (
                    <p className="py-2 text-sm text-slate-500">{t('admin.hh.noCategories')}</p>
                  ) : (
                    <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                      {allCategories.map((cat) => {
                        const checked = assignedCategoryIds.includes(cat.id);
                        const saving = savingCategoryId === cat.id;
                        return (
                          <label
                            key={cat.id}
                            className="flex items-center gap-3 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg cursor-pointer transition-all"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={saving}
                              onChange={() => toggleCategoryForHousehold(household.id, cat.id)}
                              className="w-4 h-4 accent-emerald-600 shrink-0"
                            />
                            <span className="text-sm text-slate-900 flex-1">{cat.name}</span>
                            {saving ? (
                              <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                            ) : checked ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>

                {loadingMembers ? (
                  <div className="py-4 text-center text-sm text-slate-500">{t('admin.hh.loadingMembers')}</div>
                ) : members.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">{t('admin.hh.noMembers')}</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{member.username}</p>
                          <p className="text-xs text-slate-500 capitalize">{member.role}</p>
                        </div>
                        <button
                          onClick={() => removeMember(member.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
