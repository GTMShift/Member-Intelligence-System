const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatTimestamp(timestamp: string | null | undefined): string {
  if (!timestamp) {
    return '—';
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  const diffDays = Math.floor(
    (startOfDay(new Date()).getTime() - startOfDay(date).getTime()) / MS_PER_DAY,
  );

  if (diffDays === 0) {
    return 'today';
  }

  if (diffDays === 1) {
    return 'yesterday';
  }

  if (diffDays >= 2 && diffDays <= 6) {
    return `${diffDays} days ago`;
  }

  if (diffDays >= 7 && diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = firstName?.trim() ?? '';
  const last = lastName?.trim() ?? '';
  const combined = `${first} ${last}`.trim();

  return combined || '—';
}
