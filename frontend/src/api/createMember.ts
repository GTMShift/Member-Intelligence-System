
import { supabase } from '../lib/supabaseClient';
 
export interface SocialEntry {
  platform: 'Twitter/X' | 'Instagram' | 'TikTok' | 'YouTube' | 'Facebook';
  username: string;
  url?: string;
}
 
export interface CreateMemberInput {
  // Section 1 - Profile Information (members table)
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;
 
  // Section 2 - Personal Details (member_profile + member_socials)
  address: string | null;
  city: string | null;
  state_region: string | null;
  zip_code: string | null;
  country: string | null;
  tshirt_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;
  dietary_restrictions: string | null;
  socials: SocialEntry[];
 
  // Section 3 - Organizational Details (member_profile + employment_history + companies)
  team_size: number | null;
  company_name: string | null;
  current_role: string | null;
  current_start_date: string | null;
  management_layers: string | null;
  event_interest: string | null;
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
  region_north_america: boolean;
  region_regional_usa: boolean;
  region_global: boolean;
  region_emea: boolean;
  region_apac: boolean;
  region_latin_america: boolean;
 
  // Section 4 - ICP Classification (member_profile)
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
 
    const { data: existingCompany } = await supabase
      .from('companies')
      .select('id')
      .ilike('name', companyName)
      .maybeSingle();
 
    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
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
      // Personal details
      address: input.address,
      city: input.city,
      state_region: input.state_region,
      zip_code: input.zip_code,
      country: input.country,
      tshirt_size: input.tshirt_size,
      dietary_restrictions: input.dietary_restrictions,
      // Org details
      company_id: companyId,
      team_size: input.team_size,
      management_layers: input.management_layers,
      event_interest: input.event_interest,
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
      region_north_america: input.region_north_america,
      region_regional_usa: input.region_regional_usa,
      region_global: input.region_global,
      region_emea: input.region_emea,
      region_apac: input.region_apac,
      region_latin_america: input.region_latin_america,
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
 
  // Step 4: Insert into employment_history if company provided
  if (input.company_name) {
    await supabase
      .from('employment_history')
      .update({ is_current: false })
      .eq('member_id', member.id)
      .eq('is_current', true);
 
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
 
  // Step 5: Insert social media entries
  if (input.socials.length > 0) {
    const socialRows = input.socials.map((s) => ({
      member_id: member.id,
      platform: s.platform,
      username: s.username.trim(),
      url: s.url?.trim() || null,
    }));
 
    const { error: socialsError } = await supabase
      .from('member_socials')
      .insert(socialRows);
 
    if (socialsError) {
      console.error('Error creating member socials:', socialsError);
      throw new Error(socialsError.message);
    }
  }
 
  return { id: member.id };
}
