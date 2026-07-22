import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { UserRole } from '../types/api';
import {
  ADMIN_EMAILS,
  AuthContext,
  toUserRole,
} from './authShared';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('member');
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<Session['user'] | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Tracks the currently signed-in user's id outside of React state, so the
  // auth listener can tell "the user actually changed" apart from "Supabase
  // just silently refreshed the token" (which fires on every tab focus).
  const currentUserIdRef = useRef<string | null>(null);

  const resolveMemberId = useCallback(
    async (profileId: string, email: string | null | undefined): Promise<string | null> => {
      // Already linked — nothing to do.
      const { data: profile } = await supabase
        .from('profiles')
        .select('member_id')
        .eq('id', profileId)
        .maybeSingle();
      if (profile?.member_id) return profile.member_id;

      // Not linked yet — try auto-matching by email against an existing member.
      if (!email) return null;
      const { data: matchedMember } = await supabase
        .from('members')
        .select('id')
        .ilike('email', email.trim())
        .maybeSingle();

      if (matchedMember?.id) {
        await supabase.from('profiles').update({ member_id: matchedMember.id }).eq('id', profileId);
        return matchedMember.id;
      }

      return null; // genuinely no match — this person needs onboarding
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async (currentSession: Session | null) => {
      currentUserIdRef.current = currentSession?.user?.id ?? null;
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
                setMemberId(null);
                setLoading(false);
                window.location.href = '/unauthorized';
              }
              return;
            }
          }
        }

        if (resolvedRole && mounted) {
          setRole(resolvedRole);

          // Try to resolve a linked member record regardless of admin/member
          // role — an admin can also be a genuine member with their own
          // profile (viewable via the Admin/Member toggle's Member view).
          const linkedMemberId = await resolveMemberId(
            currentSession.user.id,
            currentSession.user.email,
          );
          if (mounted) setMemberId(linkedMemberId);
        }
      } else if (mounted) {
        setRole('member');
        setMemberId(null);
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
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      const incomingUserId = currentSession?.user?.id ?? null;
      const isSameUser = incomingUserId === currentUserIdRef.current;

      // A routine token refresh for the SAME user (e.g. triggered by the tab
      // regaining focus) shouldn't flip `loading` back to true — that
      // unmounts whatever page is showing via ProtectedRoute's spinner,
      // wiping in-progress form state or dismissed-notification state.
      // Only do the full resync for an actual sign-in/sign-out/user change.
      if (isSameUser && event !== 'SIGNED_OUT') {
        setSession(currentSession);
        return;
      }

      setLoading(true);
      void syncAuthState(currentSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [resolveMemberId]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
    setRole('member');
    setMemberId(null);
  }, []);

  const refreshMemberId = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('member_id').eq('id', user.id).maybeSingle();
    setMemberId(data?.member_id ?? null);
  }, [user]);

  const needsOnboarding = !loading && role === 'member' && !!user && memberId === null;

  const value = useMemo(
    () => ({
      role,
      isAdmin: role === 'admin',
      session,
      user,
      loading,
      memberId,
      needsOnboarding,
      signOut,
      refreshMemberId,
    }),
    [role, session, user, loading, memberId, needsOnboarding, signOut, refreshMemberId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
