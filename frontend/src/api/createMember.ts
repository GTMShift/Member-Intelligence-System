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
    console.error('Error creating member:', memberError);
    throw new Error(memberError?.message ?? 'Failed to create member');
  }
 
  // Step 2: Insert into member_profile table
  const { error: profileError } = await supabase
    .from('member_profile')
    .insert({
      member_id: member.id,
      job_title: input.job_title,
      current_job_start_date: input.current_job_start_date,
      seniority_level: input.seniority_level,
      country: input.country,
      state_region: input.state_region,
      city: input.city,
      signup_source: input.signup_source,
    });
 
  if (profileError) {
    console.error('Error creating member profile:', profileError);
    throw new Error(profileError.message);
  }
 
  // Step 3: Insert into member_tags if a bucket was selected
  if (input.bucket) {
    const { error: tagError } = await supabase
      .from('member_tags')
      .insert({
        member_id: member.id,
        bucket: input.bucket,
        fit_score: input.fit_score,
        tagged_manually: true,
        tag_note: input.tag_note,
      });
 
    if (tagError) {
      console.error('Error creating member tag:', tagError);
      throw new Error(tagError.message);
    }
  }
 
  return { id: member.id };
}