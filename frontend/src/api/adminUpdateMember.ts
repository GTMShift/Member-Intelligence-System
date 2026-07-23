// src/api/adminUpdateMember.ts
import { supabase } from '../lib/supabaseClient';
import { createNotification } from './notificationsApi';

export interface AdminUpdateMemberInput {
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
  bucket: string | null;
  fit_score: number | null;
  tag_note: string | null;
}

async function findOrCreateCompany(companyName: string | null): Promise<string | null> {
    const name = companyName?.trim();
    if (!name) return null;
  
    // Uses .limit(1) + array check instead of .maybeSingle(), since .maybeSingle()
    // throws an error (not just returns null) if more than one company happens to
    // share a similar name — which would otherwise surface as a confusing failure.
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
      bucket: input.bucket,
      fit_score: input.fit_score,
      tag_note: input.tag_note,
      tagged_manually: input.bucket ? true : null,
      tagged_at: input.bucket ? new Date().toISOString() : null,
      tagged_by: input.bucket ? adminProfileId : null,
      updated_at: new Date().toISOString(),
    })
    .eq('member_id', memberId);
  if (profileErr) throw new Error(`Failed to update member profile: ${profileErr.message}`);

  // Update (or create) the current employment_history row — same pattern as
  // the member's own self-service profile editor.
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

  await createNotification({
    type: 'profile_updated',
    title: 'Profile updated',
    body: `${input.first_name} ${input.last_name}'s profile was updated by an admin.`,
    member_id: memberId,
    member_name: `${input.first_name} ${input.last_name}`,
  });
}