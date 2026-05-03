import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, Eye, EyeOff, Mail, Lock, User, Languages, Plus, Trash2, Check, Loader2 } from 'lucide-react';
import { useT } from '../hooks/useT';
import { LANGUAGES, type Language } from '../i18n';
import { useSenderEmails } from '../hooks/useEmailInbox';
import { useEscapeClose } from '../hooks/useEscapeClose';

interface UserSettingsProps {
  onClose: () => void;
}

export function UserSettings({ onClose }: UserSettingsProps) {
  const { user, preferredLanguage, setPreferredLanguage } = useAuth();
  const { t } = useT();
  useEscapeClose(onClose);
  const [username, setUsername] = useState('');
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [emailLoading, setEmailLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [emailMessage, setEmailMessage] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [loading, setLoading] = useState(true);
  const [senderRefresh, setSenderRefresh] = useState(0);
  const { emails: senderEmails, add: addSender, remove: removeSender } = useSenderEmails(senderRefresh);
  const [newSenderEmail, setNewSenderEmail] = useState('');
  const [newSenderLabel, setNewSenderLabel] = useState('');
  const [senderAdding, setSenderAdding] = useState(false);
  const [senderError, setSenderError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('username, real_email')
        .eq('id', user.id)
        .maybeSingle();

      if (data) {
        setUsername(data.username);
        setCurrentEmail(data.real_email);
      }
      setLoading(false);
    })();
  }, [user]);

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailMessage('');
    setEmailLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error(t('admin.noSession'));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/update-user-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ real_email: newEmail }),
        }
      );

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || t('settings.failedEmail'));

      setCurrentEmail(newEmail);
      setNewEmail('');
      setEmailMessage(t('settings.emailUpdated'));
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : t('settings.failedEmail'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordMessage('');

    if (newPassword !== confirmPassword) {
      setPasswordError(t('settings.passwordsMismatch'));
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError(t('settings.passwordTooShort'));
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(t('settings.passwordUpdated'));
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : t('settings.failedPassword'));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-900">{t('settings.title')}</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-center">
            <div className="w-8 h-8 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : (
          <div className="p-6 space-y-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Languages className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">{t('settings.language')}</h3>
              </div>
              <select
                value={preferredLanguage}
                onChange={(e) => void setPreferredLanguage(e.target.value as Language)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {LANGUAGES.map(l => (
                  <option key={l.code} value={l.code}>{l.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-2">{t('settings.languageHelp')}</p>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <User className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">{t('settings.profile')}</h3>
              </div>
              <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">{t('settings.username')}</span>
                  <span className="text-sm font-medium text-slate-900">{username}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">{t('settings.email')}</span>
                  <span className="text-sm font-medium text-slate-900">
                    {currentEmail || <span className="text-slate-400">{t('settings.notSet')}</span>}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Mail className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">
                  {currentEmail ? t('settings.updateEmail') : t('settings.addEmail')}
                </h3>
              </div>
              {!currentEmail && (
                <p className="text-sm text-amber-600 bg-amber-50 rounded-xl p-3 mb-4">
                  {t('settings.addEmailHelp')}
                </p>
              )}
              <form onSubmit={handleUpdateEmail} className="space-y-3">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  placeholder={t('auth.emailPlaceholder')}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
                {emailError && <p className="text-sm text-red-600">{emailError}</p>}
                {emailMessage && <p className="text-sm text-emerald-600">{emailMessage}</p>}
                <button
                  type="submit"
                  disabled={emailLoading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {emailLoading ? t('settings.updating') : currentEmail ? t('settings.updateEmail') : t('settings.addEmail')}
                </button>
              </form>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Lock className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">{t('settings.changePassword')}</h3>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder={t('settings.newPassword')}
                    className="w-full px-4 py-3 pr-12 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-slate-100 rounded-lg transition-all"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-slate-500" />
                    ) : (
                      <Eye className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  placeholder={t('settings.confirmPassword')}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:border-transparent transition-all"
                />
                {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                {passwordMessage && <p className="text-sm text-emerald-600">{passwordMessage}</p>}
                <button
                  type="submit"
                  disabled={passwordLoading}
                  className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {passwordLoading ? t('settings.updating') : t('settings.changePassword')}
                </button>
              </form>
            </div>


            {/* ── Email Forwarding ── */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-5 h-5 text-slate-600" />
                <h3 className="text-lg font-semibold text-slate-900">{t('inbox.senderEmailsTitle')}</h3>
              </div>
              <p className="text-xs text-slate-500 mb-4">{t('inbox.senderEmailsHelp')}</p>

              {senderEmails.length > 0 && (
                <ul className="space-y-1.5 mb-3">
                  {senderEmails.map(se => (
                    <li key={se.id} className="flex items-center gap-2 text-sm bg-slate-50 rounded-xl px-3 py-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      <span className="flex-1 font-medium text-slate-700 truncate">{se.email}</span>
                      {se.label && <span className="text-xs text-slate-400 italic">{se.label}</span>}
                      <button
                        onClick={async () => { await removeSender(se.id); setSenderRefresh(r => r + 1); }}
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title={t('inbox.discard')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!newSenderEmail.trim()) return;
                  setSenderAdding(true);
                  setSenderError('');
                  const err = await addSender(newSenderEmail, newSenderLabel);
                  setSenderAdding(false);
                  if (err) {
                    setSenderError(err.message.includes('unique') ? t('inbox.senderDuplicate') : err.message);
                  } else {
                    setNewSenderEmail('');
                    setNewSenderLabel('');
                    setSenderRefresh(r => r + 1);
                  }
                }}
                className="space-y-2"
              >
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newSenderEmail}
                    onChange={e => setNewSenderEmail(e.target.value)}
                    placeholder={t('inbox.senderEmailPlaceholder')}
                    className="flex-1 min-w-0 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                    required
                  />
                  <input
                    type="text"
                    value={newSenderLabel}
                    onChange={e => setNewSenderLabel(e.target.value)}
                    placeholder={t('inbox.senderLabelPlaceholder')}
                    className="w-28 px-3 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-600 text-sm"
                  />
                </div>
                {senderError && <p className="text-xs text-red-600">{senderError}</p>}
                <button
                  type="submit"
                  disabled={senderAdding || !newSenderEmail.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition-all disabled:opacity-50"
                >
                  {senderAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {t('inbox.addSender')}
                </button>
              </form>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
