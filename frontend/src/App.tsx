import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MemberProfileCard } from './components/MemberProfileCard';
import { MemberSearchPanel } from './components/MemberSearchPanel';
import { DuplicateFlagAlerts } from './components/DuplicateFlagAlerts';
import { ProfileStalenessBanner } from './components/ProfileStalenessBanner';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthContext, useAuth } from './context/AuthContext';
import { getMember } from './api/membersApi';
import { CompanyDetailPage } from './pages/CompanyDetailPage';
import { LoginPage } from './pages/LoginPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { MemberEntryPage } from './pages/MemberEntryPage';
import { SpeakerApplicationPage } from './pages/SpeakerApplicationPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SubstackImportPage } from './pages/SubstackImportPage';
import { CompleteProfilePage } from './pages/CompleteProfilePage';
import { MyProfilePage } from './pages/MyProfilePage';
import { fetchUnreadNotificationCount } from './api/notificationsApi';
import type { MemberDetail, UserRole } from './types/api';

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
          path="/complete-profile"
          element={
            <ProtectedRoute requiredRole="member">
              <CompleteProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-profile"
          element={
            <ProtectedRoute requiredRole="member">
              <MyProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/"
          element={
            <ProtectedRoute requiredRole="admin">
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/add-member"
          element={
            <ProtectedRoute requiredRole="admin">
              <MemberEntryPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/substack-import"
          element={
            <ProtectedRoute requiredRole="admin">
              <SubstackImportPage />
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
          path="/notifications"
          element={
            <ProtectedRoute requiredRole="admin">
              <NotificationsPage />
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
        <Route
          path="/portal/speaker-application"
          element={
            <ProtectedRoute requiredRole="member">
              <SpeakerApplicationPage />
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
  const [portalMember, setPortalMember] = useState<MemberDetail | null>(null);

  useEffect(() => {
    const state = location.state as DashboardLocationState | null;
    if (state?.selectedMemberId) {
      setSelectedMemberId(state.selectedMemberId);
    }
  }, [location.state]);

  useEffect(() => {
    if (!portalView || !selectedMemberId) {
      setPortalMember(null);
      return;
    }

    let cancelled = false;

    async function loadPortalMember() {
      try {
        const data = await getMember(selectedMemberId!, 'member');
        if (!cancelled) setPortalMember(data);
      } catch {
        if (!cancelled) setPortalMember(null);
      }
    }

    loadPortalMember();
    return () => {
      cancelled = true;
    };
  }, [portalView, selectedMemberId]);

  const handleViewExistingMember = (memberId: string) => {
    setSelectedMemberId(memberId);
  };

  const handleEnrich = async () => {
    if (!selectedMemberId) return;

    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/members/${selectedMemberId}/enrich`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_type: 'manual' }),
      },
    );
    if (response.ok) {
      alert('Profile enrichment started — your profile will be updated shortly');
    } else {
      alert('Enrichment failed — please try again later');
    }
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
          <div className="flex h-full flex-col">
            {portalView && portalMember && (
              <ProfileStalenessBanner
                member={portalMember}
                onEnrichClick={handleEnrich}
              />
            )}
            <div className="min-h-0 flex-1">
              <MemberProfileCard memberId={selectedMemberId} />
            </div>
          </div>
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

export function HeaderActions() {
  const { user, signOut, role, memberId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isMemberView = location.pathname === '/portal';
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (role !== 'admin') return;
    fetchUnreadNotificationCount().then(setUnreadCount);
  }, [role]);

  return (
    <div className="flex items-center gap-4">
      {role === 'admin' && (
        <Link
          to="/notifications"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.857 17.082a23.85 23.85 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 1 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m6.714 0a3 3 0 1 1-6.714 0m6.714 0a24.255 24.255 0 0 1-6.714 0"
            />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      )}
      {role === 'admin' && (
        <button
          type="button"
          onClick={() => navigate('/admin/add-member')}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          + Add member
        </button>
      )}
      {role === 'admin' && (
        <button
          type="button"
          onClick={() => navigate('/admin/substack-import')}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Import Substack CSV
        </button>
      )}
      {isMemberView && (
        <button
          type="button"
          onClick={() => navigate(memberId ? '/my-profile' : '/complete-profile')}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          My Profile
        </button>
      )}
      {isMemberView && (
        <button
          type="button"
          onClick={() => navigate('/portal/speaker-application')}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
        Apply to speak
        </button>
      )}
      {role === 'admin' && (
        <div className="relative flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
          <span
            aria-hidden="true"
            className={`absolute inset-y-0.5 w-[calc(50%-0.125rem)] rounded-md bg-white shadow-sm transition-transform duration-200 ease-out ${
              isMemberView ? 'translate-x-full' : 'translate-x-0'
            }`}
          />
          <button
            type="button"
            onClick={() => navigate('/')}
            className={`relative z-10 w-20 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              isMemberView ? 'text-slate-600 hover:text-slate-900' : 'text-slate-900'
            }`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className={`relative z-10 w-20 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              isMemberView ? 'text-slate-900' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Member
          </button>
        </div>
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