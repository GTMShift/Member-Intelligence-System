import { createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import type { UserRole } from '../types/api';

export const ADMIN_EMAILS = [
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

export interface AuthContextValue {
  role: UserRole;
  isAdmin: boolean;
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** The linked members.id for this person, if any. Null means: authenticated,
   *  but not yet connected to a member record (needs onboarding). */
  memberId: string | null;
  /** True once auth/profile resolution has finished AND this is a member-role
   *  user with no linked member record yet — i.e. they should be sent to the
   *  "complete your profile" flow. */
  needsOnboarding: boolean;
  signOut: () => Promise<void>;
  /** Call after the onboarding form successfully links a new member, so the
   *  rest of the app immediately reflects the new memberId without a reload. */
  refreshMemberId: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function toUserRole(role: string): UserRole {
  return role === 'admin' ? 'admin' : 'member';
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
