import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { UserRole } from '../types/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { session, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div
          className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
          role="status"
          aria-label="Loading"
        />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole === 'admin') {
    if (role !== 'admin') {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  if (requiredRole === 'member') {
    if (role !== 'admin' && role !== 'member') {
      return <Navigate to="/unauthorized" replace />;
    }
  }

  return <>{children}</>;
}
