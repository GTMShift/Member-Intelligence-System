// src/lib/employmentForm.ts
// Helpers for the self-service "Changed jobs" / "Correct current information" forms.
// The backend and save_member_employment (migration 043) enforce the same rules;
// these give the member a clear message before the request is sent.
import type { EmploymentHistoryEntry } from '../types/api';

export type EmploymentFormAction = 'change' | 'correct';

export interface EmploymentFormValues {
  company: string;
  role: string;
  start_date: string; // YYYY-MM-DD, or '' when not given
}

export const MAX_EMPLOYMENT_TEXT_LENGTH = 200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

/** Today's date in the member's own time zone, as YYYY-MM-DD. */
export function todayIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * The end date the backend gives the previous job when a job change is saved:
 * the day before the new start date, or the same day when both jobs start on it.
 */
export function previousJobEndDate(newStartDate: string, currentStartDate: string | null): string | null {
  if (!isCalendarDate(newStartDate)) return null;
  if (currentStartDate === newStartDate) return newStartDate;
  const date = new Date(`${newStartDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/** "2026-11-01" -> "Nov 1, 2026". Empty or invalid values return the fallback. */
export function formatEmploymentDate(value: string | null | undefined, fallback = 'Not listed'): string {
  if (!value || !isCalendarDate(value)) return value || fallback;
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Current job first, then previous jobs newest first (same order as the admin view). */
export function sortEmploymentHistory(history: EmploymentHistoryEntry[]): EmploymentHistoryEntry[] {
  return [...history].sort(
    (a, b) =>
      Number(b.is_current) - Number(a.is_current) ||
      (b.start_date ?? '').localeCompare(a.start_date ?? ''),
  );
}

export function emptyEmploymentForm(): EmploymentFormValues {
  return { company: '', role: '', start_date: '' };
}

export function employmentFormFromCurrent(current: EmploymentHistoryEntry | undefined): EmploymentFormValues {
  return {
    company: current?.company ?? '',
    role: current?.role ?? '',
    start_date: current?.start_date ?? '',
  };
}

/** Returns a message for the first problem found, or null when the form can be saved. */
export function validateEmploymentForm(
  action: EmploymentFormAction,
  values: EmploymentFormValues,
  current: EmploymentHistoryEntry | undefined,
  today: string = todayIsoDate(),
): string | null {
  const company = values.company.trim();
  const role = values.role.trim();
  const startDate = values.start_date;

  if (!company) return action === 'change' ? 'Enter your new company.' : 'Enter your company.';
  if (!role) return action === 'change' ? 'Enter your new job title.' : 'Enter your job title.';
  if (company.length > MAX_EMPLOYMENT_TEXT_LENGTH || role.length > MAX_EMPLOYMENT_TEXT_LENGTH) {
    return `Company and job title must be ${MAX_EMPLOYMENT_TEXT_LENGTH} characters or fewer.`;
  }

  if (action === 'change' && !startDate) return 'Enter the date you started your new job.';
  if (startDate) {
    if (!isCalendarDate(startDate)) return 'Enter a valid start date.';
    if (startDate > today) return 'The start date can\'t be in the future. Report the change once the new job has started.';
  }

  if (action === 'change' && current) {
    if (current.start_date && startDate < current.start_date) {
      return `Your new job can't start before your current job (${formatEmploymentDate(current.start_date)}).`;
    }
    if (
      company.toLowerCase() === current.company.trim().toLowerCase() &&
      role.toLowerCase() === (current.role ?? '').trim().toLowerCase()
    ) {
      return 'That is the same company and job title as your current job. To fix details, use "Correct current information" instead.';
    }
  }

  if (action === 'correct' && current) {
    // A blank start date keeps the saved one (the backend ignores it).
    const unchanged =
      company === current.company.trim() &&
      role === (current.role ?? '').trim() &&
      (startDate || current.start_date || null) === (current.start_date ?? null);
    if (unchanged) return 'Nothing has changed yet. Edit a field before saving.';
  }

  return null;
}
