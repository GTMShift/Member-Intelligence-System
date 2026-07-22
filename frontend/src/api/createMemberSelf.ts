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
  team_size: number | null;
  management_layers: string | null;
  address: string | null;
  city: string | null;
  state_region: string | null;
  zip_code: string | null;
  country: string | null;
  tshirt_size: string | null;
  dietary_restrictions: string | null;
  oversees_solutions_engineering_consulting: boolean;
  oversees_customer_success: boolean;
  oversees_demo_engineering: boolean;
  oversees_solutions_architecture: boolean;
  oversees_partnerships_channel_se: boolean;
  oversees_value_engineering: boolean;
  oversees_forward_deployed_engineering: boolean;
  oversees_enablement: boolean;
  oversees_professional_services: boolean;
  oversees_implementation_onboarding: boolean;
  oversees_other: boolean;
  oversees_other_text: string | null;
  region_north_america: boolean;
  region_regional_usa: boolean;
  region_global: boolean;
  region_emea: boolean;
  region_apac: boolean;
  region_latin_america: boolean;
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
    team_size: input.team_size,
    management_layers: input.management_layers,
    address: input.address,
    city: input.city,
    state_region: input.state_region,
    zip_code: input.zip_code,
    country: input.country,
    tshirt_size: input.tshirt_size,
    dietary_restrictions: input.dietary_restrictions,
    oversees_solutions_engineering_consulting: input.oversees_solutions_engineering_consulting,
    oversees_customer_success: input.oversees_customer_success,
    oversees_demo_engineering: input.oversees_demo_engineering,
    oversees_solutions_architecture: input.oversees_solutions_architecture,
    oversees_partnerships_channel_se: input.oversees_partnerships_channel_se,
    oversees_value_engineering: input.oversees_value_engineering,
    oversees_forward_deployed_engineering: input.oversees_forward_deployed_engineering,
    oversees_enablement: input.oversees_enablement,
    oversees_professional_services: input.oversees_professional_services,
    oversees_implementation_onboarding: input.oversees_implementation_onboarding,
    oversees_other: input.oversees_other,
    oversees_other_text: input.oversees_other_text,
    region_north_america: input.region_north_america,
    region_regional_usa: input.region_regional_usa,
    region_global: input.region_global,
    region_emea: input.region_emea,
    region_apac: input.region_apac,
    region_latin_america: input.region_latin_america,
    company_id: companyId,
    signup_source: 'Website',
  });
 
  if (profileError) {
    throw new Error(`Failed to create member profile: ${profileError.message}`);
  }
 
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
 