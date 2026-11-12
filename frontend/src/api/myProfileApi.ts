// src/api/myProfileApi.ts
import { authenticatedFetch } from '../lib/authenticatedFetch';
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
  avatar_url: string | null;
  employment_history: EmploymentHistoryEntry[];
}

export interface UpdateMyProfileInput {
  first_name: string;
  last_name: string;
  linkedin_url: string;
  phone: string | null;
  seniority_level: string | null;
  country: string | null;
  state_region: string | null;
  city: string | null;
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

export function fetchMyEmploymentHistory(memberId: string): Promise<EmploymentHistoryEntry[]> {
  return requestEmployment<EmploymentHistoryEntry[]>(memberId);
}

export function saveMyEmployment(
  memberId: string,
  action: EmploymentAction,
  input: SaveEmploymentInput,
): Promise<SaveEmploymentResult> {
  return requestEmployment<SaveEmploymentResult>(memberId, `/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
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

  const { error: profileErr } = await supabase.rpc('save_my_member_profile', {
    p_values: {
      seniority_level: input.seniority_level,
      country: input.country,
      state_region: input.state_region,
      city: input.city,
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
