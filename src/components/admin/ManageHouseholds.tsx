import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, X, UserPlus, Trash2 } from 'lucide-react';

interface Household {
  id: string;
  name: string;
  created_at: string;
}

interface HouseholdMember {
  id: string;
  user_id: string;
  role: string;
  email?: string;
}

export function ManageHouseholds() {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    loadHouseholds();
  }, []);

  const loadHouseholds = async () => {
    const { data } = await supabase
      .from('households')
      .select('*')
      .order('name');

    if (data) setHouseholds(data);
    setLoading(false);
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
      const userMap = new Map((users || []).map((u: { id: string; email: string }) => [u.id, u.email]));

      setMembers(
        memberData.map((m) => ({
          ...m,
          email: userMap.get(m.user_id) || 'Unknown',
        }))
      );
    } else {
      setMembers([]);
    }

    setLoadingMembers(false);
  };

  const addMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expandedId || !addEmail.trim()) return;
    setAddingMember(true);
    setMemberError('');

    const { error } = await supabase.rpc('admin_add_household_member', {
      p_household_id: expandedId,
      p_user_email: addEmail.trim(),
      p_role: 'member',
    });

    if (error) {
      setMemberError(error.message);
    } else {
      setAddEmail('');
      await loadMembers(expandedId);
      setExpandedId(expandedId);
    }
    setAddingMember(false);
  };

  const removeMember = async (memberId: string) => {
    if (!expandedId) return;
    await supabase.rpc('admin_remove_household_member', { p_member_id: memberId });
    await loadMembers(expandedId);
    setExpandedId(expandedId);
  };

  const deleteHousehold = async (householdId: string) => {
    if (!confirm('Delete this household? All expenses will be moved to Uncategorized.')) return;

    setDeleteError('');

    try {
      const { error } = await supabase.rpc('admin_delete_household', { p_household_id: householdId });

      if (error) {
        console.error('Error deleting household:', error);
        setDeleteError(`Failed to delete household: ${error.message}`);
        return;
      }

      // Successfully deleted, refresh list
      setExpandedId(null);
      await loadHouseholds();
    } catch (err) {
      console.error('Unexpected error deleting household:', err);
      setDeleteError('An unexpected error occurred while deleting the household.');
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
          <h2 className="text-2xl font-bold text-slate-900">Households</h2>
          <p className="text-slate-500 mt-1">Create and manage households and their members.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all shadow-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Household
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
            <h3 className="font-semibold text-slate-900">Create Household</h3>
            <button onClick={() => setShowCreate(false)} className="p-1 hover:bg-slate-100 rounded-lg">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          <form onSubmit={createHousehold} className="flex gap-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Household name"
              required
              className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
            />
            <button
              type="submit"
              disabled={creating}
              className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {households.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-500">No households yet. Create one to get started.</p>
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
                    Created {new Date(household.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="text-sm text-slate-400 font-medium">
                  {expandedId === household.id ? 'Collapse' : 'Manage'}
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
                    <input
                      type="email"
                      value={addEmail}
                      onChange={(e) => setAddEmail(e.target.value)}
                      placeholder="Add member by email"
                      required
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={addingMember}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
                  >
                    {addingMember ? 'Adding...' : 'Add'}
                  </button>
                </form>

                {memberError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
                    <p className="text-sm text-red-600">{memberError}</p>
                  </div>
                )}

                {loadingMembers ? (
                  <div className="py-4 text-center text-sm text-slate-500">Loading members...</div>
                ) : members.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-500">No members assigned yet.</p>
                ) : (
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-slate-200"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-900">{member.email}</p>
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
