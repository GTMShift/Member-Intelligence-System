import type { MemberDetail } from '../types/api';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const STALE_AFTER_DAYS = 90;

interface ProfileStalenessBannerProps {
  member: MemberDetail;
  onEnrichClick: () => void;
}

function isProfileStale(lastUpdated: string): boolean {
  const updatedAt = new Date(lastUpdated);
  if (Number.isNaN(updatedAt.getTime())) return false;

  const ageMs = Date.now() - updatedAt.getTime();
  return ageMs > STALE_AFTER_DAYS * MS_PER_DAY;
}

function scrollToMemberFeedback() {
  const heading = Array.from(document.querySelectorAll('h3')).find(
    (el) => el.textContent?.trim() === 'Member Feedback',
  );
  const section = heading?.closest('section');
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function ProfileStalenessBanner({
  member,
  onEnrichClick,
}: ProfileStalenessBannerProps) {
  if (!isProfileStale(member.last_updated)) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium text-amber-900">
          Your profile hasn&apos;t been updated in 90 days — is everything up to date?
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={scrollToMemberFeedback}
            className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
          >
            Update manually
          </button>
          <button
            type="button"
            onClick={onEnrichClick}
            className="rounded-md bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900"
          >
            Enrich my profile
          </button>
        </div>
      </div>
    </div>
  );
}
