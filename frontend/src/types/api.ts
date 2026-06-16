export type UserRole = 'admin' | 'member';

export type IcpStatus = 'YES' | 'NO' | null;

export type SignupSource = 'Website' | 'Luma' | 'Substack' | 'Manual';

export type MemberDataTier = 'user_editable' | 'admin_only';

export type MemberDataCategory =
  | 'challenge'
  | 'interest'
  | 'event_feedback'
  | 'note'
  | 'transcript'
  | 'flag'
  | 'mandate';

export type InteractionType = 'meeting' | 'call' | 'email' | 'event' | 'note';

export interface MemberProfile {
  current_company: string | null;
  current_role: string | null;
  current_job_start_date: string | null;
  seniority_level: string | null;
  company_linkedin_url: string | null;
  company_domain: string | null;
  company_size: string | null;
  company_industry: string | null;
  company_sub_industry: string | null;
  company_overview: string | null;
  company_type: string | null;
  company_revenue: string | null;
  company_tags: string | null;
  country: string | null;
  state_region: string | null;
  city: string | null;
  work_email_enriched: string | null;
  prev_company_1: string | null;
  prev_role_1: string | null;
  prev_company_2: string | null;
  prev_role_2: string | null;
  prev_company_3: string | null;
  prev_role_3: string | null;
  icp: IcpStatus;
  signup_source: string | null;
  updated_at: string;
}

export interface MemberDataEntry {
  id: string;
  tier: MemberDataTier;
  category: MemberDataCategory;
  data: Record<string, unknown>;
  logged_by: string;
  created_at: string;
}

export interface Interaction {
  id: string;
  type: InteractionType;
  summary: string;
  occurred_at: string;
  logged_by: string;
  metadata: Record<string, unknown>;
}

export interface MemberSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  current_company: string | null;
  current_role: string | null;
  city: string | null;
  state_region: string | null;
  icp: IcpStatus;
  last_updated: string;
}

export interface MemberSearchResponse {
  total: number;
  page: number;
  limit: number;
  results: MemberSearchResult[];
}

export interface MemberDetail {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;
  created_at: string;
  last_updated: string;
  profile: MemberProfile;
  member_data: MemberDataEntry[];
  interactions: Interaction[];
}

export interface MemberSearchParams {
  q?: string;
  icp?: 'YES' | 'NO';
  city?: string;
  state?: string;
  industry?: string;
  seniority?: string;
  source?: string;
  page?: number;
  limit?: number;
}

export interface FilterOptions {
  cities: string[];
  states: string[];
  industries: string[];
  seniorityLevels: string[];
  signupSources: string[];
}
