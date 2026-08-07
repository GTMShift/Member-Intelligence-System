import { useCallback, useEffect, useRef, useState } from 'react';
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
  bucket: string | null;
}

interface MemberRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface AppRow extends Omit<SpeakerApplication, 'first_name' | 'last_name' | 'email' | 'company_name' | 'current_role' | 'bucket'> {
  members: MemberRow | null;
}

interface ProfileRow {
  member_id: string;
  seniority_level: string | null;
  bucket: string | null;
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

const BUCKET_LABELS: Record<string, string> = {
  primary_icp: 'Primary ICP',
  secondary_icp: 'Secondary ICP',
  watchlist: 'Watchlist',
  between_jobs: 'Between Jobs',
  consultant: 'Consultant',
  partner_sponsor: 'Partner / Sponsor',
  icp_no: 'Non-ICP',
  manual_review: 'Manual Review',
};

const BUCKET_STYLES: Record<string, string> = {
  primary_icp: 'bg-orange text-white',
  secondary_icp: 'bg-orange/20 text-orange-dark border border-orange/30',
  watchlist: 'bg-sage-tint text-sage border border-sage/30',
  between_jobs: 'bg-sage-tint text-sage',
  consultant: 'bg-charcoal/10 text-charcoal border border-charcoal/20',
  partner_sponsor: 'bg-charcoal text-white',
  icp_no: 'bg-charcoal/5 text-charcoal/40 border border-charcoal/10',
  manual_review: 'bg-orange/10 text-orange-dark border border-orange/20',
};

const FILTER_OPTIONS: { value: ApplicationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'waitlist', label: 'Waitlist' },
  { value: 'declined', label: 'Declined' },
];

const SPEAKING_INTEREST_OPTIONS = ['OTR', 'Roundtable', 'Other'];
const SPEAKING_EXPERIENCE_OPTIONS = ['Often', 'Occasionally', 'Rarely', 'Never'];
const BUCKET_OPTIONS_LIST = [
  ...Object.entries(BUCKET_LABELS).map(([value, label]) => ({ value, label })),
  { value: 'unclassified', label: 'Unclassified' },
];

const PAGE_SIZE = 5;

