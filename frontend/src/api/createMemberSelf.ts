// src/api/createMemberSelf.ts
import { supabase } from '../lib/supabaseClient';
import { createNotification } from './notificationsApi';
import { checkAndFlagDuplicate } from './duplicateFlagsApi';

export interface SelfSignupInput {
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

/**
 * Creates a new member record from a self-service signup and links it to the
 * person's existing profiles row (profileId = the authenticated user's id).
 * Deliberately does NOT touch ICP/bucket/tagging fields — those are internal-only
 * and members should never set their own classification.
 */
export async function createMemberSelf(
  input: SelfSignupInput,
  profileId: string,
): Promise<{ id: string }> {
  const { data: member, error: memberError } = await supabase
    .from('members')
    .insert({
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      linkedin_url: input.linkedin_url,
      phone: input.phone,
    })
    .select('id')
    .single();

  if (memberError || !member) {
    throw new Error(memberError?.message ?? 'Failed to create member');
  }

  const companyId = await findOrCreateCompany(input.company_name);

  const { error: profileError } = await supabase.from('member_profile').insert({
    member_id: member.id,
    seniority_level: input.seniority_level,
    country: input.country,
    state_region: input.state_region,
    city: input.city,
    company_id: companyId,
    signup_source: 'Website',
  });
  if (profileError) {
    throw new Error(`Failed to create member profile: ${profileError.message}`);
  }

  // Job title lives in employment_history, not member_profile, per the real schema
  if (input.job_title) {
    const { error: employmentError } = await supabase.from('employment_history').insert({
      member_id: member.id,
      company: input.company_name,
      role: input.job_title,
      start_date: input.current_job_start_date,
      is_current: true,
      source: 'Manual',
    });
    if (employmentError) {
      throw new Error(`Failed to create employment history: ${employmentError.message}`);
    }
  }

  const { error: linkError } = await supabase
    .from('profiles')
    .update({ member_id: member.id })
    .eq('id', profileId);
  if (linkError) {
    throw new Error(`Failed to link profile to member: ${linkError.message}`);
  }

  await createNotification({
    type: 'new_signup',
    title: 'New member signup',
    body: `${input.first_name} ${input.last_name} signed up and was added to the directory.`,
    member_id: member.id,
    member_name: `${input.first_name} ${input.last_name}`,
  });

  await checkAndFlagDuplicate(member.id, {
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    linkedin_url: input.linkedin_url || null,
    phone: input.phone,
    current_role: input.job_title,
  });

  return { id: member.id };
}