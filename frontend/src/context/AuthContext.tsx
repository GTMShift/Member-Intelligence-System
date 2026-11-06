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
  AuthContext,
  toUserRole,
} from './authShared';

/** True while the URL still has OAuth callback tokens/codes that Supabase
 *  hasn't finished consuming yet — a null getSession() during this window is
 *  a race, not a real signed-out state. */
function hasPendingOAuthCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const hash = window.location.hash;
  const search = window.location.search;
  return (
    hash.includes('access_token') ||
    hash.includes('refresh_token') ||
    search.includes('code=') ||
    search.includes('error=')
  );
}

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
  // Serialize syncAuthState so a stale null getSession() can't finish after a
  // real SIGNED_IN and wipe the session (common on first OAuth redirect).
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  const resolveMemberId = useCallback(async (profileId: string): Promise<string | null> => {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('member_id')
      .eq('id', profileId)
      .maybeSingle();
    if (error) {
      console.error('Failed to load trusted member link:', error.message);
      return null;
    }
    return profile?.member_id ?? null;
  }, []);

  useEffect(() => {
    let mounted = true;

    const syncAuthState = async (
      currentSession: Session | null,
      event?: string,
    ) => {
      // Ignore a transient null session while OAuth is still finishing — that
      // was wiping auth on first Vercel login and sending members to Access Denied.
      if (!currentSession && hasPendingOAuthCallback()) {
        return;
      }

      // A stale getSession()/INITIAL_SESSION null must not overwrite a session
      // we already established from SIGNED_IN (classic first-login race).
      if (
        !currentSession &&
        currentUserIdRef.current &&
        event !== 'SIGNED_OUT'
      ) {
        if (mounted) setLoading(false);
        return;
      }

      currentUserIdRef.current = currentSession?.user?.id ?? null;
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        let { data: existingProfile, error: fetchError } = await supabase
          .from('profiles')
          .select('role, member_id')
          .eq('id', currentSession.user.id)
          .maybeSingle();

        // The auth trigger creates member profiles. Retry briefly for trigger
        // timing; the browser never creates a profile or assigns its role.
        if (!existingProfile) {
          const retry = await supabase
            .from('profiles')
            .select('role, member_id')
            .eq('id', currentSession.user.id)
            .maybeSingle();
          existingProfile = retry.data;
          fetchError = retry.error;
        }

        if (fetchError) {
          console.error('Profile role lookup failed:', fetchError.message);
        }
        // A missing profile is treated as a non-admin session in the UI. The
        // backend independently requires a trusted profiles row for access.
        const resolvedRole: UserRole = existingProfile?.role
          ? toUserRole(existingProfile.role)
          : 'member';

        if (mounted) {
          setRole(resolvedRole);
          const linkedMemberId = await resolveMemberId(currentSession.user.id);
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

    const enqueueSync = (currentSession: Session | null, event?: string) => {
      syncChainRef.current = syncChainRef.current
        .then(() => syncAuthState(currentSession, event))
        .catch((error) => {
          console.error('Auth sync failed:', error);
          if (mounted) setLoading(false);
        });
      return syncChainRef.current;
    };

    // Prefer onAuthStateChange (emits INITIAL_SESSION) as the source of truth.
    // Still call getSession for older clients, but serialize both through the queue.
    void supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      void enqueueSync(currentSession, 'GET_SESSION');
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
      if (isSameUser && event === 'TOKEN_REFRESHED') {
        setSession(currentSession);
        return;
      }

      // Don't bounce UI into a loading spinner for a null event that we'll
      // ignore because we already have a signed-in user.
      const willIgnoreStaleNull =
        !currentSession &&
        !!currentUserIdRef.current &&
        event !== 'SIGNED_OUT';

      if (event !== 'TOKEN_REFRESHED' && !willIgnoreStaleNull) {
        setLoading(true);
      }
      void enqueueSync(currentSession, event);
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
