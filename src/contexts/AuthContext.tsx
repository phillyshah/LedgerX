import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isRecoveryMode: boolean;
  signUp: (username: string, password: string, realEmail?: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  requestPasswordReset: (username: string) => Promise<{ sent: boolean; noEmail: boolean }>;
  resetPassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);

  const checkAdminStatus = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('is_admin')
      .eq('user_id', userId)
      .maybeSingle();

    setIsAdmin(data?.is_admin === true);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        checkAdminStatus(session.user.id).then(() => setLoading(false));
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
          await checkAdminStatus(session.user.id);
        } else {
          setIsAdmin(false);
        }
      })();
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (username: string, password: string, realEmail?: string) => {
    const email = `${username}@ledgerx.local`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          ...(realEmail ? { real_email: realEmail } : {}),
        }
      }
    });
    if (error) throw error;
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
    setIsRecoveryMode(false);
  };

  return (
    <AuthContext.Provider value={{
      user, session, loading, isAdmin, isRecoveryMode,
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
