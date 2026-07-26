import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fetchUnreadNotificationCount } from '../api/notificationsApi';
import { useAuth } from '../context/authShared';

export function HeaderActions() {
  const { user, signOut, role, memberId } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isMemberView = location.pathname === '/portal';
  const isAdmin = role === 'admin';

  useEffect(() => {
    if (role !== 'admin') return;
    fetchUnreadNotificationCount().then(setUnreadCount);
  }, [role]);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const closeMenu = () => setMenuOpen(false);

  const go = (path: string) => {
    closeMenu();
    navigate(path);
  };

  const navButtonClass =
    'w-full rounded-md px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-100';

  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        aria-label="Open menu"
        aria-expanded={menuOpen}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isAdmin && (
        <Link
          to="/notifications"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : 'Notifications'
          }
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
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
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-orange px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Link>
      )}

      {isAdmin && (
        <div className="relative flex rounded-lg border border-white/20 bg-white/5 p-0.5">
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
              isMemberView ? 'text-white/70 hover:text-white' : 'text-charcoal'
            }`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className={`relative z-10 w-20 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              isMemberView ? 'text-charcoal' : 'text-white/70 hover:text-white'
            }`}
          >
            Member
          </button>
        </div>
      )}

      {user?.email && (
        <span className="hidden max-w-[12rem] truncate text-sm text-white/60 sm:inline">
          {user.email}
        </span>
      )}

      <button
        type="button"
        onClick={handleSignOut}
        className="rounded-md border border-white/20 bg-transparent px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
      >
        Sign out
      </button>

      {/* Overlay */}
      <div
        aria-hidden={!menuOpen}
        onClick={closeMenu}
        className={`fixed inset-0 z-[60] bg-slate-900/50 transition-opacity duration-300 ${
          menuOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />

      {/* Sliding sidebar */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        className={`fixed inset-y-0 right-0 z-[70] flex w-full max-w-xs flex-col bg-white shadow-xl transition-transform duration-300 ease-out ${
          menuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Menu</h2>
          <button
            type="button"
            onClick={closeMenu}
            aria-label="Close menu"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {isAdmin && (
            <>
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Admin tools
              </p>
              <button type="button" onClick={() => go('/')} className={navButtonClass}>
                View Admin Dashboard
              </button>
              <button type="button" onClick={() => go('/portal')} className={navButtonClass}>
                View Member Portal
              </button>
              <button
                type="button"
                onClick={() => go('/admin/add-member')}
                className={navButtonClass}
              >
                + Add member
              </button>
              <button
                type="button"
                onClick={() => go('/admin/speaker-applications')}
                className={navButtonClass}
              >
                Speaker applications
              </button>
              <button type="button" onClick={() => go('/analytics')} className={navButtonClass}>
                Analytics
              </button>
              <button
                type="button"
                onClick={() => go('/admin/substack-import')}
                className={navButtonClass}
              >
                Import Substack CSV
              </button>
            </>
          )}

          {(isMemberView || role === 'member') && (
            <>
              <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Member
              </p>
              <button
                type="button"
                onClick={() => go(memberId ? '/my-profile' : '/complete-profile')}
                className={navButtonClass}
              >
                My Profile
              </button>
              <button
                type="button"
                onClick={() => go('/portal/speaker-application')}
                className={navButtonClass}
              >
                Apply to speak
              </button>
            </>
          )}
        </nav>

        {user?.email && (
          <div className="border-t border-slate-200 px-4 py-3">
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
        )}
      </aside>
    </div>
  );
}
