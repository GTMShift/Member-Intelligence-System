import { useMemo, useState } from 'react';
import { MOCK_DUPLICATE_FLAGS } from '../api/mockDuplicateFlags';
import { MOCK_MEMBERS } from '../api/mockMembers';
import type { DedupMatchedOn, PendingDuplicateFlag } from '../types/api';
import { fullName } from '../utils/format';

const MATCHED_ON_LABELS: Record<DedupMatchedOn, string> = {
  email: 'email',
  linkedin_url: 'LinkedIn URL',
  phone: 'phone',
};

interface DuplicateFlagAlertsProps {
  onViewExistingMember: (memberId: string) => void;
}

function getExistingMemberName(existingMemberId: string): string {
  const member = MOCK_MEMBERS.find((m) => m.id === existingMemberId);
  if (!member) return 'Unknown member';
  return fullName(member.first_name, member.last_name);
}

function DuplicateFlagCard({
  flag,
  onViewExistingMember,
  onDismiss,
}: {
  flag: PendingDuplicateFlag;
  onViewExistingMember: (memberId: string) => void;
  onDismiss: (flagId: string) => void;
}) {
  const { check, incoming } = flag;
  const existingMemberName = getExistingMemberName(check.existing_member_id);
  const incomingName = fullName(incoming.first_name, incoming.last_name);

  return (
    <article
      className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm"
      aria-label={`Potential duplicate for ${incomingName}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800"
          aria-hidden="true"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
            />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-900">
            Potential duplicate detected
          </h3>

          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-amber-800/70">
                Incoming member
              </dt>
              <dd className="mt-0.5 text-slate-900">
                {incomingName}
                <span className="text-slate-600"> · {incoming.email}</span>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-amber-800/70">
                Existing member
              </dt>
              <dd className="mt-0.5">
                <button
                  type="button"
                  onClick={() => onViewExistingMember(check.existing_member_id)}
                  className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
                >
                  {existingMemberName}
                </button>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-amber-800/70">
                Matched on
              </dt>
              <dd className="mt-0.5 text-slate-900">
                {MATCHED_ON_LABELS[check.matched_on]}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onViewExistingMember(check.existing_member_id)}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              View Existing Member
            </button>
            <button
              type="button"
              onClick={() => onDismiss(flag.id)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function DuplicateFlagAlerts({ onViewExistingMember }: DuplicateFlagAlertsProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const visibleFlags = useMemo(
    () => MOCK_DUPLICATE_FLAGS.filter((flag) => !dismissedIds.has(flag.id)),
    [dismissedIds],
  );

  if (visibleFlags.length === 0) return null;

  const handleDismiss = (flagId: string) => {
    setDismissedIds((prev) => new Set(prev).add(flagId));
  };

  return (
    <section
      className="border-b border-amber-100 bg-amber-50/40 px-4 py-4 sm:px-6"
      aria-label="Duplicate member alerts"
    >
      <div className="mx-auto max-w-[90rem] space-y-3">
        {visibleFlags.map((flag) => (
          <DuplicateFlagCard
            key={flag.id}
            flag={flag}
            onViewExistingMember={onViewExistingMember}
            onDismiss={handleDismiss}
          />
        ))}
      </div>
    </section>
  );
}
