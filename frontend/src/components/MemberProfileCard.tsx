import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMember } from '../api/membersApi';
import { updateMemberAsAdmin, type AdminUpdateMemberInput } from '../api/adminUpdateMember';
import { useAuth } from '../context/AuthContext';
import type { MemberDataEntry, MemberDetail } from '../types/api';
import { formatTimestamp, fullName } from '../utils/format';
import { InteractionTimeline } from './InteractionTimeline';

const BUCKET_OPTIONS = [
  { value: '', label: 'Select a category' },
  { value: 'icp_member', label: 'ICP Member' },
  { value: 'between_roles', label: 'Between Roles' },
  { value: 'adjacent_remit', label: 'Adjacent Remit' },
  { value: 'consultant', label: 'Consultant' },
  { value: 'sponsor', label: 'Sponsor' },
  { value: 'personal_connection', label: 'Personal Connection' },
] as const;

const SENIORITY_OPTIONS = [
  { value: '', label: 'Select seniority' },
  { value: 'C-Suite', label: 'C-Suite' },
  { value: 'VP', label: 'VP' },
  { value: 'Director', label: 'Director' },
  { value: 'Manager', label: 'Manager' },
  { value: 'Individual Contributor', label: 'Individual Contributor' },
] as const;

type EditFormState = {
  first_name: string;
  last_name: string;
  linkedin_url: string;
  phone: string;
  job_title: string;
  current_job_start_date: string;
  seniority_level: string;
  company_name: string;
  country: string;
  state_region: string;
  city: string;
  bucket: string;
  fit_score: string;
  tag_note: string;
};

function normalizeLinkedInUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;
  url = url.replace(/^https?:\/\//i, '');
  if (!/^www\./i.test(url)) {
    url = `www.${url}`;
  }
  return `https://${url}`;
}

interface MemberProfileCardProps {
  memberId: string;
}

interface ProfileField {
  label: string;
  value: string | null | undefined;
}

