import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, ShieldOff, Trash2, Users, UserPlus, X, Key, Home } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface User {
  id: string;
  email: string;
  created_at: string;
  is_admin?: boolean;
}

interface Household {
  id: string;
  name: string;
}

export function ManageUsers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUserEmail, setSelectedUserEmail] = useState<string>('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [showHouseholdModal, setShowHouseholdModal] = useState(false);
  const [households, setHouseholds] = useState<Household[]>([]);
  const [selectedHouseholdIds, setSelectedHouseholdIds] = useState<string[]>([]);
  const [savingHouseholds, setSavingHouseholds] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    setError('');

    const { data: usersData } = await supabase.rpc('admin_list_users');

    if (usersData) {
      const { data: rolesData } = await supabase.from('user_roles').select('user_id, is_admin');

      const rolesMap = new Map((rolesData || []).map((r) => [r.user_id, r.is_admin]));

      setUsers(
        usersData.map((u: User) => ({
          ...u,
          is_admin: rolesMap.get(u.id) || false,
        }))
      );
    }

    setLoading(false);
  };

  const toggleAdminStatus = async (userId: string, currentStatus: boolean) => {
    if (userId === currentUser?.id) {
      setError('You cannot change your own admin status');
      return;
    }

    const confirmMsg = currentStatus
      ? 'Remove admin privileges from this user?'
      : 'Grant admin privileges to this user?';

    if (!confirm(confirmMsg)) return;

    setActionLoading(userId);
    setError('');

    const { error: updateError } = await supabase.rpc('admin_update_user_role', {
      p_user_id: userId,
      p_is_admin: !currentStatus,
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      await loadUsers();
    }

    setActionLoading(null);
  };

  const deleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      setError('You cannot delete your own account');
      return;
    }

    if (!confirm('Delete this user? All their data will be moved to Uncategorized.')) return;

    setActionLoading(userId);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active session');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-delete-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: userId,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to delete user');
      } else {
        await loadUsers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setActionLoading(null);
    }
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active session');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-create-user`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userid: newUserId,
            password: newUserPassword,
            is_admin: newUserIsAdmin,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to create user');
      } else {
        setShowCreateModal(false);
        setNewUserId('');
        setNewUserPassword('');
        setNewUserIsAdmin(false);
        await loadUsers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const openPasswordModal = (userId: string, userEmail: string) => {
    setSelectedUserId(userId);
    setSelectedUserEmail(userEmail);
    setNewPassword('');
    setShowPasswordModal(true);
    setError('');
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('No active session');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-change-password`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            user_id: selectedUserId,
            new_password: newPassword,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || 'Failed to change password');
      } else {
        setShowPasswordModal(false);
        setSelectedUserId('');
        setSelectedUserEmail('');
        setNewPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const openHouseholdModal = async (userId: string, userEmail: string) => {
    setSelectedUserId(userId);
    setSelectedUserEmail(userEmail);
    setError('');
    setShowHouseholdModal(true);

    const { data: householdsData } = await supabase
      .from('households')
      .select('id, name')
      .order('name');

    if (householdsData) {
      setHouseholds(householdsData);
    }

    const { data: memberData } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId);

    if (memberData) {
      setSelectedHouseholdIds(memberData.map(m => m.household_id));
    }
  };

  const toggleHousehold = (householdId: string) => {
    setSelectedHouseholdIds(prev =>
      prev.includes(householdId)
        ? prev.filter(id => id !== householdId)
        : [...prev, householdId]
    );
  };

  const saveHouseholds = async () => {
    setSavingHouseholds(true);
    setError('');

    try {
      const { data: currentMemberships } = await supabase
        .from('household_members')
        .select('id, household_id')
        .eq('user_id', selectedUserId);

      const currentIds = (currentMemberships || []).map(m => m.household_id);
      const toRemove = currentIds.filter(id => !selectedHouseholdIds.includes(id));
      const toAdd = selectedHouseholdIds.filter(id => !currentIds.includes(id));

      for (const householdId of toRemove) {
        const membership = currentMemberships?.find(m => m.household_id === householdId);
        if (membership) {
          await supabase.rpc('admin_remove_household_member', {
            p_member_id: membership.id,
          });
        }
      }

      for (const householdId of toAdd) {
        await supabase.rpc('admin_add_household_member', {
          p_household_id: householdId,
          p_user_email: selectedUserEmail,
          p_role: 'member',
        });
      }

      setShowHouseholdModal(false);
      setSelectedUserId('');
      setSelectedUserEmail('');
      setSelectedHouseholdIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save households');
    } finally {
      setSavingHouseholds(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-slate-200 rounded-lg animate-pulse" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 bg-white rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">User Management</h2>
          <p className="text-slate-500 mt-1">Manage user accounts and admin privileges.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl">
            <Users className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-900">{users.length} Users</span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Create User
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl mb-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {users.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">No users found.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {users.map((user) => {
              const isCurrentUser = user.id === currentUser?.id;
              const isLoading = actionLoading === user.id;

              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-all"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-slate-900 truncate">{user.email}</p>
                      {isCurrentUser && (
                        <span className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          You
                        </span>
                      )}
                      {user.is_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                          <Shield className="w-3 h-3" />
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      Joined {new Date(user.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {isCurrentUser ? (
                      <>
                        <button
                          onClick={() => openHouseholdModal(user.id, user.email)}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-all"
                          title="Assign Households"
                        >
                          <Home className="w-3.5 h-3.5" />
                          Households
                        </button>
                        <button
                          onClick={() => openPasswordModal(user.id, user.email)}
                          className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium rounded-lg transition-all"
                          title="Change My Password"
                        >
                          <Key className="w-3.5 h-3.5" />
                          Change My Password
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openHouseholdModal(user.id, user.email)}
                          disabled={isLoading}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                          title="Assign Households"
                        >
                          <Home className="w-3.5 h-3.5" />
                          Households
                        </button>
                        <button
                          onClick={() => toggleAdminStatus(user.id, user.is_admin || false)}
                          disabled={isLoading}
                          className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-all disabled:opacity-50 ${
                            user.is_admin
                              ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {user.is_admin ? (
                            <>
                              <ShieldOff className="w-3.5 h-3.5" />
                              Remove Admin
                            </>
                          ) : (
                            <>
                              <Shield className="w-3.5 h-3.5" />
                              Make Admin
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => openPasswordModal(user.id, user.email)}
                          disabled={isLoading}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                          title="Change Password"
                        >
                          <Key className="w-4 h-4 text-blue-500" />
                        </button>
                        <button
                          onClick={() => deleteUser(user.id)}
                          disabled={isLoading}
                          className="p-2 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-slate-900">Create New User</h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <form onSubmit={createUser} className="p-6 space-y-4">
              <div>
                <label htmlFor="newUserId" className="block text-sm font-medium text-slate-700 mb-2">
                  User ID
                </label>
                <input
                  id="newUserId"
                  type="text"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  placeholder="johndoe"
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl">
                <input
                  id="newIsAdmin"
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-600"
                />
                <label htmlFor="newIsAdmin" className="text-sm font-medium text-slate-700 cursor-pointer">
                  Grant admin privileges
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Change Password</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedUserEmail}</p>
                </div>
                <button
                  onClick={() => setShowPasswordModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <form onSubmit={changePassword} className="p-6 space-y-4">
              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-2">
                  New Password
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                  placeholder="Minimum 6 characters"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showHouseholdModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Assign Households</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedUserEmail}</p>
                </div>
                <button
                  onClick={() => setShowHouseholdModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6">
              <p className="text-sm text-slate-600 mb-4">
                Select which households this user can access:
              </p>

              {households.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  No households available. Create one first.
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto">
                  {households.map((household) => (
                    <label
                      key={household.id}
                      className="flex items-center gap-3 p-4 bg-slate-50 hover:bg-slate-100 rounded-xl cursor-pointer transition-all"
                    >
                      <input
                        type="checkbox"
                        checked={selectedHouseholdIds.includes(household.id)}
                        onChange={() => toggleHousehold(household.id)}
                        className="w-5 h-5 text-emerald-600 rounded focus:ring-2 focus:ring-emerald-600"
                      />
                      <span className="text-sm font-medium text-slate-900">{household.name}</span>
                    </label>
                  ))}
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
                  onClick={() => setShowHouseholdModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveHouseholds}
                  disabled={savingHouseholds}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingHouseholds ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
