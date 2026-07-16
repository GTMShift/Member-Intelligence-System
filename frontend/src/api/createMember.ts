import { supabase } from '../lib/supabaseClient';
 
export interface CreateMemberInput {
  // Section 1 - Basic info (members table)
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;
 
  // Section 2 - Location (member_profile)
  city: string | null;
  state_region: string | null;
  zip_code: string | null;
  address: string | null;
  country: string | null;
 
  // Section 3 - Event info (member_profile)
  teams_you_oversee: string[];
  regions: string[];
  dietary_restrictions: string | null;
  event_interest: string | null;
  management_layers: string | null;
 
  // Section 4 - ICP classification (member_profile)
  bucket: 'icp_member' | 'between_roles' | 'adjacent_remit' | 'consultant' | 'sponsor' | 'personal_connection' | null;
  fit_score: number | null;
  tag_note: string | null;
 
  // Section 5 - Current role & company
  current_company: string | null;
  current_role: string | null;
  current_start_date: string | null;
}
 
export async function createMember(input: CreateMemberInput): Promise<{ id: string } | null> {
  // Get the currently logged in admin's ID for tagged_by
  const { data: { user } } = await supabase.auth.getUser();
 
  // Step 1: Insert into members table
  const { data: member, error: memberError } = await supabase
    .from('members')
    .insert({
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      email: input.email.trim(),
      linkedin_url: input.linkedin_url.trim(),
      phone: input.phone,
      record_source: 'Manual',
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    })
    .select('id')
    .single();
 
  if (memberError || !member) {
    console.error('Error creating member:', memberError);
    throw new Error(memberError?.message ?? 'Failed to create member');
  }
 
  // Step 2: Resolve company ID if a company name was provided
  let companyId: string | null = null;
 
  if (input.current_company) {
    const companyName = input.current_company.trim();
 
    // Check if company already exists (exact match, case insensitive)
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', companyName)
      .maybeSingle();
 
    if (existingCompany) {
      // Use existing company
      companyId = existingCompany.id;
    } else {
      // Create new company with just the name
      const { data: newCompany, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
 
      if (companyError || !newCompany) {
        console.error('Error creating company:', companyError);
        throw new Error(companyError?.message ?? 'Failed to create company');
      }
 
      companyId = newCompany.id;
    }
  }
 
  // Step 3: Insert into member_profile table
  const { error: profileError } = await supabase
    .from('member_profile')
    .insert({
      member_id: member.id,
      company_id: companyId,
      city: input.city,
      state_region: input.state_region,
      zip_code: input.zip_code,
      address: input.address,
      country: input.country,
      teams_you_oversee: input.teams_you_oversee.length > 0 ? input.teams_you_oversee : null,
      regions: input.regions.length > 0 ? input.regions : null,
      dietary_restrictions: input.dietary_restrictions,
      event_interest: input.event_interest,
      management_layers: input.management_layers,
      bucket: input.bucket,
      fit_score: input.fit_score,
      tag_note: input.tag_note,
      tagged_manually: true,
      tagged_at: input.bucket ? new Date().toISOString() : null,
      tagged_by: user?.id ?? null,
      signup_source: 'Manual',
      updated_at: new Date().toISOString(),
    });
 
  if (profileError) {
    console.error('Error creating member profile:', profileError);
    throw new Error(profileError.message);
  }
 
  // Step 4: Insert into employment_history if company is provided
  if (input.current_company) {
    // Set any existing current roles to is_current = false first
    const { error: updateError } = await supabase
      .from('employment_history')
      .update({ is_current: false })
      .eq('member_id', member.id)
      .eq('is_current', true);
 
    if (updateError) {
      console.error('Error updating existing employment:', updateError);
      throw new Error(updateError.message);
    }
 
    // Insert new current role
    const { error: employmentError } = await supabase
      .from('employment_history')
      .insert({
        member_id: member.id,
        company: input.current_company.trim(),
        role: input.current_role,
        start_date: input.current_start_date || null,
        end_date: null,
        is_current: true,
        source: 'Manual',
        created_at: new Date().toISOString(),
      });
 
    if (employmentError) {
      console.error('Error creating employment history:', employmentError);
      throw new Error(employmentError.message);
    }
  }
 
  return { id: member.id };
}