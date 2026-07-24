import { useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
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
import { SpeakerApplicationsAdminPage } from './pages/SpeakerApplicationAdminPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { SubstackImportPage } from './pages/SubstackImportPage';
import { CompleteProfilePage } from './pages/CompleteProfilePage';
import { MyProfilePage } from './pages/MyProfilePage';
import type { MemberDetail, UserRole } from './types/api';
import AnalyticsDashboard from './components/AnalyticsDashboard';

interface DashboardLocationState {
  selectedMemberId?: string;
  justCreated?: boolean;
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
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-charcoal/20 border-t-charcoal" />
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
          path="/admin/speaker-applications"
          element={
            <ProtectedRoute requiredRole="admin">
              <SpeakerApplicationsAdminPage />
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
          path="/analytics"
          element={
            <ProtectedRoute requiredRole="admin">
              <AnalyticsPage />
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
function AnalyticsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">Analytics</p>
          </div>
          <HeaderActions />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[90rem] flex-1 bg-slate-50">
        <AnalyticsDashboard />
      </main>
    </div>
  );
}
 

function CompanyPageLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-white/60">Company details</p>
          </div>
          <HeaderActions />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[90rem] flex-1 bg-surface lg:min-h-[calc(100vh-4.5rem)]">
        <CompanyDetailPage />
      </main>
    </div>
  );
}

function MemberPortalPage() {
  return <MemberDirectoryLayout subtitle="Member portal" portalView />;
}

function WelcomeToast() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed left-1/2 top-4 z-[var(--z-toast)] w-[90%] max-w-md -translate-x-1/2 rounded-lg border border-sage bg-sage-tint px-4 py-3 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink">
          Welcome! Your profile has been created.
        </p>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 text-sage hover:text-ink"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
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
  const navigate = useNavigate();
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [portalMember, setPortalMember] = useState<MemberDetail | null>(null);

  const incomingMemberId = (location.state as DashboardLocationState | null)?.selectedMemberId;
  const [appliedIncomingId, setAppliedIncomingId] = useState<string | undefined>(undefined);
  if (incomingMemberId && incomingMemberId !== appliedIncomingId) {
    setAppliedIncomingId(incomingMemberId);
    setSelectedMemberId(incomingMemberId);
  }

  if ((!portalView || !selectedMemberId) && portalMember !== null) {
    setPortalMember(null);
  }

  const justCreatedFlag = (location.state as DashboardLocationState | null)?.justCreated;
  const [appliedJustCreated, setAppliedJustCreated] = useState(false);
  if (justCreatedFlag && !appliedJustCreated) {
    setAppliedJustCreated(true);
    setShowWelcome(true);
  }

  // Clearing the flag from history state (so refreshing the page, or coming
  // back later, doesn't keep re-showing the welcome banner) is a genuine side
  // effect on the browser's history — that part belongs in an effect. Setting
  // showWelcome itself happens above, directly during render, matching the
  // same pattern already used for incomingMemberId in this file.
  useEffect(() => {
    if (justCreatedFlag) {
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [justCreatedFlag, location.pathname, navigate]);

  useEffect(() => {
    if (!portalView || !selectedMemberId) {
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

    void loadPortalMember();
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
      {showWelcome && <WelcomeToast />}
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-white/60">{subtitle}</p>
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