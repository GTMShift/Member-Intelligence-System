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

  // Uses .limit(1) + array check instead of .maybeSingle(), since .maybeSingle()
  // throws an error (not just returns null) if more than one company happens to
  // share a similar name — which would otherwise surface as a confusing failure
  // partway through signup.
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

/**
 * Creates a new member record from a self-service signup and links it to the
 * person's existing profiles row (profileId = the authenticated user's id).
 *
 * Resumable: if a previous attempt partially failed (e.g. member row created
 * but company/profile step failed), calling this again picks up where it left
 * off instead of hitting a duplicate-email error and leaving the person stuck.
 *
 * Deliberately does NOT touch ICP/bucket/tagging fields — those are internal-only
 * and members should never set their own classification.
 */
export async function createMemberSelf(
  input: SelfSignupInput,
  profileId: string,
): Promise<{ id: string }> {
  // Step 1: find-or-create the member row itself
  const { data: existingMember, error: existingErr } = await supabase
    .from('members')
    .select('id')
    .eq('email', input.email)
    .maybeSingle(); // safe here — email has a unique constraint, so at most one match
  if (existingErr) {
    throw new Error(`Failed to check for existing member: ${existingErr.message}`);
  }

  let memberId: string;
  const isNewMember = !existingMember;

  if (existingMember) {
    memberId = existingMember.id;
    const { error: updateErr } = await supabase
      .from('members')
      .update({
        first_name: input.first_name,
        last_name: input.last_name,
        linkedin_url: input.linkedin_url,
        phone: input.phone,
      })
      .eq('id', memberId);
    if (updateErr) throw new Error(`Failed to update member: ${updateErr.message}`);
  } else {
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
    memberId = member.id;
  }

  // Step 2: company (safe to retry — findOrCreateCompany is itself idempotent)
  const companyId = await findOrCreateCompany(input.company_name);

  // Step 3: find-or-create the member_profile row
  const { data: existingProfile, error: profileCheckErr } = await supabase
    .from('member_profile')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle();
  if (profileCheckErr) {
    throw new Error(`Failed to check for existing profile: ${profileCheckErr.message}`);
  }

  const profileFields = {
    seniority_level: input.seniority_level,
    country: input.country,
    state_region: input.state_region,
    city: input.city,
    company_id: companyId,
    signup_source: 'Website',
  };

  if (existingProfile) {
    const { error: profileUpdateErr } = await supabase
      .from('member_profile')
      .update(profileFields)
      .eq('id', existingProfile.id);
    if (profileUpdateErr) {
      throw new Error(`Failed to update member profile: ${profileUpdateErr.message}`);
    }
  } else {
    const { error: profileInsertErr } = await supabase
      .from('member_profile')
      .insert({ member_id: memberId, ...profileFields });
    if (profileInsertErr) {
      throw new Error(`Failed to create member profile: ${profileInsertErr.message}`);
    }
  }

  // Step 4: current employment history (job title lives here, not member_profile)
  if (input.job_title) {
    const { data: existingCurrent } = await supabase
      .from('employment_history')
      .select('id')
      .eq('member_id', memberId)
      .eq('is_current', true)
      .maybeSingle();

    if (existingCurrent) {
      const { error: employmentUpdateErr } = await supabase
        .from('employment_history')
        .update({
          company: input.company_name,
          role: input.job_title,
          start_date: input.current_job_start_date,
        })
        .eq('id', existingCurrent.id);
      if (employmentUpdateErr) {
        throw new Error(`Failed to update employment history: ${employmentUpdateErr.message}`);
      }
    } else {
      const { error: employmentInsertErr } = await supabase.from('employment_history').insert({
        member_id: memberId,
        company: input.company_name,
        role: input.job_title,
        start_date: input.current_job_start_date,
        is_current: true,
        source: 'Manual',
      });
      if (employmentInsertErr) {
        throw new Error(`Failed to create employment history: ${employmentInsertErr.message}`);
      }
    }
  }

  // Step 5: link this member to the person's auth profile
  const { error: linkError } = await supabase
    .from('profiles')
    .update({ member_id: memberId })
    .eq('id', profileId);
  if (linkError) {
    throw new Error(`Failed to link profile to member: ${linkError.message}`);
  }

  // Only fire the "new signup" notification and duplicate check once, on the
  // actual first successful completion — not on every retry of a resumed signup.
  if (isNewMember) {
    await createNotification({
      type: 'new_signup',
      title: 'New member signup',
      body: `${input.first_name} ${input.last_name} signed up and was added to the directory.`,
      member_id: memberId,
      member_name: `${input.first_name} ${input.last_name}`,
    });

    await checkAndFlagDuplicate(memberId, {
      first_name: input.first_name,
      last_name: input.last_name,
      email: input.email,
      linkedin_url: input.linkedin_url || null,
      phone: input.phone,
      current_role: input.job_title,
    });
  }

  return { id: memberId };
}