// src/api/myProfileApi.ts
import { supabase } from '../lib/supabaseClient';

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
}

export interface UpdateMyProfileInput {
  first_name: string;
  last_name: string;
  linkedin_url: string;
  phone: string | null;
  job_title: string | null;
  current_job_start_date: string | null;
  seniority_level: string | null;
  company_name: string | null;
  country: string | null;
  state_region: string | null;
  city: string | null;
}

async function findOrCreateCompany(companyName: string | null): Promise<string | null> {
  const name = companyName?.trim();
  if (!name) return null;

  const { data: existing, error: findErr } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', name)
    .maybeSingle();
  if (findErr) throw new Error(`Company lookup failed: ${findErr.message}`);
  if (existing) return existing.id;

  const { data: created, error: createErr } = await supabase
    .from('companies')
    .insert({ name })
    .select('id')
    .single();
  if (createErr) throw new Error(`Failed to create company: ${createErr.message}`);
  return created.id;
}

export async function fetchMyProfile(memberId: string, profileId: string): Promise<MyProfileData> {
  const { data: member, error: memberErr } = await supabase
    .from('members')
    .select('first_name, last_name, email, linkedin_url, phone')
    .eq('id', memberId)
    .single();
  if (memberErr) throw new Error(`Failed to load member: ${memberErr.message}`);

  const { data: profile } = await supabase
    .from('member_profile')
    .select('seniority_level, country, state_region, city, company_id, companies(name)')
    .eq('member_id', memberId)
    .maybeSingle();

  const { data: currentEmployment } = await supabase
    .from('employment_history')
    .select('role, start_date')
    .eq('member_id', memberId)
    .eq('is_current', true)
    .maybeSingle();

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', profileId)
    .maybeSingle();

  const companyRaw = profile?.companies;
  const company = Array.isArray(companyRaw) ? companyRaw[0] : companyRaw;

  return {
    first_name: member.first_name ?? '',
    last_name: member.last_name ?? '',
    email: member.email ?? '',
    linkedin_url: member.linkedin_url ?? '',
    phone: member.phone,
    job_title: currentEmployment?.role ?? null,
    current_job_start_date: currentEmployment?.start_date ?? null,
    seniority_level: profile?.seniority_level ?? null,
    company_name: company?.name ?? null,
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

  const companyId = await findOrCreateCompany(input.company_name);

  const { error: profileErr } = await supabase
    .from('member_profile')
    .update({
      seniority_level: input.seniority_level,
      country: input.country,
      state_region: input.state_region,
      city: input.city,
      company_id: companyId,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId);
  if (profileErr) throw new Error(`Failed to update member profile: ${profileErr.message}`);

  // Update (or create) the current employment_history row
  const { data: existingCurrent } = await supabase
    .from('employment_history')
    .select('id')
    .eq('member_id', memberId)
    .eq('is_current', true)
    .maybeSingle();

  if (input.job_title) {
    if (existingCurrent) {
      const { error: empErr } = await supabase
        .from('employment_history')
        .update({
          company: input.company_name,
          role: input.job_title,
          start_date: input.current_job_start_date,
        })
        .eq('id', existingCurrent.id);
      if (empErr) throw new Error(`Failed to update employment history: ${empErr.message}`);
    } else {
      const { error: empErr } = await supabase.from('employment_history').insert({
        member_id: memberId,
        company: input.company_name,
        role: input.job_title,
        start_date: input.current_job_start_date,
        is_current: true,
        source: 'Manual',
      });
      if (empErr) throw new Error(`Failed to create employment history: ${empErr.message}`);
    }
  }
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