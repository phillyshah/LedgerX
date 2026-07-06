import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Shield, Trash2, Users, UserPlus, X, Key, Home, HardHat, MessageCircle, Plus, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { LANGUAGES, type Language } from '../../i18n';
import { useT } from '../../hooks/useT';
import { PHONE_E164_RE, type NotifyChannel, type PhoneNumberRow } from '../../hooks/useWhatsApp';

type Role = 'regular' | 'admin' | 'contractor' | 'household_admin';

interface User {
  id: string;
  username: string;
  created_at: string;
  last_sign_in_at?: string | null;
  is_admin?: boolean;
  is_contractor?: boolean;
  is_household_admin?: boolean;
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
  // Households assigned at creation time. Defaults to "all" because the
  // auto-assign trigger does that anyway — admins explicitly *uncheck* the
  // households a new user shouldn't see.
  const [newUserHouseholdIds, setNewUserHouseholdIds] = useState<string[]>([]);
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
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [waPhones, setWaPhones] = useState<PhoneNumberRow[]>([]);
  const [waChannel, setWaChannel] = useState<NotifyChannel>('email');
  const [waNewPhone, setWaNewPhone] = useState('');
  const [waNewLabel, setWaNewLabel] = useState('');
  const [waAdding, setWaAdding] = useState(false);
  const [waError, setWaError] = useState('');

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
      p_is_household_admin: role === 'household_admin',
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
    u.is_admin
      ? 'admin'
      : u.is_household_admin
      ? 'household_admin'
      : u.is_contractor
      ? 'contractor'
      : 'regular';

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
            is_household_admin: newUserRole === 'household_admin',
            preferred_language: newUserLanguage,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || t('admin.failedCreate'));
      } else {
        // The auto-assign trigger has been dropped (v9.0) so a fresh
        // auth.users row arrives with zero household memberships. We
        // insert exactly the rows the admin checked — this is the only
        // place new memberships come from on user creation.
        const createdUserId = (result && (result.user?.id || result.user_id || result.id)) as string | undefined;
        if (createdUserId && newUserHouseholdIds.length > 0) {
          for (const householdId of newUserHouseholdIds) {
            const { error: assignError } = await supabase.rpc('admin_add_household_member_by_id', {
              p_household_id: householdId,
              p_user_id: createdUserId,
              p_role: 'member',
            });
            if (assignError) throw assignError;
          }
        }

        setShowCreateModal(false);
        setNewUserId('');
        setNewUserPassword('');
        setNewUserRole('regular');
        setNewUserLanguage('en');
        setNewUserHouseholdIds([]);
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

  const openWhatsAppModal = async (userId: string, username: string) => {
    setSelectedUserId(userId);
    setSelectedUserUsername(username);
    setWaNewPhone('');
    setWaNewLabel('');
    setWaError('');
    setError('');

    const [phonesRes, profileRes] = await Promise.all([
      supabase
        .from('user_phone_numbers')
        .select('id, user_id, phone, label, created_at')
        .eq('user_id', userId)
        .order('created_at'),
      supabase.from('user_profiles').select('notify_channel').eq('id', userId).maybeSingle(),
    ]);
    setWaPhones((phonesRes.data ?? []) as PhoneNumberRow[]);
    setWaChannel(((profileRes.data?.notify_channel as NotifyChannel | undefined) ?? 'email'));
    setShowWhatsAppModal(true);
  };

  const addWaPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    const phone = waNewPhone.replace(/[\s()-]/g, '');
    if (!PHONE_E164_RE.test(phone)) {
      setWaError(t('whatsapp.phoneInvalid'));
      return;
    }
    setWaAdding(true);
    setWaError('');
    const { error: insertError } = await supabase.from('user_phone_numbers').insert({
      user_id: selectedUserId,
      phone,
      label: waNewLabel.trim() || null,
    });
    setWaAdding(false);
    if (insertError) {
      setWaError(
        insertError.message.toLowerCase().includes('duplicate') || insertError.code === '23505'
          ? t('whatsapp.phoneDuplicate')
          : insertError.message
      );
      return;
    }
    setWaNewPhone('');
    setWaNewLabel('');
    const { data } = await supabase
      .from('user_phone_numbers')
      .select('id, user_id, phone, label, created_at')
      .eq('user_id', selectedUserId)
      .order('created_at');
    setWaPhones((data ?? []) as PhoneNumberRow[]);
  };

  const removeWaPhone = async (id: string) => {
    setWaError('');
    const { error: deleteError } = await supabase.from('user_phone_numbers').delete().eq('id', id);
    if (deleteError) {
      setWaError(deleteError.message);
      return;
    }
    setWaPhones(prev => prev.filter(p => p.id !== id));
  };

  const openHouseholdModal = async (userId: string, username: string) => {
    setSelectedUserId(userId);
    setSelectedUserUsername(username);
    setError('');

    const [householdsRes, memberRes] = await Promise.all([
      supabase.from('households').select('id, name').order('name'),
      supabase.from('household_members').select('household_id').eq('user_id', userId),
    ]);

    if (householdsRes.data) setHouseholds(householdsRes.data);
    if (memberRes.data) setSelectedHouseholdIds(memberRes.data.map(m => m.household_id));

    // Open modal only after data is loaded so Save can't fire on stale state.
    setShowHouseholdModal(true);
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
          const { error: removeError } = await supabase.rpc('admin_remove_household_member', {
            p_member_id: membership.id,
          });
          if (removeError) throw removeError;
        }
      }

      for (const householdId of toAdd) {
        const { error: addError } = await supabase.rpc('admin_add_household_member_by_id', {
          p_household_id: householdId,
          p_user_id: selectedUserId,
          p_role: 'member',
        });
        if (addError) throw addError;
      }

      setShowHouseholdModal(false);
      setSelectedUserId('');
      setSelectedUserUsername('');
      setSelectedHouseholdIds([]);
      await loadUsers();
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
            onClick={async () => {
              setError('');
              const { data: hh } = await supabase
                .from('households')
                .select('id, name')
                .order('name');
              const list = (hh || []) as Household[];
              setHouseholds(list);
              // Start with no households selected so a new user only ever
              // gets the access the admin explicitly grants here. Use
              // "Select all" if everyone-everywhere is genuinely intended.
              setNewUserHouseholdIds([]);
              setShowCreateModal(true);
            }}
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
                      {user.is_household_admin && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
                          <Shield className="w-3 h-3" />
                          {t('admin.roleHouseholdAdmin')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {t('admin.joined', { date: new Date(user.created_at).toLocaleDateString(locale) })}
                      <span className="mx-1.5 text-slate-300">·</span>
                      {user.last_sign_in_at
                        ? t('admin.lastSignIn', {
                            date: new Date(user.last_sign_in_at).toLocaleString(locale, {
                              year: 'numeric', month: 'numeric', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            }),
                          })
                        : t('admin.lastSignInNever')}
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
                          onClick={() => openWhatsAppModal(user.id, user.username)}
                          className="flex items-center gap-2 px-3 py-2 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs font-medium rounded-lg transition-all"
                          title={t('whatsapp.adminModalTitle')}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          {t('whatsapp.manageButton')}
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
                        <button
                          onClick={() => openWhatsAppModal(user.id, user.username)}
                          disabled={isLoading}
                          className="p-2 hover:bg-green-50 rounded-lg transition-all disabled:opacity-50"
                          title={t('whatsapp.adminModalTitle')}
                        >
                          <MessageCircle className="w-4 h-4 text-green-600" />
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
                          <option value="household_admin">{t('admin.roleHouseholdAdmin')}</option>
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
                  <option value="household_admin">{t('admin.roleHouseholdAdminLong')}</option>
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

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-slate-700">
                    {t('admin.users.assignHouseholds')}
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewUserHouseholdIds(households.map((h) => h.id))}
                      className="text-xs text-emerald-700 hover:text-emerald-800 font-medium"
                    >
                      {t('admin.users.selectAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewUserHouseholdIds([])}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium"
                    >
                      {t('admin.users.selectNone')}
                    </button>
                  </div>
                </div>
                {households.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">{t('admin.users.noHouseholdsYet')}</p>
                ) : (
                  <div className="max-h-48 overflow-y-auto bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1">
                    {households.map((h) => {
                      const checked = newUserHouseholdIds.includes(h.id);
                      return (
                        <label
                          key={h.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer hover:bg-white transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setNewUserHouseholdIds((prev) =>
                                prev.includes(h.id) ? prev.filter((x) => x !== h.id) : [...prev, h.id]
                              )
                            }
                            className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-slate-700">{h.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-slate-500 mt-1">{t('admin.users.assignHouseholdsHint')}</p>
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

      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl">
            <div className="p-6 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{t('whatsapp.adminModalTitle')}</h3>
                  <p className="text-sm text-slate-500 mt-1">{selectedUserUsername}</p>
                </div>
                <button
                  onClick={() => setShowWhatsAppModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-all"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-500">
                {t('whatsapp.notifyPref')}:{' '}
                <span className="font-medium text-slate-700">
                  {t(waChannel === 'email' ? 'whatsapp.channelEmail' : waChannel === 'whatsapp' ? 'whatsapp.channelWhatsapp' : 'whatsapp.channelBoth')}
                </span>
              </p>

              {waPhones.length > 0 ? (
                <ul className="space-y-1.5">
                  {waPhones.map(p => (
                    <li key={p.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-xl px-3 py-2">
                      <MessageCircle className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                      <span className="flex-1 font-medium text-slate-700 truncate">{p.phone}</span>
                      {p.label && <span className="text-xs text-slate-400 italic">{p.label}</span>}
                      <button
                        onClick={() => removeWaPhone(p.id)}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title={t('whatsapp.removePhone')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">{t('whatsapp.noNumberLinked')}</p>
              )}

              <form onSubmit={addWaPhone} className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="tel"
                    value={waNewPhone}
                    onChange={e => setWaNewPhone(e.target.value)}
                    placeholder={t('whatsapp.phonePlaceholder')}
                    className="flex-1 min-w-0 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                    required
                  />
                  <input
                    type="text"
                    value={waNewLabel}
                    onChange={e => setWaNewLabel(e.target.value)}
                    placeholder={t('whatsapp.labelPlaceholder')}
                    className="w-28 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                  />
                </div>
                <p className="text-xs text-slate-500">{t('whatsapp.phoneHint')}</p>
                {waError && <p className="text-xs text-red-600">{waError}</p>}
                <button
                  type="submit"
                  disabled={waAdding || !waNewPhone.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
                >
                  {waAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('whatsapp.addPhone')}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
