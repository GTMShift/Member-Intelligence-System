import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { MemberProfileCard } from './components/MemberProfileCard';
import { MemberSearchPanel } from './components/MemberSearchPanel';
import { DuplicateFlagAlerts } from './components/DuplicateFlagAlerts';
import { HeaderActions } from './components/HeaderActions';
import { ProfileStalenessBanner } from './components/ProfileStalenessBanner';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthContext, useAuth } from './context/authShared';
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

export default App;