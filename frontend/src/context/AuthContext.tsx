import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { UserRole } from '../types/api';

const ADMIN_EMAILS = [
  'vedanutheti@gmail.com',
  'bdb6@illinois.edu',
  'chloeat2@illinois.edu',
  'chris@solutionexec.com',
  'james@solutionexec.com',
  'jtran63@illinois.edu',
  'meghan@solutionexec.com',
  'vivaanb2@illinois.edu',
  'wchen236@illinois.edu',
];

interface AuthContextValue {
  role: UserRole;
  isAdmin: boolean;
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function toUserRole(role: string): UserRole {
  return role === 'admin' ? 'admin' : 'member';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('member');
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Session['user'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async (currentSession: Session | null) => {
      console.log('Session:', currentSession);

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        const isAdmin = ADMIN_EMAILS.includes(currentSession.user.email ?? '');
        let resolvedRole: UserRole | null = null;

        const { data: existingProfile, error: fetchError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', currentSession.user.id)
          .maybeSingle();

        console.log('Profile fetch result:', existingProfile);

        if (existingProfile?.role) {
          resolvedRole = toUserRole(existingProfile.role);
        } else {
          const insertResult = await supabase
            .from('profiles')
            .insert({
              id: currentSession.user.id,
              email: currentSession.user.email,
              full_name: currentSession.user.user_metadata?.full_name,
              avatar_url: currentSession.user.user_metadata?.avatar_url,
              role: isAdmin ? 'admin' : 'member',
            })
            .select('role')
            .single();

          console.log('Upsert result:', insertResult);

          if (insertResult.data?.role) {
            resolvedRole = toUserRole(insertResult.data.role);
          } else if (insertResult.error) {
            const { data: retryProfile, error: retryError } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', currentSession.user.id)
              .maybeSingle();

            if (retryProfile?.role) {
              resolvedRole = toUserRole(retryProfile.role);
            } else if (fetchError && insertResult.error && retryError) {
              await supabase.auth.signOut();
              if (mounted) {
                setSession(null);
                setUser(null);
                setRole('member');
                setLoading(false);
                window.location.href = '/unauthorized';
              }
              return;
            }
          }
        }

        if (resolvedRole && mounted) {
          setRole(resolvedRole);
        }
      } else if (mounted) {
        setRole('member');
      }

      if (mounted) {
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      void syncAuthState(currentSession);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setLoading(true);
      void syncAuthState(currentSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole('member');
  }, []);

  const value = useMemo(
    () => ({
      role,
      isAdmin: role === 'admin',
      session,
      user,
      loading,
      signOut,
    }),
    [role, session, user, loading, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
