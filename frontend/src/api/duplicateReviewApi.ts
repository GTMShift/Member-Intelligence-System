import { authenticatedFetch } from '../lib/authenticatedFetch';
import type { EmploymentHistoryEntry } from '../types/api';

export type DuplicateReviewStatus = 'pending' | 'deferred' | 'dismissed';

export interface DuplicateReviewMember {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string | null;
  phone: string | null;
  profile: {
    job_title: string | null;
    seniority_level: string | null;
    company_name: string | null;
    city: string | null;
    state_region: string | null;
    country: string | null;
  } | null;
  employment_history: EmploymentHistoryEntry[];
  linked_records: Record<string, string[]>;
}

export interface DuplicateReviewPair {
  id: string;
  member_a: DuplicateReviewMember;
  member_b: DuplicateReviewMember;
  match_reasons: Array<{ field: string; label: string }>;
  confidence: number;
  status: DuplicateReviewStatus;
  created_at: string;
}

const API_URL = import.meta.env.VITE_API_URL;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? 'Duplicate review request failed');
  return body as T;
}

export async function fetchDuplicateReviewPairs(status: DuplicateReviewStatus) {
  const result = await request<{ pairs: DuplicateReviewPair[] }>(`/duplicate-review?status=${status}`);
  return result.pairs;
}

export function scanDuplicateMembers() {
  return request<{ scanned: number; candidates: number; added: number }>('/duplicate-review/scan', { method: 'POST' });
}

export function updateDuplicateReviewStatus(id: string, status: 'pending' | 'deferred' | 'dismissed') {
  return request<{ id: string; status: DuplicateReviewStatus }>(`/duplicate-review/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function mergeDuplicateMembers(id: string, survivorId: string, fieldSources: Record<string, 'a' | 'b'>) {
  return request<{ auditId: string; survivorId: string; mergedMemberId: string; movedRecordCounts: Record<string, number> }>(`/duplicate-review/${id}/merge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ survivorId, fieldSources }),
  });
}
