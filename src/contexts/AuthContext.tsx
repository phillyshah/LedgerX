import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { isLanguage, type Language } from '../i18n';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isContractor: boolean;
  isHouseholdAdmin: boolean;
  preferredLanguage: Language;
  setPreferredLanguage: (lang: Language) => Promise<void>;
  isRecoveryMode: boolean;
  signUp: (username: string, password: string, realEmail?: string, preferredLanguage?: Language) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (username: string) => Promise<{ sent: boolean; noEmail: boolean }>;
  resetPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LANG_STORAGE_KEY = 'ledgerx.preferredLanguage';

function readStoredLanguage(): Language {
  try {
    const v = localStorage.getItem(LANG_STORAGE_KEY);
    return isLanguage(v) ? v : 'en';
  } catch {
    return 'en';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isContractor, setIsContractor] = useState(false);
  const [isHouseholdAdmin, setIsHouseholdAdmin] = useState(false);
  const [preferredLanguage, setPreferredLanguageState] = useState<Language>(readStoredLanguage());
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  const hydrateUserMeta = async (userId: string) => {
    const [{ data: roleData }, { data: profileData }] = await Promise.all([
      supabase.from('user_roles').select('is_admin, is_contractor, is_household_admin').eq('user_id', userId).maybeSingle(),
      supabase.from('user_profiles').select('preferred_language').eq('id', userId).maybeSingle(),
    ]);

    setIsAdmin(roleData?.is_admin === true);
    setIsContractor(roleData?.is_contractor === true);
    setIsHouseholdAdmin(roleData?.is_household_admin === true);

    const lang = profileData?.preferred_language;
    if (isLanguage(lang)) {
      setPreferredLanguageState(lang);
      try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* ignore */ }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        hydrateUserMeta(session.user.id).then(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryMode(true);
        }

        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await hydrateUserMeta(session.user.id);
        } else {
          setIsAdmin(false);
          setIsContractor(false);
          setIsHouseholdAdmin(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const setPreferredLanguage = async (lang: Language) => {
    setPreferredLanguageState(lang);
    try { localStorage.setItem(LANG_STORAGE_KEY, lang); } catch { /* ignore */ }
    if (user) {
      await supabase.from('user_profiles').update({ preferred_language: lang }).eq('id', user.id);
    }
  };

  const signUp = async (username: string, password: string, realEmail?: string, lang?: Language) => {
    const email = `${username}@ledgerx.local`;
    const language = lang ?? preferredLanguage;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          preferred_language: language,
          ...(realEmail ? { real_email: realEmail } : {}),
        }
      }
    });
    if (error) throw error;
    setPreferredLanguageState(language);
    try { localStorage.setItem(LANG_STORAGE_KEY, language); } catch { /* ignore */ }
  };

  const signIn = async (username: string, password: string) => {
    const { data: email, error: lookupError } = await supabase.rpc('get_user_email_by_username', { p_username: username });

    if (lookupError || !email) {
      throw new Error('Invalid username or password');
    }

    const { error } = await supabase.auth.signInWithPassword({ email: email as string, password });
    if (error) throw new Error('Invalid username or password');
  };

  const requestPasswordReset = async (username: string): Promise<{ sent: boolean; noEmail: boolean }> => {
    const { data: realEmail, error } = await supabase.rpc('get_real_email_by_username', { p_username: username });

    if (error || !realEmail) {
      return { sent: false, noEmail: true };
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(realEmail as string, {
      redirectTo: window.location.origin,
    });

    if (resetError) throw resetError;
    return { sent: true, noEmail: false };
  };

  const resetPassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setIsRecoveryMode(false);
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    setUser(null);
    setSession(null);
    setIsAdmin(false);
    setIsContractor(false);
    setIsHouseholdAdmin(false);
    setIsRecoveryMode(false);
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading,
      isAdmin, isContractor, isHouseholdAdmin,
      preferredLanguage, setPreferredLanguage,
      isRecoveryMode,
      signUp, signIn, signOut, requestPasswordReset, resetPassword,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
