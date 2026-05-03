import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../hooks/useT';
import { Eye, EyeOff, HelpCircle, ArrowLeft, Sparkles, Compass } from 'lucide-react';
import { HelpModal } from './HelpModal';
import { LoginWhatsNewModal } from './LoginWhatsNewModal';
import { LogoText } from './LogoText';
import { LANGUAGES, type Language } from '../i18n';
import { APP_VERSION } from '../version';

const WalkthroughModal = lazy(() => import('./WalkthroughModal').then(m => ({ default: m.WalkthroughModal })));

const TOUR_SEEN_KEY = 'ledgerx:tourSeen';

type AuthMode = 'signin' | 'signup';

export function AuthForm() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Auto-open the walkthrough on first visit (per device). The flag is also
  // set when the user closes the tour, so we only nag them once.
  useEffect(() => {
    try {
      if (!localStorage.getItem(TOUR_SEEN_KEY)) setShowTour(true);
    } catch {
      // Storage may be disabled in private mode — just skip the auto-open.
    }
  }, []);

  const closeTour = () => {
    setShowTour(false);
    try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch { /* ignore */ }
  };
  const [forgotUsername, setForgotUsername] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const { signIn, signUp, requestPasswordReset, preferredLanguage, setPreferredLanguage } = useAuth();
  const [signupLanguage, setSignupLanguage] = useState<Language>(preferredLanguage);
  const { t } = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'signup') {
        await signUp(username, password, email || undefined, signupLanguage);
      } else {
        await signIn(username, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error.generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResetMessage('');
    setLoading(true);

    try {
      const result = await requestPasswordReset(forgotUsername);
      if (result.noEmail) {
        setResetMessage(t('auth.resetNoEmail'));
      } else {
        setResetMessage(t('auth.resetSent'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.error.generic'));
    } finally {
      setLoading(false);
    }
  };

  const onHeaderLanguageChange = (lang: Language) => {
    // Pre-auth language switch — no user yet, just update state + localStorage.
    void setPreferredLanguage(lang);
    setSignupLanguage(lang);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-900 to-green-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-600 rounded-2xl mb-4 shadow-lg shadow-green-900/30">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 3C5.44772 3 5 3.44772 5 4V20C5 20.5523 5.44772 21 6 21H8V3H6Z" fill="white" fillOpacity="0.9"/>
              <path d="M10 3V21H18C18.5523 21 19 20.5523 19 20V4C19 3.44772 18.5523 3 18 3H10Z" fill="white" fillOpacity="0.3"/>
              <line x1="12" y1="7" x2="17" y2="7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="12" y1="11" x2="17" y2="11" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="12" y1="15" x2="15" y2="15" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            <LogoText betaClassName="text-green-300" />
          </h1>
          <p className="text-green-200">{t('auth.tagline')}</p>
        </div>

        <div className="bg-green-800 rounded-3xl shadow-xl p-8">
          {showForgotPassword ? (
            <>
              <button
                type="button"
                onClick={() => { setShowForgotPassword(false); setResetMessage(''); setError(''); }}
                className="flex items-center gap-2 text-green-300 hover:text-white mb-4 transition-all text-sm"
              >
                <ArrowLeft className="w-4 h-4" />
                {t('auth.backToSignIn')}
              </button>
              <h2 className="text-xl font-bold text-white mb-2">{t('auth.resetPassword')}</h2>
              <p className="text-sm text-green-300 mb-6">{t('auth.resetPrompt')}</p>

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="forgot-username" className="block text-sm font-medium text-green-100 mb-2">
                    {t('auth.userId')}
                  </label>
                  <input
                    id="forgot-username"
                    type="text"
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-white border border-green-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-slate-900 placeholder-slate-500"
                    placeholder={t('auth.userIdPlaceholder')}
                  />
                </div>

                {error && (
                  <div className="p-3 bg-red-900 border border-red-700 rounded-xl">
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                {resetMessage && (
                  <div className="p-3 bg-green-900 border border-green-600 rounded-xl">
                    <p className="text-sm text-green-200">{resetMessage}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {loading ? t('common.loading') : t('auth.sendResetLink')}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="flex gap-1 mb-6 bg-green-700 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setMode('signin')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-medium transition-all text-sm ${
                    mode === 'signin'
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-green-300 hover:text-white'
                  }`}
                >
                  {t('auth.signIn')}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('signup')}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-medium transition-all text-sm ${
                    mode === 'signup'
                      ? 'bg-green-600 text-white shadow-sm'
                      : 'text-green-300 hover:text-white'
                  }`}
                >
                  {t('auth.signUp')}
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="username" className="block text-sm font-medium text-green-100 mb-2">
                    {t('auth.userId')}
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    pattern="[a-zA-Z0-9_]{3,20}"
                    className="w-full px-4 py-3 bg-white border border-green-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-slate-900 placeholder-slate-500"
                    placeholder={t('auth.userIdPlaceholder')}
                  />
                  <p className="text-xs text-green-300 mt-1">{t('auth.userIdHelp')}</p>
                </div>

                {mode === 'signup' && (
                  <>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-green-100 mb-2">
                        {t('auth.email')} <span className="text-green-400 font-normal">({t('common.optional')})</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        className="w-full px-4 py-3 bg-white border border-green-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-slate-900 placeholder-slate-500"
                        placeholder={t('auth.emailPlaceholder')}
                      />
                      <p className="text-xs text-green-300 mt-1">{t('auth.emailHelp')}</p>
                    </div>

                    <div>
                      <label htmlFor="language" className="block text-sm font-medium text-green-100 mb-2">
                        {t('common.language')}
                      </label>
                      <select
                        id="language"
                        value={signupLanguage}
                        onChange={(e) => onHeaderLanguageChange(e.target.value as Language)}
                        className="w-full px-4 py-3 bg-white border border-green-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-slate-900"
                      >
                        {LANGUAGES.map(l => (
                          <option key={l.code} value={l.code}>{l.label}</option>
                        ))}
                      </select>
                    </div>
                  </>
                )}

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-green-100 mb-2">
                    {t('auth.password')}
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      className="w-full px-4 py-3 pr-12 bg-white border border-green-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all text-slate-900 placeholder-slate-500"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-2 hover:bg-green-50 rounded-lg transition-all"
                      aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4 text-slate-600" />
                      ) : (
                        <Eye className="w-4 h-4 text-slate-600" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 bg-red-900 border border-red-700 rounded-xl">
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {loading ? t('common.loading') : mode === 'signup' ? t('auth.signUp') : t('auth.signIn')}
                </button>

                {mode === 'signin' && (
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => { setShowForgotPassword(true); setError(''); }}
                      className="text-sm text-green-300 hover:text-white transition-all"
                    >
                      {t('auth.forgotPassword')}
                    </button>
                  </div>
                )}
              </form>

              {/* Pre-auth language switcher (sign-in panel) */}
              {mode === 'signin' && (
                <div className="mt-5 flex justify-center gap-2 text-xs">
                  {LANGUAGES.map(l => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => onHeaderLanguageChange(l.code)}
                      className={`px-2 py-1 rounded-md transition-all ${
                        preferredLanguage === l.code
                          ? 'bg-green-600 text-white'
                          : 'text-green-300 hover:text-white'
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Take a tour — promotional CTA for new users */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowTour(true)}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-emerald-400/15 border border-emerald-300/30 hover:bg-emerald-400/25 hover:border-emerald-300/50 transition-all group"
          >
            <span className="w-7 h-7 rounded-xl bg-emerald-400/25 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-400/40 transition-all">
              <Compass className="w-4 h-4 text-emerald-300" />
            </span>
            <span className="text-sm font-semibold text-emerald-100 group-hover:text-white transition-all">
              {t('tour.takeTour')}
            </span>
            <span className="ml-auto text-xs bg-emerald-400/30 text-emerald-100 px-2 py-0.5 rounded-full font-medium">
              {t('tour.takeTourBadge')}
            </span>
          </button>
        </div>

        {/* What's New — pre-login CTA */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowWhatsNew(true)}
            className="w-full flex items-center justify-center gap-2.5 px-5 py-3 rounded-2xl bg-amber-400/15 border border-amber-300/30 hover:bg-amber-400/25 hover:border-amber-300/50 transition-all group"
          >
            <span className="w-7 h-7 rounded-xl bg-amber-400/25 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-400/40 transition-all">
              <Sparkles className="w-4 h-4 text-amber-300" />
            </span>
            <span className="text-sm font-semibold text-amber-200 group-hover:text-amber-100 transition-all">
              {t('auth.whatsNew')}
            </span>
            <span className="ml-auto text-xs bg-amber-400/30 text-amber-200 px-2 py-0.5 rounded-full font-medium">
              {t('auth.whatsNewBadge')}
            </span>
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-green-200 hover:text-white hover:bg-green-700/50 rounded-xl transition-all"
          >
            <HelpCircle className="w-4 h-4" />
            {t('auth.needHelp')}
          </button>
          <span className="text-green-700 text-xs">·</span>
          <p className="text-xs text-green-300/60">{APP_VERSION}</p>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
      {showWhatsNew && (
        <LoginWhatsNewModal
          onClose={() => setShowWhatsNew(false)}
          language={preferredLanguage}
        />
      )}
      <Suspense fallback={null}>
        {showTour && <WalkthroughModal onClose={closeTour} />}
      </Suspense>
    </div>
  );
}
