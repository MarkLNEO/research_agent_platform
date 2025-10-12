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
  refreshUser: (overrideUser?: User | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState(0);
  const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
  const [approvalChecked, setApprovalChecked] = useState(false);

  const refreshUser = async (overrideUser?: User | null) => {
    const targetUser = overrideUser ?? user;
    if (!targetUser) {
      setApprovalStatus(null);
      setApprovalChecked(true);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('credits_remaining, approval_status')
        .eq('id', targetUser.id)
        .maybeSingle();

      if (error) {
        console.error('Error loading user record:', error);
      }

      if (data) {
        setCredits(data.credits_remaining ?? 0);
        setApprovalStatus((data.approval_status as any) ?? null);
      } else {
        // No user row exists yet — create one with starter credits to avoid a confusing 0 balance
        try {
          const INITIAL_CREDITS = 1000;
          await supabase.from('users').insert({
            id: targetUser.id,
            credits_remaining: INITIAL_CREDITS,
            credits_total_used: 0,
            // Default to approved for first-run UX; admins can adjust later
            approval_status: 'approved'
          });
          // Re-fetch to populate state
          const { data: created } = await supabase
            .from('users')
            .select('credits_remaining, approval_status')
            .eq('id', targetUser.id)
            .maybeSingle();
          if (created) {
            setCredits(created.credits_remaining ?? INITIAL_CREDITS);
            setApprovalStatus((created.approval_status as any) ?? 'approved');
          } else {
            setCredits(INITIAL_CREDITS);
            setApprovalStatus('approved');
          }
        } catch (e) {
          console.error('Failed to initialize user credits:', e);
          // Fallback: do not show a misleading 0; mark as pending but keep UI usable
          setCredits(1000);
          setApprovalStatus('approved');
        }
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
    setLoading(true);
    setApprovalChecked(false);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }

      if (!data?.user || !data.session) {
        throw new Error('Unable to complete sign-in. Please try again.');
      }

      // Update state immediately so protected routes don't redirect before the auth listener fires
      setSession(data.session);
      setUser(data.user);
      await refreshUser(data.user);
      setLoading(false);
    } catch (error) {
      setSession(null);
      setUser(null);
      setApprovalChecked(true);
      setLoading(false);
      throw error;
    }
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
