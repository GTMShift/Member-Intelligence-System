// src/api/myProfileApi.ts
import { authenticatedFetch } from '../lib/authenticatedFetch';
import { sortEmploymentHistory } from '../lib/employmentForm';
import {
  REGION_FIELDS,
  TEAM_FIELDS,
  emptyRegionFlags,
  emptyTeamFlags,
  isTshirtSize,
  type RegionFlags,
  type TeamFlags,
  type TshirtSize,
} from '../lib/profileOptions';
import { supabase } from '../lib/supabaseClient';
import type { EmploymentHistoryEntry } from '../types/api';
import { createNotification } from './notificationsApi';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB

export interface MyProfileData {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;
  job_title: string | null;
  current_job_start_date: string | null;
  seniority_level: string | null;
  company_name: string | null;
  country: string | null;
  state_region: string | null;
  city: string | null;
  address: string | null;
  zip_code: string | null;
  team_size: number | null;
  management_layers: string | null;
  teams_overseen: TeamFlags;
  regions: RegionFlags;
  tshirt_size: TshirtSize | null;
  dietary_restrictions: string | null;
  avatar_url: string | null;
  employment_history: EmploymentHistoryEntry[];
}

// Employment is not part of this input: job changes and corrections go
// through saveMyEmployment so the career history is preserved.
export interface UpdateMyProfileInput {
  first_name: string;
  last_name: string;
  linkedin_url: string;
  phone: string | null;
  seniority_level: string | null;
  country: string | null;
  state_region: string | null;
  city: string | null;
  address: string | null;
  zip_code: string | null;
  team_size: number | null;
  management_layers: string | null;
  teams_overseen: TeamFlags;
  regions: RegionFlags;
  tshirt_size: TshirtSize | null;
  dietary_restrictions: string | null;
}

export type EmploymentAction = 'change' | 'correct';

export interface SaveEmploymentInput {
  company: string;
  role: string;
  start_date: string | null;
}

export interface SaveEmploymentResult {
  current: EmploymentHistoryEntry;
  history: EmploymentHistoryEntry[];
}

function getBackendUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL;
  if (!apiUrl) throw new Error('VITE_API_URL is not configured');
  return apiUrl.replace(/\/$/, '');
}

