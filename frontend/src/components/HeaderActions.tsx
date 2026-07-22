import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { fetchUnreadNotificationCount } from '../api/notificationsApi';
import { useAuth } from '../context/authShared';

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
