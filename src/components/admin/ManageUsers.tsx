import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Trash2, Users, UserPlus, X, Key, Home, HardHat } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LANGUAGES, type Language } from '../../i18n';
import { useT } from '../../hooks/useT';

type Role = 'regular' | 'admin' | 'contractor';

interface User {
  id: string;
  username: string;
  created_at: string;
  is_admin?: boolean;
  is_contractor?: boolean;
  preferred_language?: Language;
}

const LANG_FLAG: Record<Language, string> = { 'en': '🇺🇸', 'pt-BR': '🇧🇷' };

interface Household {
  id: string;
  name: string;
}

export function ManageUsers() {
  const { user: currentUser } = useAuth();
  const { t, locale } = useT();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('regular');
  const [newUserLanguage, setNewUserLanguage] = useState<Language>('en');
  const [creating, setCreating] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUserUsername, setSelectedUserUsername] = useState<string>('');
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
      // admin_list_users now returns is_admin / is_contractor / preferred_language directly.
      setUsers(usersData as User[]);
    }

    setLoading(false);
  };

  const changeUserRole = async (userId: string, role: Role) => {
    if (userId === currentUser?.id) {
      setError(t('admin.cannotChangeSelfRole'));
      return;
    }
    setActionLoading(userId);
    setError('');
    const { error: updateError } = await supabase.rpc('admin_update_user_role', {
      p_user_id: userId,
      p_is_admin: role === 'admin',
      p_is_contractor: role === 'contractor',
    });
    if (updateError) setError(updateError.message);
    else await loadUsers();
    setActionLoading(null);
  };

  const changeUserLanguage = async (userId: string, lang: Language) => {
    setActionLoading(userId);
    setError('');
    const { error: updateError } = await supabase.rpc('admin_update_user_language', {
      p_user_id: userId,
      p_language: lang,
    });
    if (updateError) setError(updateError.message);
    else await loadUsers();
    setActionLoading(null);
  };

  const currentRole = (u: User): Role =>
    u.is_admin ? 'admin' : u.is_contractor ? 'contractor' : 'regular';

  const deleteUser = async (userId: string) => {
    if (userId === currentUser?.id) {
      setError(t('admin.cannotDeleteSelf'));
      return;
    }

    if (!confirm(t('admin.deleteConfirm'))) return;

    setActionLoading(userId);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError(t('admin.noSession'));
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
        setError(result.error || t('admin.failedDelete'));
      } else {
        await loadUsers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedDelete'));
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
        setError(t('admin.noSession'));
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
            is_admin: newUserRole === 'admin',
            is_contractor: newUserRole === 'contractor',
            preferred_language: newUserLanguage,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || t('admin.failedCreate'));
      } else {
        setShowCreateModal(false);
        setNewUserId('');
        setNewUserPassword('');
        setNewUserRole('regular');
        setNewUserLanguage('en');
        await loadUsers();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedCreate'));
    } finally {
      setCreating(false);
    }
  };

  const openPasswordModal = (userId: string, username: string) => {
    setSelectedUserId(userId);
    setSelectedUserUsername(username);
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
        setError(t('admin.noSession'));
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
        setError(result.error || t('admin.failedPassword'));
      } else {
        setShowPasswordModal(false);
        setSelectedUserId('');
        setSelectedUserUsername('');
        setNewPassword('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedPassword'));
    } finally {
      setChangingPassword(false);
    }
  };

  const openHouseholdModal = async (userId: string, username: string) => {
    setSelectedUserId(userId);
    setSelectedUserUsername(username);
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
        await supabase.rpc('admin_add_household_member_by_id', {
          p_household_id: householdId,
          p_user_id: selectedUserId,
          p_role: 'member',
        });
      }

      setShowHouseholdModal(false);
      setSelectedUserId('');
      setSelectedUserUsername('');
      setSelectedHouseholdIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.failedSaveHouseholds'));
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
          <h2 className="text-2xl font-bold text-slate-900">{t('admin.manageUsers')}</h2>
          <p className="text-slate-500 mt-1">{t('admin.manageUsersSubtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl">
            <Users className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-semibold text-slate-900">{t('admin.usersCount', { count: users.length })}</span>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-all"
          >
            <UserPlus className="w-4 h-4" />
            {t('admin.createUser')}
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
            <p className="text-slate-500">{t('admin.users.noUsers')}</p>
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium text-slate-900 truncate">{user.username}</p>
                      <span title={user.preferred_language === 'pt-BR' ? 'Português (Brasil)' : 'English'}>
                        {LANG_FLAG[user.preferred_language ?? 'en']}
                      </span>
                      {isCurrentUser && (
                        <span className="inline-flex px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                          {t('admin.you')}
                        </span>
                      )}
                      {user.is_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded">
                          <Shield className="w-3 h-3" />
                          {t('admin.roleAdmin')}
                        </span>
                      )}
                      {user.is_contractor && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                          <HardHat className="w-3 h-3" />
                          {t('admin.roleContractor')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {t('admin.joined', { date: new Date(user.created_at).toLocaleDateString(locale) })}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 ml-4">
                    {isCurrentUser ? (
                      <>
                        <button
                          onClick={() => openHouseholdModal(user.id, user.username)}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-all"
                          title={t('admin.assignHouseholds')}
                        >
                          <Home className="w-3.5 h-3.5" />
                          {t('admin.households')}
                        </button>
                        <button
                          onClick={() => openPasswordModal(user.id, user.username)}
                          className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-medium rounded-lg transition-all"
                          title={t('admin.changeMyPassword')}
                        >
                          <Key className="w-3.5 h-3.5" />
                          {t('admin.changeMyPassword')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => openHouseholdModal(user.id, user.username)}
                          disabled={isLoading}
                          className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-all disabled:opacity-50"
                          title={t('admin.assignHouseholds')}
                        >
                          <Home className="w-3.5 h-3.5" />
                          {t('admin.households')}
                        </button>
                        <select
                          value={currentRole(user)}
                          disabled={isLoading}
                          onChange={(e) => changeUserRole(user.id, e.target.value as Role)}
                          className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"
                          title={t('admin.users.roleTitle')}
                        >
                          <option value="regular">{t('admin.roleRegularShort')}</option>
                          <option value="admin">{t('admin.roleAdmin')}</option>
                          <option value="contractor">{t('admin.roleContractor')}</option>
                        </select>
                        <select
                          value={user.preferred_language ?? 'en'}
                          disabled={isLoading}
                          onChange={(e) => changeUserLanguage(user.id, e.target.value as Language)}
                          className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:opacity-50"
                          title={t('admin.users.languageTitle')}
                        >
                          {LANGUAGES.map(l => (
                            <option key={l.code} value={l.code}>{LANG_FLAG[l.code]} {l.label}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => openPasswordModal(user.id, user.username)}
                          disabled={isLoading}
                          className="p-2 hover:bg-blue-50 rounded-lg transition-all disabled:opacity-50"
                          title={t('admin.changePassword')}
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
                <h3 className="text-xl font-bold text-slate-900">{t('admin.createNewUser')}</h3>
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
                  {t('auth.userId')}
                </label>
                <input
                  id="newUserId"
                  type="text"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                  required
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  placeholder={t('admin.users.userIdPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-2">
                  {t('auth.password')}
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  placeholder={t('admin.users.passwordPlaceholder')}
                />
              </div>

              <div>
                <label htmlFor="newUserRole" className="block text-sm font-medium text-slate-700 mb-2">
                  {t('admin.role')}
                </label>
                <select
                  id="newUserRole"
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value as Role)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="regular">{t('admin.roleRegular')}</option>
                  <option value="admin">{t('admin.roleAdmin')}</option>
                  <option value="contractor">{t('admin.roleContractorLong')}</option>
                </select>
              </div>

              <div>
                <label htmlFor="newUserLanguage" className="block text-sm font-medium text-slate-700 mb-2">
                  {t('admin.preferredLanguage')}
                </label>
                <select
                  id="newUserLanguage"
                  value={newUserLanguage}
                  onChange={(e) => setNewUserLanguage(e.target.value as Language)}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{LANG_FLAG[l.code]} {l.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {creating ? t('admin.creating') : t('admin.users.createUserBtn')}
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
                  <h3 className="text-xl font-bold text-slate-900">{t('admin.changePassword')}</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedUserUsername}</p>
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
                  {t('settings.newPassword')}
                </label>
                <input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all"
                  placeholder={t('admin.users.passwordPlaceholder')}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 font-medium rounded-xl transition-all"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={changingPassword}
                  className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingPassword ? t('admin.changing') : t('admin.changePassword')}
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
                  <h3 className="text-xl font-bold text-slate-900">{t('admin.assignHouseholds')}</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedUserUsername}</p>
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
                {t('admin.selectHouseholds')}
              </p>

              {households.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  {t('admin.noHouseholds')}
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
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={saveHouseholds}
                  disabled={savingHouseholds}
                  className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingHouseholds ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
