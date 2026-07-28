import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/authShared';

type ApplicationStatus = 'pending' | 'approved' | 'declined' | 'waitlist';

interface SpeakerApplication {
  id: string;
  member_id: string;
  bio: string;
  speaking_interest: string[];
  speaking_experience: string | null;
  speaking_topics: string | null;
  teams_that_benefit: string[];
  requires_company_approval: boolean;
  other_comments: string | null;
  status: ApplicationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  first_name: string;
  last_name: string;
  email: string;
  company_name: string | null;
  current_role: string | null;
}

interface MemberRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AppRow extends Omit<SpeakerApplication, 'first_name' | 'last_name' | 'email' | 'company_name' | 'current_role'> {
  members: MemberRow | null;
}

interface ProfileRow {
  member_id: string;
  company_name: string | null;
  seniority_level: string | null;
}

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  pending: 'bg-orange/10 text-orange-dark border-orange/20',
  approved: 'bg-sage-tint text-sage border-sage/30',
  declined: 'bg-charcoal/10 text-charcoal border-charcoal/20',
  waitlist: 'bg-orange/10 text-orange-dark border-orange/20',
};

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  waitlist: 'Waitlist',
};

const FILTER_OPTIONS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'declined', label: 'Declined' },
];

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function ApplicationCard({
  application,
  onStatusChange,
  isUpdating,
}: {
  application: SpeakerApplication;
  onStatusChange: (id: string, status: ApplicationStatus) => Promise<void>;
  isUpdating: boolean;
}) {
  const fullName = `${application.first_name} ${application.last_name}`;

  return (
    <div className="rounded-xl border border-charcoal/15 bg-white p-6 space-y-5">

      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{fullName}</h3>
            <StatusBadge status={application.status} />
          </div>
          <p className="mt-0.5 text-sm text-ink/60">
            {[application.current_role, application.company_name].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-0.5 text-xs text-ink/40">{application.email}</p>
        </div>
        <p className="shrink-0 text-xs text-ink/40">
          Submitted {new Date(application.submitted_at).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>
      </div>

      {/* Details grid */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Speaking interests
          </dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {application.speaking_interest?.length > 0
              ? application.speaking_interest.map((i) => (
                  <span
                    key={i}
                    className="rounded-full border border-charcoal/15 bg-surface px-2 py-0.5 text-xs text-ink"
                  >
                    {i}
                  </span>
                ))
              : <span className="text-sm text-ink/40">—</span>
            }
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Speaking experience
          </dt>
          <dd className="mt-1 text-sm text-ink">
            {application.speaking_experience ?? '—'}
          </dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Bio</dt>
          <dd className="mt-1 text-sm text-ink whitespace-pre-wrap">{application.bio}</dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Speaking topics
          </dt>
          <dd className="mt-1 text-sm text-ink whitespace-pre-wrap">
            {application.speaking_topics ?? '—'}
          </dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Teams that would benefit
          </dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {application.teams_that_benefit?.length > 0
              ? application.teams_that_benefit.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-charcoal/15 bg-surface px-2 py-0.5 text-xs text-ink"
                  >
                    {t}
                  </span>
                ))
              : <span className="text-sm text-ink/40">—</span>
            }
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">
            Company approval required
          </dt>
          <dd className="mt-1 text-sm text-ink">
            {application.requires_company_approval ? 'Yes' : 'No'}
          </dd>
        </div>

        {application.other_comments && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">
              Other comments
            </dt>
            <dd className="mt-1 text-sm text-ink whitespace-pre-wrap">
              {application.other_comments}
            </dd>
          </div>
        )}
      </dl>

      {/* Action buttons */}
      <div className="flex items-center gap-2 border-t border-charcoal/10 pt-4">
        <span className="text-xs font-medium text-ink/40 mr-1">Set status:</span>
        {(['approved', 'waitlist', 'declined'] as ApplicationStatus[]).map((status) => (
          <button
            key={status}
            type="button"
            disabled={isUpdating || application.status === status}
            onClick={() => { void onStatusChange(application.id, status); }}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              application.status === status
                ? STATUS_STYLES[status]
                : 'border-charcoal/20 bg-white text-ink/70 hover:bg-surface'
            }`}
          >
            {STATUS_LABELS[status]}
          </button>
        ))}
        {application.status !== 'pending' && (
          <button
            type="button"
            disabled={isUpdating}
            onClick={() => { void onStatusChange(application.id, 'pending'); }}
            className="ml-auto rounded-md border border-charcoal/15 bg-white px-3 py-1.5 text-xs font-medium text-ink/50 hover:bg-surface disabled:opacity-40"
          >
            Reset to pending
          </button>
        )}
      </div>
    </div>
  );
}

export function SpeakerApplicationsAdminPage() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [applications, setApplications] = useState<SpeakerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApplicationStatus | 'all'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) navigate('/');
  }, [isAdmin, navigate]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: apps, error: appsError } = await supabase
        .from('speaker_applications')
        .select(`
          *,
          members!inner (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .order('submitted_at', { ascending: false });

      if (appsError) throw new Error(appsError.message);

      const memberIds = (apps ?? []).map((a: AppRow) => a.members?.id).filter(Boolean) as string[];

      const { data: profiles } = memberIds.length > 0
        ? await supabase
            .from('member_profile')
            .select('member_id, company_name, seniority_level')
            .in('member_id', memberIds)
        : { data: [] as ProfileRow[] };

      const profileMap = Object.fromEntries(
        (profiles ?? []).map((p: ProfileRow) => [p.member_id, p]),
      );

      const flat: SpeakerApplication[] = (apps ?? []).map((row: AppRow) => ({
        ...row,
        first_name: row.members?.first_name ?? '',
        last_name: row.members?.last_name ?? '',
        email: row.members?.email ?? '',
        company_name: profileMap[row.members?.id ?? '']?.company_name ?? null,
        current_role: profileMap[row.members?.id ?? '']?.seniority_level ?? null,
      }));

      setApplications(flat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function run() {
      await loadApplications();
    }
    run().catch(console.error);
  }, [loadApplications]);

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    setUpdatingId(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error: updateError } = await supabase
        .from('speaker_applications')
        .update({
          status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id ?? null,
        })
        .eq('id', id);

      if (updateError) throw new Error(updateError.message);

      setApplications((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status,
                reviewed_at: new Date().toISOString(),
                reviewed_by: user?.id ?? null,
              }
            : a,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = filter === 'all'
    ? applications
    : applications.filter((a) => a.status === filter);

  const counts = applications.reduce<Record<string, number>>(
    (acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }),
    {},
  );

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="border-b border-charcoal/80 bg-charcoal">
        <div className="mx-auto flex max-w-[90rem] items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <h1 className="text-lg font-semibold text-white">
              SolutionExec Member Intelligence Platform
            </h1>
            <p className="text-sm text-white/60">Speaker applications</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/20"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">

        {/* Summary counts */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          {(['pending', 'approved', 'waitlist', 'declined'] as ApplicationStatus[]).map((s) => (
            <div
              key={s}
              className="rounded-xl border border-charcoal/15 bg-white px-4 py-3 text-center"
            >
              <p className="text-2xl font-semibold text-ink">{counts[s] ?? 0}</p>
              <p className="mt-0.5 text-xs text-ink/50">{STATUS_LABELS[s]}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="mb-5 flex gap-1 rounded-lg border border-charcoal/15 bg-surface p-1 w-fit">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFilter(opt.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === opt.value
                  ? 'bg-white text-ink shadow-sm border border-charcoal/15'
                  : 'text-ink/50 hover:text-ink'
              }`}
            >
              {opt.label}
              {opt.value !== 'all' && counts[opt.value] !== undefined && (
                <span className="ml-1.5 text-ink/30">({counts[opt.value]})</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-5 rounded-lg border border-orange/20 bg-orange/5 px-4 py-3">
            <p className="text-sm text-orange-dark">{error}</p>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-ink/50">Loading applications...</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-charcoal/15 bg-white px-6 py-12 text-center">
            <p className="text-sm text-ink/50">
              No {filter === 'all' ? '' : filter} applications yet.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((application) => (
              <ApplicationCard
                key={application.id}
                application={application}
                onStatusChange={handleStatusChange}
                isUpdating={updatingId === application.id}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}