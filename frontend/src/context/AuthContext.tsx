import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { UserRole } from '../types/api';

interface AuthContextValue {
  role: UserRole;
  setRole: (role: UserRole) => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('admin');

  const value = useMemo(
    () => ({
      role,
      setRole,
      isAdmin: role === 'admin',
    }),
    [role],
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
