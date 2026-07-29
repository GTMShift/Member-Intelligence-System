import type { EnrichmentResult } from '../types/api';

type EnrichmentContact = NonNullable<EnrichmentResult['contact']>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    const obj = asRecord(value);
    if (!obj) continue;
    if (typeof obj.email === 'string' && obj.email.trim()) return obj.email.trim();
    if (typeof obj.number === 'string' && obj.number.trim()) return obj.number.trim();
  }
  return undefined;
}

function formatLocationValue(location: unknown): string | undefined {
  if (typeof location === 'string' && location.trim()) return location.trim();
  const loc = asRecord(location);
  if (!loc) return undefined;
  const parts = [loc.city, loc.region, loc.country]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/** Convert FullEnrich start_at into YYYY-MM-DD for date inputs / DB. */
export function formatEnrichmentStartDate(
  startAt: string | { month?: number; year?: number } | null | undefined,
): string | null {
  if (!startAt) return null;
  if (typeof startAt === 'string') {
    const datePart = startAt.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
  }
  const year = startAt.year;
  const month = startAt.month;
  if (!year || !month) return null;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/**
 * Normalize FullEnrich status payloads (legacy `contact` wrapper or newer
 * `contact_info` + `profile.employment`) into the shape EnrichmentReviewPanel expects.
 */
export function normalizeFullEnrichRecord(row: unknown): EnrichmentContact | null {
  const root = asRecord(row);
  if (!root) return null;

  const legacy = asRecord(root.contact);
  const info = asRecord(root.contact_info) ?? legacy;
  const profile = asRecord(root.profile) ?? asRecord(legacy?.profile);
  const employment = asRecord(profile?.employment);
  const position =
    asRecord(employment?.current) ??
    asRecord(profile?.position) ??
    asRecord(asRecord(legacy?.profile)?.position);
  const company = asRecord(position?.company);

  const firstPhone = Array.isArray(info?.phones)
    ? info.phones[0]
    : Array.isArray(legacy?.phones)
      ? legacy.phones[0]
      : undefined;

  const email = pickString(
    legacy?.most_probable_email,
    info?.most_probable_work_email,
    info?.most_probable_email,
  );
  const phone = pickString(legacy?.most_probable_phone, info?.most_probable_phone, firstPhone);

  const title = pickString(position?.title);
  const companyName = pickString(company?.name);
  const seniority = pickString(position?.seniority);
  const startAt = position?.start_at;
  const location = formatLocationValue(
    asRecord(legacy?.profile)?.location ?? profile?.location,
  );

  if (!email && !phone && !title && !companyName && !seniority && !startAt && !location) {
    return (legacy as EnrichmentContact | null) ?? null;
  }

  return {
    most_probable_email: email,
    most_probable_phone: phone,
    profile: {
      location,
      position: {
        title,
        seniority,
        company: companyName ? { name: companyName } : undefined,
        start_at:
          typeof startAt === 'string' || (startAt !== null && typeof startAt === 'object')
            ? (startAt as string | { month?: number; year?: number })
            : undefined,
      },
    },
  };
}
