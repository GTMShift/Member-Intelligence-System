// src/api/createMember.ts
import { supabase } from '../lib/supabaseClient';

export interface SocialEntry {
  platform: 'Twitter/X' | 'Instagram' | 'TikTok' | 'YouTube' | 'Facebook';
  username: string;
  url?: string;
}

export interface CreateMemberInput {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;

  team_size: number | null;
  company_name: string | null;
  current_role: string | null;
  seniority_level: string | null;
  current_start_date: string | null;
  oversees_other: boolean;
  oversees_other_text: string | null;
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

  address: string | null;
  city: string | null;
  state_region: string | null;
  zip_code: string | null;
  country: string | null;
  tshirt_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;
  dietary_restrictions: string | null;
  socials: SocialEntry[];

  bucket: 'primary_icp' | 'secondary_icp' | 'watchlist' | 'between_jobs' | 'consultant' | 'partner_sponsor' | 'icp_no' | 'manual_review' | null;
  fit_score: number | null;
  tag_note: string | null;
}

export async function createMember(input: CreateMemberInput): Promise<{ id: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();

  const { data, error } = await supabase.rpc('create_member_full', {
    p_first_name: input.first_name,
    p_last_name: input.last_name,
    p_email: input.email,
    p_linkedin_url: input.linkedin_url,
    p_phone: input.phone,
    p_company_name: input.company_name,
    p_current_role: input.current_role,
    p_seniority_level: input.seniority_level,
    p_current_start_date: input.current_start_date,
    p_team_size: input.team_size,
    p_management_layers: input.management_layers,
    p_event_interest: input.event_interest,
    p_address: input.address,
    p_city: input.city,
    p_state_region: input.state_region,
    p_zip_code: input.zip_code,
    p_country: input.country,
    p_tshirt_size: input.tshirt_size,
    p_dietary_restrictions: input.dietary_restrictions,
    p_bucket: input.bucket,
    p_fit_score: input.fit_score,
    p_tag_note: input.tag_note,
    p_tagged_by: user?.id ?? null,
    p_oversees_customer_success: input.oversees_customer_success,
    p_oversees_demo_engineering: input.oversees_demo_engineering,
    p_oversees_enablement: input.oversees_enablement,
    p_oversees_forward_deployed_engineering: input.oversees_forward_deployed_engineering,
    p_oversees_implementation_onboarding: input.oversees_implementation_onboarding,
    p_oversees_partnerships_channel_se: input.oversees_partnerships_channel_se,
    p_oversees_professional_services: input.oversees_professional_services,
    p_oversees_solutions_architecture: input.oversees_solutions_architecture,
    p_oversees_solutions_engineering_consulting: input.oversees_solutions_engineering_consulting,
    p_oversees_value_engineering: input.oversees_value_engineering,
    p_oversees_other: input.oversees_other,
    p_oversees_other_text: input.oversees_other_text,
    p_region_north_america: input.region_north_america,
    p_region_regional_usa: input.region_regional_usa,
    p_region_global: input.region_global,
    p_region_emea: input.region_emea,
    p_region_apac: input.region_apac,
    p_region_latin_america: input.region_latin_america,
    p_socials: input.socials.length > 0
    ? input.socials.map((s) => ({
      platform: s.platform,
      username: s.username,
      url: s.url || null,
    }))
  : null,
});

  if (error) {
    console.error('Error creating member:', error);
    throw new Error(error.message);
  }

  return { id: data as string };
}