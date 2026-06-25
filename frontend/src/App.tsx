import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MemberProfileCard } from './components/MemberProfileCard';
import { MemberSearchPanel } from './components/MemberSearchPanel';
import { DuplicateFlagAlerts } from './components/DuplicateFlagAlerts';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthContext, useAuth } from './context/AuthContext';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { LoginPage } from './pages/LoginPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import type { UserRole } from './types/api';

interface DashboardLocationState {
  selectedMemberId?: string;
}

function PortalRoleOverride({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const overriddenAuth = { ...auth, role: 'member' as UserRole, isAdmin: false };
  return (
    <AuthContext.Provider value={overriddenAuth}>{children}</AuthContext.Provider>
  );
}

function RoleBasedRedirect() {
  const { role, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      </div>
    );
  }

  if (role === 'admin') return <Navigate to="/" replace />;
  if (role === 'member') return <Navigate to="/portal" replace />;
  return <Navigate to="/unauthorized" replace />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route path="/redirect" element={<RoleBasedRedirect />} />
        <Route
          path="/"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:id"
          element={
            <ProtectedRoute requiredRole="admin">
              <CompanyPageLayout />
            </ProtectedRoute>
          }
        />
        <Route
          path="/portal"
          element={
            <ProtectedRoute requiredRole="member">
              <MemberPortalPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function DashboardPage() {
  return <MemberDirectoryLayout subtitle="Admin dashboard" showDuplicateAlerts />;
}

function CompanyPageLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">Company details</p>
          </div>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 bg-slate-50 lg:min-h-[calc(100vh-4.5rem)]">
        <CompanyDetailPage />
      </main>
    </div>
  );
}

function MemberPortalPage() {
  return <MemberDirectoryLayout subtitle="Member portal" portalView />;
}

function MemberDirectoryLayout({
  subtitle,
  showDuplicateAlerts = false,
  portalView = false,
}: {
  subtitle: string;
  showDuplicateAlerts?: boolean;
  portalView?: boolean;
}) {
  const location = useLocation();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    const state = location.state as DashboardLocationState | null;
    if (state?.selectedMemberId) {
      setSelectedMemberId(state.selectedMemberId);
    }
  }, [location.state]);

  const handleViewExistingMember = (memberId: string) => {
    setSelectedMemberId(memberId);
  };

  const directoryContent = (
    <>
      <aside className="w-full border-b border-slate-200 bg-slate-50 lg:w-[22rem] lg:shrink-0 lg:border-b-0 lg:border-r xl:w-[26rem]">
        <div className="h-[28rem] lg:h-[calc(100vh-4.5rem)]">
          <MemberSearchPanel
            selectedMemberId={selectedMemberId}
            onSelectMember={setSelectedMemberId}
          />
        </div>
      </aside>

      <section className="min-h-[24rem] flex-1 bg-slate-50 lg:min-h-[calc(100vh-4.5rem)]">
        {selectedMemberId ? (
          <MemberProfileCard memberId={selectedMemberId} />
        ) : (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center">
              <p className="text-base font-medium text-slate-700">
                Select a member to view their profile
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Use search and filters to find members in the directory
              </p>
            </div>
          </div>
        )}
      </section>
    </>
  );

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">{subtitle}</p>
          </div>
          <HeaderActions />
        </div>
      </header>

      {showDuplicateAlerts && (
        <DuplicateFlagAlerts onViewExistingMember={handleViewExistingMember} />
      )}

      <main className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col lg:flex-row">
        {portalView ? (
          <PortalRoleOverride>{directoryContent}</PortalRoleOverride>
        ) : (
          directoryContent
        )}
      </main>
    </div>
  );
}

function HeaderActions() {
  const { user, signOut, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="flex items-center gap-4">
      {role === 'admin' && location.pathname === '/' && (
        <a
          href="/portal"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          View Member Portal
        </a>
      )}
      {role === 'admin' && location.pathname === '/portal' && (
        <a
          href="/"
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          View Admin Dashboard
        </a>
      )}
      {user?.email && (
        <span className="text-sm text-slate-600">{user.email}</span>
      )}
      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        Sign out
      </button>
    </div>
  );
}

export default App;
