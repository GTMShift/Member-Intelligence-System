import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/authShared';
import {
  approveJoinUsApplication,
  getJoinUsApplications,
  rejectJoinUsApplication,
  type JoinUsApplication,
  type JoinUsApplicationStatus,
} from '../api/joinUsApplicationsApi';

type FilterStatus = 'all' | JoinUsApplicationStatus;

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_STYLES: Record<JoinUsApplicationStatus, string> = {
  pending: 'bg-orange/10 text-orange-dark border-orange/20',
  approved: 'bg-sage-tint text-sage border-sage/30',
  rejected: 'bg-charcoal/10 text-charcoal border-charcoal/20',
};

export function JoinUsApplicationsAdminPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [applications, setApplications] = useState<JoinUsApplication[]>([]);
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadApplications = useCallback(async () => {
    if (!session?.access_token) {
      setError('Your session has expired. Please sign in again.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await getJoinUsApplications(
        session.access_token,
        filter === 'all' ? undefined : filter,
      );
      setApplications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load applications');
    } finally {
      setLoading(false);
    }
  }, [filter, session?.access_token]);

  useEffect(() => {
    void loadApplications();
  }, [loadApplications]);

  const handleDecision = async (
    application: JoinUsApplication,
    decision: 'approve' | 'reject',
  ) => {
    if (!session?.access_token) return;

    setActionId(application.id);
    setError(null);

    try {
      const updated = decision === 'approve'
        ? await approveJoinUsApplication(session.access_token, application.id)
        : await rejectJoinUsApplication(session.access_token, application.id);

      if (filter === 'pending') {
        setApplications((current) =>
          current.filter((item) => item.id !== application.id),
        );
      } else {
        setApplications((current) =>
          current.map((item) =>
            item.id === application.id
              ? {
                  ...item,
                  status: updated.status,
                  reviewed_at: new Date().toISOString(),
                }
              : item,
          ),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update application');
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">Join Us Applications</h1>
            <p className="text-sm text-white/60">
              Review and decide new member applications
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white/80 hover:bg-white/10"
          >
            Back to dashboard
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-charcoal">Application review</h2>
            <p className="mt-1 text-sm text-charcoal/60">
              Approving creates or safely links the applicant’s member record.
            </p>
          </div>

          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as FilterStatus)}
            className="rounded-md border border-charcoal/20 bg-white px-3 py-2 text-sm text-charcoal"
          >
            {FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-sm text-charcoal/60">
            Loading applications...
          </div>
        ) : applications.length === 0 ? (
          <div className="rounded-lg border border-charcoal/10 bg-white px-6 py-12 text-center text-sm text-charcoal/60">
            No {filter === 'all' ? '' : filter} applications found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-charcoal/10 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-charcoal/5 text-charcoal/70">
                  <tr>
                    <th className="px-4 py-3 font-medium">Applicant</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                    <th className="px-4 py-3 font-medium">Submitted</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal/10">
                  {applications.map((application) => {
                    const isPending = application.status === 'pending';
                    const isWorking = actionId === application.id;

                    return (
                      <tr key={application.id} className="align-top">
                        <td className="px-4 py-4">
                          <p className="font-medium text-charcoal">
                            {application.first_name} {application.last_name}
                          </p>
                          <p className="mt-1 text-charcoal/60">
                            {application.email_address}
                          </p>
                          {application.phone_number && (
                            <p className="mt-1 text-charcoal/60">
                              {application.phone_number}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 text-charcoal/70">
                          <p>{application.job_title || 'No job title provided'}</p>
                          <p className="mt-1">{application.company || 'No company provided'}</p>
                          {application.linkedin && (
                            <a
                              href={application.linkedin}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-orange-dark hover:underline"
                            >
                              LinkedIn profile
                            </a>
                          )}
                        </td>
                        <td className="px-4 py-4 text-charcoal/70">
                          {new Date(application.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[application.status]}`}
                          >
                            {application.status}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {isPending ? (
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isWorking}
                                onClick={() => void handleDecision(application, 'approve')}
                                className="rounded-md bg-sage px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={isWorking}
                                onClick={() => void handleDecision(application, 'reject')}
                                className="rounded-md border border-charcoal/20 px-3 py-1.5 text-xs font-medium text-charcoal disabled:opacity-50"
                              >
                                Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-charcoal/50">
                              Reviewed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}