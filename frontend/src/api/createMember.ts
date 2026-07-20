// src/api/createMember.ts
import { supabase } from '../lib/supabaseClient';

export interface CreateMemberInput {
  // Core identity
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;

  // Profile
  job_title: string | null;
  current_job_start_date: string | null;
  seniority_level: string | null;
  company_name: string | null;
  country: string | null;
  state_region: string | null;
  city: string | null;
  signup_source: 'Website' | 'Luma' | 'Substack' | 'Manual';

  // ICP classification
  bucket: 'icp_member' | 'between_roles' | 'adjacent_remit' | 'consultant' | 'sponsor' | 'personal_connection' | null;
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

export async function createMember(input: CreateMemberInput): Promise<{ id: string } | null> {
  // Step 1: Insert into members table
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

  // Step 2: Resolve (or create) the company — this actually gets saved now,
  // unlike before, where company_name was collected on the form but silently
  // discarded.
  const companyId = await findOrCreateCompany(input.company_name);

  // Step 3: Insert into member_profile.
  // bucket/fit_score/tag_note live directly on member_profile (added via
  // migration), not a separate member_tags table — that table only ever
  // existed in the sandbox schema, not public, so writing there previously
  // errored out whenever an admin selected a bucket.
  const { error: profileError } = await supabase.from('member_profile').insert({
    member_id: member.id,
    seniority_level: input.seniority_level,
    country: input.country,
    state_region: input.state_region,
    city: input.city,
    company_id: companyId,
    signup_source: input.signup_source,
    bucket: input.bucket,
    fit_score: input.fit_score,
    tag_note: input.tag_note,
    tagged_manually: input.bucket ? true : null,
    tagged_at: input.bucket ? new Date().toISOString() : null,
  });

  if (profileError) {
    throw new Error(`Failed to create member profile: ${profileError.message}`);
  }

  // Step 4: Job title lives in employment_history, not member_profile
  // (job_title was intentionally dropped from member_profile in the schema
  // redesign — employment_history with is_current is the source of truth).
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

  return { id: member.id };
}