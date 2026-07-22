import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { HeaderActions } from '../components/HeaderActions';
import { useAuth } from '../context/authShared';
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../api/notificationsApi';
import { formatTimestamp } from '../utils/format';
import type { Notification, NotificationType } from '../types/api';

type FilterId = 'all' | NotificationType | 'enrichment';

interface FilterOption {
  id: FilterId;
  label: string;
}

const FILTERS: FilterOption[] = [
  { id: 'all', label: 'All' },
  { id: 'duplicate_detected', label: 'Duplicate' },
  { id: 'job_change', label: 'Job Change' },
  { id: 'new_signup', label: 'New Signup' },
  { id: 'enrichment', label: 'Enrichment' },
  { id: 'profile_updated', label: 'Profile Updated' },
  { id: 'speaker_application', label: 'Speaker Application' },
];

interface TypeMeta {
  label: string;
  badgeClass: string;
  iconClass: string;
  iconPath: string;
}

const TYPE_META: Record<NotificationType, TypeMeta> = {
  duplicate_detected: {
    label: 'Duplicate',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    iconClass: 'bg-amber-100 text-amber-700',
    iconPath:
      'M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 12h8a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2Z',
  },
  job_change: {
    label: 'Job Change',
    badgeClass: 'bg-blue-50 text-blue-700 ring-blue-200',
    iconClass: 'bg-blue-100 text-blue-700',
    iconPath:
      'M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 0 0 .75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 0 0-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0 1 12 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 0 1-.673-.38m0 0A2.18 2.18 0 0 1 3 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 0 1 3.413-.387m7.5 0V5.25A2.25 2.25 0 0 0 13.5 3h-3a2.25 2.25 0 0 0-2.25 2.25v.894m7.5 0a48.667 48.667 0 0 0-7.5 0M12 12.75h.008v.008H12v-.008Z',
  },
  new_signup: {
    label: 'New Signup',
    badgeClass: 'bg-green-50 text-green-700 ring-green-200',
    iconClass: 'bg-green-100 text-green-700',
    iconPath:
      'M19 8v6m3-3h-6M9 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 0c-2.67 0-8 1.34-8 4v2h10',
  },
  enrichment_complete: {
    label: 'Enrichment',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    iconClass: 'bg-emerald-100 text-emerald-700',
    iconPath: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  enrichment_failed: {
    label: 'Enrichment',
    badgeClass: 'bg-red-50 text-red-700 ring-red-200',
    iconClass: 'bg-red-100 text-red-700',
    iconPath:
      'M12 9v3.75m0 3.75h.008M10.34 3.94 1.82 18.5A1.5 1.5 0 0 0 3.12 20.75h17.76a1.5 1.5 0 0 0 1.3-2.25L13.66 3.94a1.5 1.5 0 0 0-2.6 0Z',
  },
  profile_updated: {
    label: 'Profile Updated',
    badgeClass: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    iconClass: 'bg-indigo-100 text-indigo-700',
    iconPath:
      'M16.86 4.49 19.5 7.13m-1.41-4.05a1.87 1.87 0 0 1 2.64 2.64L7.5 18.59 3 19.99l1.4-4.5L18.1 3.08Z',
  },
  speaker_application: {
    label: 'Speaker Application',
    badgeClass: 'bg-violet-50 text-violet-700 ring-violet-200',
    iconClass: 'bg-violet-100 text-violet-700',
    iconPath: 'M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z',
  },
};

const DEFAULT_TYPE_META: TypeMeta = {
  label: 'Notification',
  badgeClass: 'bg-slate-50 text-slate-700 ring-slate-200',
  iconClass: 'bg-slate-100 text-slate-700',
  iconPath:
    'M14.857 17.082a23.85 23.85 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 1 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0',
};

function matchesFilter(notification: Notification, filter: FilterId): boolean {
  if (filter === 'all') return true;
  if (filter === 'enrichment') {
    return (
      notification.type === 'enrichment_complete' ||
      notification.type === 'enrichment_failed'
    );
  }
  return notification.type === filter;
}

export function NotificationsPage() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchNotifications();
        if (!cancelled) setNotifications(data);
      } catch {
        if (!cancelled) setError('Failed to load notifications.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleNotifications = useMemo(
    () => notifications.filter((n) => matchesFilter(n, activeFilter)),
    [notifications, activeFilter],
  );
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const markAsRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await markNotificationAsRead(id);
    } catch {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: false } : n)));
    }
  };

  const markAllAsRead = async () => {
    const previous = notifications;
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    try {
      await markAllNotificationsAsRead();
    } catch {
      setNotifications(previous);
    }
  };

  if (role !== 'admin') {
    return <Navigate to="/unauthorized" replace />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-slate-500">Notifications</p>
          </div>
          <HeaderActions />
        </div>
      </header>
      <main className="mx-auto w-full max-w-[90rem] flex-1 bg-slate-50 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to dashboard
          </button>
          <button
            type="button"
            onClick={markAllAsRead}
            disabled={unreadCount === 0}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark all as read
          </button>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {FILTERS.map((filter) => {
            const isActive = filter.id === activeFilter;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setActiveFilter(filter.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {loading && <p className="mt-8 text-center text-sm text-slate-500">Loading…</p>}
        {error && (
          <p className="mt-8 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
            {error}
          </p>
        )}

        {!loading && !error && (
          <ul className="mt-6 flex flex-col gap-3">
            {visibleNotifications.length === 0 ? (
              <li className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
                <p className="text-sm font-medium text-slate-700">No notifications</p>
                <p className="mt-1 text-sm text-slate-500">
                  There are no notifications matching this filter.
                </p>
              </li>
            ) : (
              visibleNotifications.map((notification) => {
                const meta = TYPE_META[notification.type] ?? DEFAULT_TYPE_META;
                return (
                  <li
                    key={notification.id}
                    className={`rounded-lg border bg-white p-4 shadow-sm ${
                      notification.is_read
                        ? 'border-slate-200'
                        : 'border-l-4 border-l-slate-900 border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <span
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.iconClass}`}
                        aria-hidden="true"
                      >
                        <svg
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d={meta.iconPath} />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          {!notification.is_read && (
                            <span className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                              Unread
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-slate-900">
                          {notification.title}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-600">{notification.body}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                          {notification.member_id && notification.member_name && (
                            <Link
                              to="/"
                              state={{ selectedMemberId: notification.member_id }}
                              className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline"
                            >
                              {notification.member_name}
                            </Link>
                          )}
                          <span>{formatTimestamp(notification.created_at)}</span>
                        </div>
                      </div>
                      {!notification.is_read && (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification.id)}
                          className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        )}
      </main>
    </div>
  );
}