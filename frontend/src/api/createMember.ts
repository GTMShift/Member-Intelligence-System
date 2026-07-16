
import { supabase } from '../lib/supabaseClient';
 
export interface CreateMemberInput {
  // Section 1 - Profile Information (members table)
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;
 
  // Section 2 - Organizational Details (member_profile)
  team_size: number | null;
  company_name: string | null;
  current_role: string | null;
  current_start_date: string | null;
  // Teams (booleans)
  oversees_customer_success: boolean;
  oversees_demo_engineering: boolean;
  oversees_enablement: boolean;
  oversees_forward_deployed_engineering: boolean;
  oversees_implementation_onboarding: boolean;
  oversees_partnerships_channel_se: boolean;
  oversees_professional_services: boolean;
  oversees_solutions_architecture: boolean;
  oversees_solutions_engineering_consulting: boolean;
  oversees_value_engineering: boolean;
  // Regions (booleans)
  region_north_america: boolean;
  region_regional_usa: boolean;
  region_global: boolean;
  region_emea: boolean;
  region_apac: boolean;
  region_latin_america: boolean;
  // Other org fields
  management_layers: string | null;
  event_interest: string | null;
 
  // Section 3 - ICP Classification (member_profile)
  bucket: 'primary_icp' | 'secondary_icp' | 'watchlist' | 'between_jobs' | 'consultant' | 'partner_sponsor' | 'icp_no' | 'manual_review' | null;
  fit_score: number | null;
  tag_note: string | null;
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
 
  if (input.company_name) {
    const companyName = input.company_name.trim();
 
    // Check if company already exists (exact match, case insensitive)
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', companyName)
      .maybeSingle();
 
    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      // Create new company
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
      team_size: input.team_size,
      // Teams
      oversees_customer_success: input.oversees_customer_success,
      oversees_demo_engineering: input.oversees_demo_engineering,
      oversees_enablement: input.oversees_enablement,
      oversees_forward_deployed_engineering: input.oversees_forward_deployed_engineering,
      oversees_implementation_onboarding: input.oversees_implementation_onboarding,
      oversees_partnerships_channel_se: input.oversees_partnerships_channel_se,
      oversees_professional_services: input.oversees_professional_services,
      oversees_solutions_architecture: input.oversees_solutions_architecture,
      oversees_solutions_engineering_consulting: input.oversees_solutions_engineering_consulting,
      oversees_value_engineering: input.oversees_value_engineering,
      // Regions
      region_north_america: input.region_north_america,
      region_regional_usa: input.region_regional_usa,
      region_global: input.region_global,
      region_emea: input.region_emea,
      region_apac: input.region_apac,
      region_latin_america: input.region_latin_america,
      // Other org fields
      management_layers: input.management_layers,
      event_interest: input.event_interest,
      // ICP classification
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
 
  // Step 4: Insert into employment_history if company and role provided
  if (input.company_name) {
    // Set existing current roles to false first
    await supabase
      .from('employment_history')
      .update({ is_current: false })
      .eq('member_id', member.id)
      .eq('is_current', true);
 
    // Insert new current role
    const { error: employmentError } = await supabase
      .from('employment_history')
      .insert({
        member_id: member.id,
        company: input.company_name.trim(),
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