function FieldGrid({ fields }: { fields: ProfileField[] }) {
  const visible = fields.filter((f) => f.value);
  if (visible.length === 0) {
    return <p className="text-sm text-slate-500">No data available.</p>;
  }
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {visible.map((field) => (
        <div key={field.label}>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {field.label}
          </dt>
          <dd className="mt-0.5 text-sm text-slate-900">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function TierSection({
  title,
  description,
  tierColor,
  children,
}: {
  title: string;
  description: string;
  tierColor: 'neutral' | 'sage' | 'orange';
  children: React.ReactNode;
}) {
  const borderColors = {
    neutral: 'border-charcoal/15',
    sage: 'border-sage/30',
    orange: 'border-orange/25',
  };
  const badgeColors = {
    neutral: 'bg-charcoal/5 text-charcoal',
    sage: 'bg-sage-tint text-sage',
    orange: 'bg-orange/10 text-orange-dark',
  };
  return (
    <section className={`rounded-xl border ${borderColors[tierColor]} bg-white p-5`}>
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeColors[tierColor]}`}>
          {description}
        </span>
      </div>
      {children}
    </section>
  );
}

const FEEDBACK_PROMPT_LABELS: Record<string, string> = {
  challenge: 'What are your top 3 challenges right now?',
  event_feedback: 'Event feedback',
  interest: 'Personal interests',
  mandate: 'Team dynamics / mandates',
};

function FeedbackPrompts({ entries }: { entries: MemberDataEntry[] }) {
  const feedbackEntries = entries.filter(
    (e) =>
      e.tier === 'user_editable' &&
      ['challenge', 'event_feedback', 'interest', 'mandate'].includes(e.category),
  );
  if (feedbackEntries.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No member-submitted feedback yet.
      </p>
    );
  }
  const grouped = feedbackEntries.reduce<Record<string, MemberDataEntry[]>>((acc, entry) => {
    if (!acc[entry.category]) acc[entry.category] = [];
    acc[entry.category].push(entry);
    return acc;
  }, {});
  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([category, items]) => (
        <div
          key={category}
          className="rounded-lg border-2 border-sage/30 bg-sage-tint/50 p-4"
        >
          <h4 className="text-sm font-semibold text-sage">
            {FEEDBACK_PROMPT_LABELS[category] ?? category}
          </h4>
          <ul className="mt-3 space-y-3">
            {items
              .sort(
                (a, b) =>
                  new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
              )
              .map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-md border border-sage/20 bg-white p-3"
                >
                  <FeedbackEntryContent entry={entry} />
                  <p className="mt-2 text-xs text-slate-400">
                    Submitted {formatTimestamp(entry.created_at)}
                    {entry.logged_by ? ` · ${entry.logged_by}` : ''}
                  </p>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FeedbackEntryContent({ entry }: { entry: MemberDataEntry }) {
  const { data, category } = entry;
  if (category === 'event_feedback') {
    const question = typeof data.question === 'string' ? data.question : null;
    const answer = typeof data.answer === 'string' ? data.answer : null;
    return (
      <div>
        {question && (
          <p className="text-xs font-medium text-slate-500">{question}</p>
        )}
        {answer && <p className="mt-1 text-sm text-slate-900">{answer}</p>}
      </div>
    );
  }
  const text = typeof data.text === 'string' ? data.text : JSON.stringify(data);
  return <p className="text-sm text-slate-900">{text}</p>;
}

function AdminDataEntry({ entry }: { entry: MemberDataEntry }) {
  const { category } = entry;
  const categoryLabels: Record<string, string> = {
    note: 'Note',
    transcript: 'Transcript',
    flag: 'Flag',
  };
  return (
    <div className="rounded-md border border-orange/20 bg-orange/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-orange-dark">
        {categoryLabels[category] ?? category}
      </p>
      <AdminEntryContent entry={entry} />
      <p className="mt-2 text-xs text-slate-400">
        {formatTimestamp(entry.created_at)}
        {entry.logged_by ? ` · ${entry.logged_by}` : ''}
      </p>
    </div>
  );
}

function AdminEntryContent({ entry }: { entry: MemberDataEntry }) {
  const { data, category } = entry;
  if (category === 'transcript') {
    const source = typeof data.source === 'string' ? data.source : null;
    const text = typeof data.text === 'string' ? data.text : null;
    return (
      <div className="mt-1">
        {source && <p className="text-xs text-slate-500">Source: {source}</p>}
        {text && <p className="mt-1 text-sm text-slate-900">{text}</p>}
      </div>
    );
  }
  if (category === 'flag') {
    const reason = typeof data.reason === 'string' ? data.reason : null;
    return <p className="mt-1 text-sm text-slate-900">{reason}</p>;
  }
  const text = typeof data.text === 'string' ? data.text : JSON.stringify(data);
  return <p className="mt-1 text-sm text-slate-900">{text}</p>;
}

function AvatarCircle({
  avatarUrl,
  firstName,
}: {
  avatarUrl: string | null | undefined;
  firstName: string;
}) {
  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-1 ring-slate-200">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xl font-medium text-slate-400">
          {firstName?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  );
}

export function MemberProfileCard({ memberId }: MemberProfileCardProps) {
  const { role, isAdmin, user } = useAuth();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadMember = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMember(memberId, role);
      if (!data) {
        setError('Member not found.');
        setMember(null);
      } else {
        setMember(data);
      }
    } catch {
      setError('Failed to load member profile.');
      setMember(null);
    } finally {
      setLoading(false);
    }
  }, [memberId, role]);

  useEffect(() => {
    let cancelled = false;
    loadMember().then(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  }, [loadMember]);

  // Jump to the top of the card the moment a different member is selected,
  // rather than keeping whatever scroll position was left over from the
  // previously viewed member's (likely differently-sized) profile.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [memberId]);

  // Only show the full-page "Loading…" placeholder on a genuinely first
  // load, when there's no member data at all yet. When switching from one
  // already-loaded member to another, keep the previous member's content
  // visible (slightly dimmed) while the new one loads in the background —
  // this avoids the content area suddenly collapsing to a tiny placeholder
  // and then snapping back to full height, which is what caused the
  // scroll-jump bug.
  if (loading && !member) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-slate-500">Loading profile…</p>
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-600">{error ?? 'Member not found.'}</p>
      </div>
    );
  }

  const { profile } = member;
  const userEditableEntries = member.member_data.filter((e) => e.tier === 'user_editable');
  const adminOnlyEntries = member.member_data.filter((e) => e.tier === 'admin_only');
  const currentRole =
    member.employment_history.find((entry) => entry.is_current)?.role ?? null;

  const startEditing = () => {
    setSaveError(null);
    setEditForm({
      first_name: member.first_name,
      last_name: member.last_name,
      linkedin_url: member.linkedin_url ?? '',
      phone: member.phone ?? '',
      job_title: currentRole ?? '',
      current_job_start_date: profile.current_job_start_date ?? '',
      seniority_level: profile.seniority_level ?? '',
      company_name: profile.company_name ?? '',
      country: profile.country ?? '',
      state_region: profile.state_region ?? '',
      city: profile.city ?? '',
      bucket: profile.bucket ?? '',
      fit_score: profile.fit_score !== null && profile.fit_score !== undefined ? String(profile.fit_score) : '',
      tag_note: profile.tag_note ?? '',
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm(null);
    setSaveError(null);
  };

  const handleEditChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setEditForm((prev) => (prev ? { ...prev, [name]: value } : prev));
  };

  const handleSaveEdit = async () => {
    if (!editForm || !user?.id) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const input: AdminUpdateMemberInput = {
        first_name: editForm.first_name.trim(),
        last_name: editForm.last_name.trim(),
        linkedin_url: normalizeLinkedInUrl(editForm.linkedin_url),
        phone: editForm.phone.trim() || null,
        job_title: editForm.job_title.trim() || null,
        current_job_start_date: editForm.current_job_start_date || null,
        seniority_level: editForm.seniority_level || null,
        company_name: editForm.company_name.trim() || null,
        country: editForm.country.trim() || null,
        state_region: editForm.state_region.trim() || null,
        city: editForm.city.trim() || null,
        bucket: editForm.bucket || null,
        fit_score: editForm.fit_score ? parseInt(editForm.fit_score, 10) : null,
        tag_note: editForm.tag_note.trim() || null,
      };
      await updateMemberAsAdmin(memberId, input, user.id);
      await loadMember();
      setIsEditing(false);
      setEditForm(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const identityFields: ProfileField[] = [
    { label: 'Email', value: member.email },
    { label: 'LinkedIn', value: member.linkedin_url },
    { label: 'Phone', value: member.phone },
    { label: 'Work email (enriched)', value: profile.work_email_enriched },
  ];
  const roleFields: ProfileField[] = [
    { label: 'Job title', value: currentRole },
    { label: 'Job start date', value: profile.current_job_start_date },
    { label: 'Seniority level', value: profile.seniority_level },
  ];
  const locationFields: ProfileField[] = [
    { label: 'Country', value: profile.country },
    { label: 'State/region', value: profile.state_region },
    { label: 'City', value: profile.city },
  ];
  const historyFields: ProfileField[] = [
    { label: 'Previous company 1', value: profile.prev_company_1 },
    { label: 'Previous role 1', value: profile.prev_role_1 },
    { label: 'Previous company 2', value: profile.prev_company_2 },
    { label: 'Previous role 2', value: profile.prev_role_2 },
    { label: 'Previous company 3', value: profile.prev_company_3 },
    { label: 'Previous role 3', value: profile.prev_role_3 },
    { label: 'Signup source', value: profile.signup_source },
  ];
  const adminProfileFields: ProfileField[] = isAdmin
    ? [
        { label: 'ICP', value: profile.icp },
        { label: 'Bucket', value: profile.bucket },
        {
          label: 'Fit score',
          value: profile.fit_score !== null && profile.fit_score !== undefined ? String(profile.fit_score) : null,
        },
        { label: 'Tag note', value: profile.tag_note },
      ]
    : [];

  return (
    <div ref={scrollRef} className={`h-full overflow-y-auto ${loading ? 'opacity-60 transition-opacity' : ''}`}>
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <AvatarCircle avatarUrl={profile.avatar_url} firstName={member.first_name} />
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-semibold text-slate-900">
              {fullName(member.first_name, member.last_name)}
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              {currentRole ?? '—'}
              {profile.company_name ? (
                <>
                  {' · '}
                  {profile.company_id ? (
                    <Link
                      to={`/companies/${profile.company_id}`}
                      state={{ fromMemberId: memberId }}
                      className="font-medium text-orange-dark hover:text-orange hover:underline"
                    >
                      {profile.company_name}
                    </Link>
                  ) : (
                    profile.company_name
                  )}
                </>
              ) : null}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Last updated {formatTimestamp(member.last_updated)}
              {profile.updated_at !== member.last_updated && (
                <> · Profile updated {formatTimestamp(profile.updated_at)}</>
              )}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div className="flex shrink-0 items-center gap-2">
            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={cancelEditing}
                  disabled={isSaving}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="rounded-md bg-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-dark disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={startEditing}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
            )}
          </div>
        )}
        </div>
        {saveError && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {saveError}
          </p>
        )}
      </div>
      <div className="space-y-5 p-6">
        <TierSection
          title="Public Profile"
          description="Tier 1 · Visible to all"
          tierColor="neutral"
        >
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Identity
              </h4>
              {isEditing && editForm ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">First name</label>
                    <input
                      type="text"
                      name="first_name"
                      value={editForm.first_name}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Last name</label>
                    <input
                      type="text"
                      name="last_name"
                      value={editForm.last_name}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={editForm.phone}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">LinkedIn URL</label>
                    <input
                      type="text"
                      name="linkedin_url"
                      value={editForm.linkedin_url}
                      onChange={handleEditChange}
                      placeholder="linkedin.com/in/name"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <p className="col-span-2 text-xs text-slate-400">
                    Email ({member.email}) can't be changed here.
                  </p>
                </div>
              ) : (
                <FieldGrid fields={identityFields} />
              )}
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current role
              </h4>
              {isEditing && editForm ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Job title</label>
                    <input
                      type="text"
                      name="job_title"
                      value={editForm.job_title}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Seniority</label>
                    <select
                      name="seniority_level"
                      value={editForm.seniority_level}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    >
                      {SENIORITY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Job start date</label>
                    <input
                      type="date"
                      name="current_job_start_date"
                      value={editForm.current_job_start_date}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <FieldGrid fields={roleFields} />
              )}
            </div>
            {(profile.company_name || isEditing) && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Company
                </h4>
                {isEditing && editForm ? (
                  <input
                    type="text"
                    name="company_name"
                    value={editForm.company_name}
                    onChange={handleEditChange}
                    className="w-full max-w-sm rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                  />
                ) : profile.company_id ? (
                  <Link
                    to={`/companies/${profile.company_id}`}
                    state={{ fromMemberId: memberId }}
                    className="text-sm font-medium text-orange-dark hover:text-orange hover:underline"
                  >
                    {profile.company_name}
                  </Link>
                ) : (
                  <p className="text-sm text-slate-900">{profile.company_name}</p>
                )}
              </div>
            )}
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Location
              </h4>
              {isEditing && editForm ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">City</label>
                    <input
                      type="text"
                      name="city"
                      value={editForm.city}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">State / Region</label>
                    <input
                      type="text"
                      name="state_region"
                      value={editForm.state_region}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Country</label>
                    <input
                      type="text"
                      name="country"
                      value={editForm.country}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                </div>
              ) : (
                <FieldGrid fields={locationFields} />
              )}
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                History & source
              </h4>
              <FieldGrid fields={historyFields} />
            </div>
          </div>
        </TierSection>
        <TierSection
          title="Member Feedback"
          description="Tier 2 · User-editable"
          tierColor="sage"
        >
          <FeedbackPrompts entries={userEditableEntries} />
        </TierSection>
        {isAdmin && (
          <TierSection
            title="Admin Intelligence"
            description="Tier 3 · Admin only"
            tierColor="orange"
          >
            <div className="space-y-4">
              {isEditing && editForm ? (
                <div className="grid grid-cols-2 gap-4 rounded-lg border border-orange/20 bg-orange/5 p-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Bucket</label>
                    <select
                      name="bucket"
                      value={editForm.bucket}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    >
                      {BUCKET_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Fit score (0–100)</label>
                    <input
                      type="number"
                      name="fit_score"
                      min={0}
                      max={100}
                      value={editForm.fit_score}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-600">Tag note</label>
                    <textarea
                      name="tag_note"
                      rows={2}
                      value={editForm.tag_note}
                      onChange={handleEditChange}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-orange focus:outline-none"
                    />
                  </div>
                  <p className="col-span-2 text-xs text-slate-400">
                    Note: ICP status ({profile.icp ?? 'not classified'}) is set separately.
                  </p>
                </div>
              ) : (
                adminProfileFields.length > 0 && <FieldGrid fields={adminProfileFields} />
              )}
              {adminOnlyEntries.length > 0 ? (
                <div className="space-y-3">
                  {adminOnlyEntries
                    .sort(
                      (a, b) =>
                        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
                    )
                    .map((entry) => (
                      <AdminDataEntry key={entry.id} entry={entry} />
                    ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">No admin notes or transcripts.</p>
              )}
            </div>
          </TierSection>
        )}
        {isAdmin && (
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-semibold text-slate-900">Interaction Timeline</h3>
            <p className="mt-1 text-xs text-slate-500">Admin only · Tier 3</p>
            <div className="mt-4">
              <InteractionTimeline interactions={member.interactions} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}