// ---- Dropdown multi-select --------------------------------------------------
function MultiSelectDropdown({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const buttonLabel = selected.length === 0
    ? label
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? label
      : `${label} (${selected.length})`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
          selected.length > 0
            ? 'border-orange bg-orange/10 text-orange-dark'
            : 'border-charcoal/20 bg-white text-ink/60 hover:bg-surface'
        }`}
      >
        {buttonLabel}
        <svg
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[160px] rounded-lg border border-charcoal/15 bg-white shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink hover:bg-surface"
            >
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                selected.includes(opt.value)
                  ? 'border-orange bg-orange'
                  : 'border-charcoal/30'
              }`}>
                {selected.includes(opt.value) && (
                  <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {opt.label}
            </button>
          ))}
          {selected.length > 0 && (
            <div className="border-t border-charcoal/10 px-3 py-2">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="text-xs font-medium text-orange hover:text-orange-dark"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function BucketBadge({ bucket }: { bucket: string | null }) {
  if (!bucket) return (
    <span className="inline-flex items-center rounded-full bg-charcoal/5 px-2 py-0.5 text-xs font-medium text-charcoal/30">
      Unclassified
    </span>
  );
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${BUCKET_STYLES[bucket] ?? 'bg-charcoal/5 text-charcoal/40'}`}>
      {BUCKET_LABELS[bucket] ?? bucket}
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-ink">{fullName}</h3>
            <StatusBadge status={application.status} />
            <BucketBadge bucket={application.bucket} />
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

      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Speaking interests</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {application.speaking_interest?.length > 0
              ? application.speaking_interest.map((i) => (
                  <span key={i} className="rounded-full border border-charcoal/15 bg-surface px-2 py-0.5 text-xs text-ink">{i}</span>
                ))
              : <span className="text-sm text-ink/40">—</span>
            }
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Speaking experience</dt>
          <dd className="mt-1 text-sm text-ink">{application.speaking_experience ?? '—'}</dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Bio</dt>
          <dd className="mt-1 text-sm text-ink whitespace-pre-wrap">{application.bio}</dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Speaking topics</dt>
          <dd className="mt-1 text-sm text-ink whitespace-pre-wrap">{application.speaking_topics ?? '—'}</dd>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Teams that would benefit</dt>
          <dd className="mt-1 flex flex-wrap gap-1">
            {application.teams_that_benefit?.length > 0
              ? application.teams_that_benefit.map((t) => (
                  <span key={t} className="rounded-full border border-charcoal/15 bg-surface px-2 py-0.5 text-xs text-ink">{t}</span>
                ))
              : <span className="text-sm text-ink/40">—</span>
            }
          </dd>
        </div>

        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Company approval required</dt>
          <dd className="mt-1 text-sm text-ink">{application.requires_company_approval ? 'Yes' : 'No'}</dd>
        </div>

        {application.other_comments && (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink/40">Other comments</dt>
            <dd className="mt-1 text-sm text-ink whitespace-pre-wrap">{application.other_comments}</dd>
          </div>
        )}
      </dl>

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
  const [page, setPage] = useState(1);

  const [interestFilters, setInterestFilters] = useState<string[]>([]);
  const [experienceFilters, setExperienceFilters] = useState<string[]>([]);
  const [bucketFilters, setBucketFilters] = useState<string[]>([]);

  useEffect(() => {
    if (!isAdmin) navigate('/');
  }, [isAdmin, navigate]);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: apps, error: appsError } = await supabase
        .from('speaker_applications')
        .select(`*, members!inner (id, first_name, last_name, email)`)
        .order('submitted_at', { ascending: false });

      if (appsError) throw new Error(appsError.message);

      const memberIds = (apps ?? []).map((a: AppRow) => a.members?.id).filter(Boolean) as string[];

      const { data: profiles } = memberIds.length > 0
      ? await supabase
          .from('member_profile')
          .select('member_id, seniority_level, bucket')
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
        company_name: null,
        current_role: profileMap[row.members?.id ?? '']?.seniority_level ?? null,
        bucket: profileMap[row.members?.id ?? '']?.bucket ?? null,
      }));
      
      setApplications(flat);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    async function run() { await loadApplications(); }
    run().catch(console.error);
  }, [loadApplications]);

  const handleStatusChange = async (id: string, status: ApplicationStatus) => {
    setUpdatingId(id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: updateError } = await supabase
        .from('speaker_applications')
        .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null })
        .eq('id', id);

      if (updateError) throw new Error(updateError.message);

      setApplications((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status, reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null }
            : a,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status.');
    } finally {
      setUpdatingId(null);
    }
  };

  const clearFilters = () => {
    setInterestFilters([]);
    setExperienceFilters([]);
    setBucketFilters([]);
    setFilter('all');
    setPage(1);
  };

  const hasActiveFilters = interestFilters.length > 0 || experienceFilters.length > 0 || bucketFilters.length > 0 || filter !== 'all';
  const activeFilterCount = interestFilters.length + experienceFilters.length + bucketFilters.length + (filter !== 'all' ? 1 : 0);

  const filtered = applications
    .filter((a) => filter === 'all' || a.status === filter)
    .filter((a) =>
      interestFilters.length === 0 ||
      interestFilters.some((f) =>
        f === 'Other'
          ? a.speaking_interest?.some((i) => i.toLowerCase().startsWith('other'))
          : a.speaking_interest?.includes(f)
      )
    )
    .filter((a) =>
      experienceFilters.length === 0 || experienceFilters.includes(a.speaking_experience ?? '')
    )
    .filter((a) =>
      bucketFilters.length === 0 ||
      bucketFilters.some((f) =>
        f === 'unclassified' ? a.bucket === null : a.bucket === f
      )
    )

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
            <div key={s} className="rounded-xl border border-charcoal/15 bg-white px-4 py-3 text-center">
              <p className="text-2xl font-semibold text-ink">{counts[s] ?? 0}</p>
              <p className="mt-0.5 text-xs text-ink/50">{STATUS_LABELS[s]}</p>
            </div>
          ))}
        </div>

        {/* Filter bar */}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {/* Status tabs */}
          <div className="flex gap-1 rounded-lg border border-charcoal/15 bg-surface p-1">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => { setFilter(opt.value); setPage(1); }}
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

          <div className="h-5 w-px bg-charcoal/15" />

          {/* Dropdown filters */}
          <MultiSelectDropdown
            label="Interest"
            options={SPEAKING_INTEREST_OPTIONS.map((o) => ({ value: o, label: o }))}
            selected={interestFilters}
            onChange={(v) => { setInterestFilters(v); setPage(1); }}
          />
          <MultiSelectDropdown
            label="Experience"
            options={SPEAKING_EXPERIENCE_OPTIONS.map((o) => ({ value: o, label: o }))}
            selected={experienceFilters}
            onChange={(v) => { setExperienceFilters(v); setPage(1); }}
          />
          <MultiSelectDropdown
            label="ICP Bucket"
            options={BUCKET_OPTIONS_LIST}
            selected={bucketFilters}
            onChange={(v) => { setBucketFilters(v); setPage(1); }}
          />

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium text-ink/40 hover:text-orange"
            >
              Clear all
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-orange px-1.5 py-0.5 text-xs font-semibold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
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
            <p className="text-sm text-ink/50">No applications match your filters.</p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-sm font-medium text-orange hover:text-orange-dark"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs text-ink/40">
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length} application{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="space-y-4">
              {paginated.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  onStatusChange={handleStatusChange}
                  isUpdating={updatingId === application.id}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-charcoal/20 bg-white px-4 py-2 text-sm font-medium text-ink/70 hover:bg-surface disabled:opacity-40"
                >
                  ← Previous
                </button>
                <p className="text-xs text-ink/40">Page {page} of {totalPages}</p>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-md border border-charcoal/20 bg-white px-4 py-2 text-sm font-medium text-ink/70 hover:bg-surface disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}