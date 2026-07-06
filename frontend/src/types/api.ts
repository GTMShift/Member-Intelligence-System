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

export type EmploymentSource = 'Apollo' | 'Manual' | 'Import';

export interface EmploymentHistoryEntry {
  id: string;
  company: string;
  role: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  source: EmploymentSource;
}

export interface MemberProfile {
  current_job_start_date: string | null;
  seniority_level: string | null;
  company_id: string | null;
  company_name: string | null;
  country: string | null;
  state_region: string | null;
  city: string | null;
  metro_area_name: string | null;
  company_size: string | null;
  company_tags: string[];
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
  interaction_type: InteractionType;
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
  company_id: string | null;
  company_name: string | null;
  /** Derived from employment_history where is_current = true */
  current_role: string | null;
  metro_area_name: string | null;
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
  employment_history: EmploymentHistoryEntry[];
}

export interface CompanyDetail {
  id: string;
  name: string;
  linkedin_url: string | null;
  domain: string | null;
  size: string | null;
  industry: string | null;
  sub_industry: string | null;
  overview: string | null;
  company_type: string | null;
  revenue: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

export interface MemberSearchParams {
  q?: string;
  icp?: 'YES' | 'NO';
  metro_area_name?: string;
  state?: string;
  industry?: string;
  seniority?: string;
  source?: string;
  company_size?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

export interface FilterOptions {
  states: string[];
  industries: string[];
  seniorityLevels: string[];
  signupSources: string[];
  companyTags: string[];
}

export type DedupMatchedOn = 'email' | 'linkedin_url' | 'phone';

export interface DedupCheckResponse {
  duplicate_found: boolean;
  existing_member_id: string;
  matched_on: DedupMatchedOn;
}

/** Incoming signup fields passed to POST /members/dedup/check alongside the check result. */
export interface DedupIncomingMember {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;
  current_role: string | null;
}

export interface PendingDuplicateFlag {
  id: string;
  check: DedupCheckResponse;
  incoming: DedupIncomingMember;
}

export interface MetroArea {
  id: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_miles: number;
}