// src/api/adminUpdateMember.ts
import { supabase } from '../lib/supabaseClient';
import { createNotification } from './notificationsApi';

export interface AdminUpdateMemberInput {
  first_name?: string;
  last_name?: string;
  linkedin_url?: string;
  phone?: string | null;
  job_title?: string | null;
  current_job_start_date?: string | null;
  seniority_level?: string | null;
  company_name?: string | null;
  country?: string | null;
  state_region?: string | null;
  city?: string | null;
  bucket?: string | null;
  fit_score?: number | null;
  tag_note?: string | null;
}

async function findOrCreateCompany(companyName: string | null): Promise<string | null> {
  const name = companyName?.trim();
  if (!name) return null;

  const { data: matches, error: findErr } = await supabase
    .from('companies')
    .select('id')
    .ilike('name', name)
    .limit(1);
  if (findErr) throw new Error(`Company lookup failed: ${findErr.message}`);
  if (matches && matches.length > 0) return matches[0].id;

  const { data: created, error: createErr } = await supabase
    .from('companies')
    .insert({ name })
    .select('id')
    .single();
  if (createErr) throw new Error(`Failed to create company: ${createErr.message}`);
  return created.id;
}

export async function updateMemberAsAdmin(
  memberId: string,
  input: AdminUpdateMemberInput,
  adminProfileId: string,
): Promise<void> {
  // Only update members table if identity fields were provided
  if (
    input.first_name !== undefined ||
    input.last_name !== undefined ||
    input.linkedin_url !== undefined ||
    input.phone !== undefined
  ) {
    const { error: memberErr } = await supabase
      .from('members')
      .update({
        ...(input.first_name !== undefined && { first_name: input.first_name }),
        ...(input.last_name !== undefined && { last_name: input.last_name }),
        ...(input.linkedin_url !== undefined && { linkedin_url: input.linkedin_url }),
        ...(input.phone !== undefined && { phone: input.phone }),
      })
      .eq('id', memberId);
    if (memberErr) throw new Error(`Failed to update member: ${memberErr.message}`);
  }

  // Only resolve company if company_name was explicitly provided
  const companyId = input.company_name !== undefined
    ? await findOrCreateCompany(input.company_name)
    : undefined;

  // Build profile update — only include fields that were explicitly provided
  const profileUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.seniority_level !== undefined) profileUpdate.seniority_level = input.seniority_level;
  if (input.country !== undefined) profileUpdate.country = input.country;
  if (input.state_region !== undefined) profileUpdate.state_region = input.state_region;
  if (input.city !== undefined) profileUpdate.city = input.city;
  if (companyId !== undefined) profileUpdate.company_id = companyId;

  if (input.bucket !== undefined) {
    profileUpdate.bucket = input.bucket;
    profileUpdate.tagged_manually = input.bucket ? true : null;
    profileUpdate.tagged_at = input.bucket ? new Date().toISOString() : null;
    profileUpdate.tagged_by = input.bucket ? adminProfileId : null;
  }

  if (input.fit_score !== undefined) profileUpdate.fit_score = input.fit_score;
  if (input.tag_note !== undefined) profileUpdate.tag_note = input.tag_note;

  const { error: profileErr } = await supabase
    .from('member_profile')
    .update(profileUpdate)
    .eq('member_id', memberId);
  if (profileErr) throw new Error(`Failed to update member profile: ${profileErr.message}`);

  // Only update employment history if job_title was provided
  if (input.job_title !== undefined) {
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

  // Only send notification if we have name fields to use
  if (input.first_name && input.last_name) {
    await createNotification({
      type: 'profile_updated',
      title: 'Profile updated',
      body: `${input.first_name} ${input.last_name}'s profile was updated by an admin.`,
      member_id: memberId,
      member_name: `${input.first_name} ${input.last_name}`,
    });
  }
}