import { useEffect, useState } from 'react';
import { getMember } from '../api/membersApi';
import { useAuth } from '../context/AuthContext';
import type { MemberDataEntry, MemberDetail } from '../types/api';
import { formatTimestamp, fullName } from '../utils/format';
import { InteractionTimeline } from './InteractionTimeline';

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
  tierColor: 'blue' | 'violet' | 'amber';
  children: React.ReactNode;
}) {
  const borderColors = {
    blue: 'border-blue-200',
    violet: 'border-violet-200',
    amber: 'border-amber-200',
  };
  const badgeColors = {
    blue: 'bg-blue-100 text-blue-800',
    violet: 'bg-violet-100 text-violet-800',
    amber: 'bg-amber-100 text-amber-800',
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
          className="rounded-lg border-2 border-violet-200 bg-violet-50/50 p-4"
        >
          <h4 className="text-sm font-semibold text-violet-900">
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
                  className="rounded-md border border-violet-100 bg-white p-3"
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
    <div className="rounded-md border border-amber-100 bg-amber-50/30 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
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

export function MemberProfileCard({ memberId }: MemberProfileCardProps) {
  const { role, isAdmin } = useAuth();
  const [member, setMember] = useState<MemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const data = await getMember(memberId, role);
        if (!cancelled) {
          if (!data) {
            setError('Member not found.');
            setMember(null);
          } else {
            setMember(data);
          }
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load member profile.');
          setMember(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [memberId, role]);

  if (loading) {
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

  const identityFields: ProfileField[] = [
    { label: 'Email', value: member.email },
    { label: 'LinkedIn', value: member.linkedin_url },
    { label: 'Phone', value: member.phone },
    { label: 'Work email (enriched)', value: profile.work_email_enriched },
  ];

  const roleFields: ProfileField[] = [
    { label: 'Current company', value: profile.current_company },
    { label: 'Current role', value: profile.current_role },
    { label: 'Job start date', value: profile.current_job_start_date },
    { label: 'Seniority level', value: profile.seniority_level },
  ];

  const companyFields: ProfileField[] = [
    { label: 'Company LinkedIn', value: profile.company_linkedin_url },
    { label: 'Company domain', value: profile.company_domain },
    { label: 'Company size', value: profile.company_size },
    { label: 'Industry', value: profile.company_industry },
    { label: 'Sub industry', value: profile.company_sub_industry },
    { label: 'Company overview', value: profile.company_overview },
    { label: 'Company type', value: profile.company_type },
    { label: 'Revenue', value: profile.company_revenue },
    { label: 'Company tags', value: profile.company_tags },
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
    ? [{ label: 'ICP', value: profile.icp }]
    : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="border-b border-slate-200 bg-white px-6 py-5">
        <h2 className="text-xl font-semibold text-slate-900">
          {fullName(member.first_name, member.last_name)}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {profile.current_role ?? '—'}
          {profile.current_company ? ` · ${profile.current_company}` : ''}
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Last updated {formatTimestamp(member.last_updated)}
          {profile.updated_at !== member.last_updated && (
            <> · Profile updated {formatTimestamp(profile.updated_at)}</>
          )}
        </p>
      </div>

      <div className="space-y-5 p-6">
        <TierSection
          title="Public Profile"
          description="Tier 1 · Visible to all"
          tierColor="blue"
        >
          <div className="space-y-5">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Identity
              </h4>
              <FieldGrid fields={identityFields} />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Current role
              </h4>
              <FieldGrid fields={roleFields} />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Company
              </h4>
              <FieldGrid fields={companyFields} />
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Location
              </h4>
              <FieldGrid fields={locationFields} />
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
          tierColor="violet"
        >
          <FeedbackPrompts entries={userEditableEntries} />
        </TierSection>

        {isAdmin && (
          <TierSection
            title="Admin Intelligence"
            description="Tier 3 · Admin only"
            tierColor="amber"
          >
            <div className="space-y-4">
              {adminProfileFields.length > 0 && (
                <FieldGrid fields={adminProfileFields} />
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