async function requestEmployment<T>(
  memberId: string,
  path = '',
  init?: RequestInit,
): Promise<T> {
  const response = await authenticatedFetch(
    `${getBackendUrl()}/members/${encodeURIComponent(memberId)}/employment${path}`,
    init,
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Employment request failed');
  return data as T;
}

export async function fetchMyEmploymentHistory(memberId: string): Promise<EmploymentHistoryEntry[]> {
  const history = await requestEmployment<EmploymentHistoryEntry[]>(memberId);
  return sortEmploymentHistory(history ?? []);
}

/**
 * Saves a job change ("change": the current job moves to history) or a
 * correction ("correct": the current job is edited in place). Only the member's
 * own record is accepted by the backend unless the caller is an admin.
 */
export async function saveMyEmployment(
  memberId: string,
  action: EmploymentAction,
  input: SaveEmploymentInput,
  memberName?: string,
): Promise<SaveEmploymentResult> {
  const result = await requestEmployment<SaveEmploymentResult>(memberId, `/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (action === 'change') {
    const name = memberName?.trim() || 'A member';
    // createNotification logs and never throws, so the saved job is never reported as a failure.
    await createNotification({
      type: 'job_change',
      title: 'Job change reported',
      body: `${name} reported a new job: ${result.current.role} at ${result.current.company}.`,
      member_id: memberId,
      member_name: memberName?.trim() || null,
    });
  }

  return { current: result.current, history: sortEmploymentHistory(result.history ?? []) };
}

function readFlags<K extends string>(
  source: Record<string, unknown> | null,
  fields: readonly { key: K }[],
  empty: Record<K, boolean>,
): Record<K, boolean> {
  const flags = { ...empty };
  for (const { key } of fields) flags[key] = source?.[key] === true;
  return flags;
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

export async function fetchMyProfile(memberId: string, profileId: string): Promise<MyProfileData> {
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('first_name, last_name, email, linkedin_url, phone')
    .eq('id', memberId)
    .single();
  if (memberErr) throw new Error(`Failed to load member: ${memberErr.message}`);

  const { data: profile, error: profileErr } = await supabase.rpc('get_my_member_profile');
  if (profileErr) throw new Error(`Failed to load member profile: ${profileErr.message}`);

  const employmentHistory = await fetchMyEmploymentHistory(memberId);
  const currentEmployment = employmentHistory.find((employment) => employment.is_current);

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', profileId)
    .maybeSingle();

  const details = (profile ?? null) as Record<string, unknown> | null;
  const teamSize = details?.team_size;
  const tshirtSize = details?.tshirt_size;

  return {
    first_name: member.first_name ?? '',
    last_name: member.last_name ?? '',
    email: member.email ?? '',
    linkedin_url: member.linkedin_url ?? '',
    phone: member.phone,
    job_title: currentEmployment?.role ?? null,
    current_job_start_date: currentEmployment?.start_date ?? null,
    seniority_level: profile?.seniority_level ?? null,
    company_name: currentEmployment?.company ?? profile?.company_name ?? null,
    employment_history: employmentHistory,
    country: profile?.country ?? null,
    state_region: profile?.state_region ?? null,
    city: profile?.city ?? null,
    address: textOrNull(details?.address),
    zip_code: textOrNull(details?.zip_code),
    team_size: typeof teamSize === 'number' ? teamSize : null,
    management_layers: textOrNull(details?.management_layers),
    teams_overseen: readFlags(details, TEAM_FIELDS, emptyTeamFlags()),
    regions: readFlags(details, REGION_FIELDS, emptyRegionFlags()),
    tshirt_size: isTshirtSize(tshirtSize) ? tshirtSize : null,
    dietary_restrictions: textOrNull(details?.dietary_restrictions),
    avatar_url: profileRow?.avatar_url ?? null,
  };
}

export async function updateMyProfile(
  memberId: string,
  input: UpdateMyProfileInput,
): Promise<void> {
  const { error: memberErr } = await supabase
    .from('members')
    .update({
      first_name: input.first_name,
      last_name: input.last_name,
      linkedin_url: input.linkedin_url,
      phone: input.phone,
    })
    .eq('id', memberId);
  if (memberErr) throw new Error(`Failed to update member: ${memberErr.message}`);

  // save_my_member_profile merges these keys over the saved row, so fields not
  // sent here (company, tags, event interest) keep their current values.
  const { error: profileErr } = await supabase.rpc('save_my_member_profile', {
    p_values: {
      seniority_level: input.seniority_level,
      country: input.country,
      state_region: input.state_region,
      city: input.city,
      address: input.address,
      zip_code: input.zip_code,
      team_size: input.team_size,
      management_layers: input.management_layers,
      tshirt_size: input.tshirt_size,
      dietary_restrictions: input.dietary_restrictions,
      ...input.teams_overseen,
      ...input.regions,
    },
  });
  if (profileErr) throw new Error(`Failed to update member profile: ${profileErr.message}`);

  await createNotification({
    type: 'profile_updated',
    title: 'Profile updated',
    body: `${input.first_name} ${input.last_name} updated their own profile.`,
    member_id: memberId,
    member_name: `${input.first_name} ${input.last_name}`,
  });
}

export async function uploadAvatar(profileId: string, file: File): Promise<string> {
  if (file.size > MAX_AVATAR_BYTES) {
    throw new Error('Image is too large — please choose a file under 5MB.');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.');
  }

  const ext = file.name.split('.').pop() ?? 'jpg';
  const path = `${profileId}/avatar.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (uploadErr) throw new Error(`Failed to upload image: ${uploadErr.message}`);

  const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(path);
  // Cache-bust so the new photo shows immediately instead of a stale cached version
  const publicUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;

  const { error: profileErr } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', profileId);
  if (profileErr) throw new Error(`Failed to save avatar: ${profileErr.message}`);

  return publicUrl;
}
