import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  credits: number;
  refreshCredits: () => Promise<void>;
  approvalStatus: 'pending' | 'approved' | 'rejected' | null;
  approvalChecked: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(0);
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [approvalChecked, setApprovalChecked] = useState(false);

  const refreshUser = async () => {
    if (!user) {
      setApprovalStatus(null);
      setApprovalChecked(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('credits_remaining, approval_status')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading user record:', error);
      }

      if (data) {
        setCredits(data.credits_remaining ?? 0);
        setApprovalStatus((data.approval_status as any) ?? null);
      } else {
        // No row yet — treat as pending until created by trigger
        setApprovalStatus('pending');
      }
    } catch (err) {
      console.error('Error refreshing user:', err);
    } finally {
      setApprovalChecked(true);
    }
  };

  const refreshCredits = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('users')
      .select('credits_remaining, approval_status')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setCredits(data.credits_remaining ?? 0);
      setApprovalStatus((data.approval_status as any) ?? approvalStatus);
      setApprovalChecked(true);
    }
  };

  useEffect(() => {
    supabase.auth.getSession()
      .then(async ({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
        // Load user record (credits + approval)
        setApprovalChecked(false);
        await refreshUser();
        setLoading(false);
      })
      .catch((error) => {
        console.error('Error getting session:', error);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setApprovalChecked(false);
      await refreshUser();
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      void refreshCredits();
    }
  }, [user]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name
        }
      }
    });
    if (error) throw error;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      signIn,
      signUp,
      signOut,
      credits,
      refreshCredits,
      approvalStatus,
      approvalChecked,
      refreshUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
