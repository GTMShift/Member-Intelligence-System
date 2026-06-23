import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MemberProfileCard } from './components/MemberProfileCard';
import { MemberSearchPanel } from './components/MemberSearchPanel';
import { DuplicateFlagAlerts } from './components/DuplicateFlagAlerts';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './context/AuthContext';
import { supabase } from './lib/supabaseClient';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { LoginPage } from './pages/LoginPage';
import type { UserRole } from './types/api';

interface DashboardLocationState {
  selectedMemberId?: string;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/companies/:id"
          element={
            <ProtectedRoute>
              <CompanyPageLayout />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

function DashboardPage() {
  const { role, setRole, isAdmin } = useAuth();
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

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">Admin dashboard</p>
          </div>
          <HeaderActions role={role} onRoleChange={setRole} />
        </div>
      </header>

      {isAdmin && (
        <DuplicateFlagAlerts onViewExistingMember={handleViewExistingMember} />
      )}

      <main className="mx-auto flex w-full max-w-[90rem] flex-1 flex-col lg:flex-row">
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
      </main>
    </div>
  );
}

function CompanyPageLayout() {
  const { role, setRole } = useAuth();

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
          <HeaderActions role={role} onRoleChange={setRole} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 bg-slate-50 lg:min-h-[calc(100vh-4.5rem)]">
        <CompanyDetailPage />
      </main>
    </div>
  );
}

function HeaderActions({
  role,
  onRoleChange,
}: {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="flex items-center gap-4">
      <RoleToggle role={role} onChange={onRoleChange} />
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

function RoleToggle({
  role,
  onChange,
}: {
  role: UserRole;
  onChange: (role: UserRole) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500">View as</span>
      <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <button
          type="button"
          onClick={() => onChange('admin')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            role === 'admin'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Admin
        </button>
        <button
          type="button"
          onClick={() => onChange('member')}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            role === 'member'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Member
        </button>
      </div>
    </div>
  );
}

export default App;
