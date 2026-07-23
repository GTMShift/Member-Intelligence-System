// src/api/membersApi.ts
import { supabase } from '../lib/supabaseClient';
import type {
  EmploymentHistoryEntry,
  FilterOptions,
  IcpStatus,
  Interaction,
  MemberDataEntry,
  MemberDetail,
  MemberSearchParams,
  MemberSearchResponse,
  MemberSearchResult,
  UserRole,
} from '../types/api';

// Fetches every member with all related data joined in.
// NOTE: intentionally fetches everything and filters/paginates in JS, matching
// the previous mock-data implementation's behavior. Fine at current scale
// (~700s of members) — worth revisiting with server-side filtering if the
// member count grows substantially.
const MEMBER_SELECT = `
  id, first_name, last_name, email, linkedin_url, phone, created_at, last_updated,
  profile:member_profile(
    current_job_start_date, seniority_level, company_id, country, state_region, city,
    work_email_enriched, icp, signup_source, updated_at, metro_area_id, team_size, tags,
    bucket, fit_score, tag_note,
    company:companies(name, size, tags, industry),
    metro_area:metro_areas(name)
  ),
  employment_history(id, company, role, start_date, end_date, is_current, source),
  member_data(id, tier, category, data, logged_by, created_at),
  interactions(id, interaction_type, summary, occurred_at, logged_by, metadata),
  linked_profile:profiles(avatar_url)
`;

// industry lives on companies, not on MemberProfile's declared shape — tracked
// separately here (member id -> industry) so filtering/filter-options can use
// it without changing the MemberDetail/MemberProfile type contracts.
const industryByMemberId = new Map<string, string | null>();

const TEAM_SIZE_RANGES = [
  { value: '1-10', min: 1, max: 10 },
  { value: '11-50', min: 11, max: 50 },
  { value: '51-200', min: 51, max: 200 },
  { value: '201-500', min: 201, max: 500 },
  { value: '501-1000', min: 501, max: 1000 },
  { value: '1000+', min: 1001, max: Infinity },
];

type CompanyJoin = {
  name?: string | null;
  size?: string | null;
  tags?: string | null;
  industry?: string | null;
};

type MetroAreaJoin = {
  name?: string | null;
};

type ProfileJoin = {
  current_job_start_date?: string | null;
  seniority_level?: string | null;
  company_id?: string | null;
  country?: string | null;
  state_region?: string | null;
  city?: string | null;
  work_email_enriched?: string | null;
  icp?: string | null;
  signup_source?: string | null;
  updated_at?: string;
  team_size?: number | null;
  tags?: string[];
  bucket?: string | null;
  fit_score?: number | null;
  tag_note?: string | null;
  company?: CompanyJoin | CompanyJoin[] | null;
  metro_area?: MetroAreaJoin | MetroAreaJoin[] | null;
};

type LinkedProfileJoin = {
  avatar_url?: string | null;
};

/** Shape returned by the members select join before normalization. */
type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string;
  phone: string | null;
  created_at: string;
  last_updated: string;
  profile?: ProfileJoin | ProfileJoin[] | null;
  linked_profile?: LinkedProfileJoin | LinkedProfileJoin[] | null;
  employment_history?: EmploymentHistoryEntry[] | null;
  member_data?: MemberDataEntry[] | null;
  interactions?: Interaction[] | null;
};

// Supabase returns a to-one relation as an object if a unique constraint is
// detected, but as an array otherwise — this normalizes either shape.
function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toMemberDetail(row: MemberRow): MemberDetail {
  const profileRaw = firstOrSelf(row.profile);
  const linkedProfile = firstOrSelf(row.linked_profile);
  const company = firstOrSelf(profileRaw?.company);
  const metroArea = firstOrSelf(profileRaw?.metro_area);
  const employment = row.employment_history ?? [];

  const currentEntry = employment.find((e) => e.is_current);
  const prevEntries = [...employment]
    .filter((e) => !e.is_current)
    .sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));

  industryByMemberId.set(row.id, company?.industry ?? null);

  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    linkedin_url: row.linkedin_url,
    phone: row.phone,
    created_at: row.created_at,
    last_updated: row.last_updated,
    profile: {
      current_job_start_date: currentEntry?.start_date ?? profileRaw?.current_job_start_date ?? null,
      seniority_level: profileRaw?.seniority_level ?? null,
      company_id: profileRaw?.company_id ?? null,
      company_name: company?.name ?? null,
      avatar_url: linkedProfile?.avatar_url ?? null,
      country: profileRaw?.country ?? null,
      state_region: profileRaw?.state_region ?? null,
      city: profileRaw?.city ?? null,
      metro_area_name: metroArea?.name ?? null,
      company_size: company?.size ?? null,
      team_size: profileRaw?.team_size ?? null,
      bucket: profileRaw?.bucket ?? null,
      fit_score: profileRaw?.fit_score ?? null,
      tag_note: profileRaw?.tag_note ?? null,
      company_tags: profileRaw?.tags ?? [],
      work_email_enriched: profileRaw?.work_email_enriched ?? null,
      prev_company_1: prevEntries[0]?.company ?? null,
      prev_role_1: prevEntries[0]?.role ?? null,
      prev_company_2: prevEntries[1]?.company ?? null,
      prev_role_2: prevEntries[1]?.role ?? null,
      prev_company_3: prevEntries[2]?.company ?? null,
      prev_role_3: prevEntries[2]?.role ?? null,
      icp: (profileRaw?.icp as IcpStatus) ?? null,
      signup_source: profileRaw?.signup_source ?? null,
      updated_at: profileRaw?.updated_at ?? row.last_updated,
    },
    member_data: row.member_data ?? [],
    interactions: row.interactions ?? [],
    employment_history: employment,
  };
}

function getCurrentRole(member: MemberDetail): string | null {
  return member.employment_history.find((entry) => entry.is_current)?.role ?? null;
}

function toSearchResult(member: MemberDetail): MemberSearchResult {
  return {
    id: member.id,
    first_name: member.first_name,
    last_name: member.last_name,
    email: member.email,
    company_id: member.profile.company_id,
    company_name: member.profile.company_name,
    current_role: getCurrentRole(member),
    metro_area_name: member.profile.metro_area_name,
    state_region: member.profile.state_region,
    icp: member.profile.icp,
    last_updated: member.last_updated,
  };
}

function applyRoleFilter(member: MemberDetail, role: UserRole): MemberDetail {
  if (role === 'admin') return member;

  return {
    ...member,
    profile: {
      ...member.profile,
      icp: null,
    },
    member_data: member.member_data.filter((entry) => entry.tier === 'user_editable'),
    interactions: [],
  };
}

async function fetchAllMemberDetails(): Promise<MemberDetail[]> {
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_SELECT)
    .order('last_name', { ascending: true })
    .order('first_name', { ascending: true })
    .order('id', { ascending: true }); // final tie-breaker for fully stable ordering
  if (error) throw new Error(`Failed to fetch members: ${error.message}`);
  return (data ?? []).map((row) => toMemberDetail(row as MemberRow));
}

// Delegates filtering, sorting, and pagination entirely to the search_members
// Postgres function (see migration 026), rather than fetching every member
// and doing this work in JS. Each call now returns only the one page of
// lightweight result rows actually needed, plus the total matching count.
export async function searchMembers(
  params: MemberSearchParams,
): Promise<MemberSearchResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;

  const { data, error } = await supabase.rpc('search_members', {
    p_q: params.q ?? null,
    p_icp: params.icp ?? null,
    p_metro_area_name: params.metro_area_name ?? null,
    p_state: params.state ?? null,
    p_industry: params.industry ?? null,
    p_seniority: params.seniority ?? null,
    p_source: params.source ?? null,
    p_team_size: params.team_size ?? null,
    p_tag: params.tag ?? null,
    p_sort: params.sort ?? 'last_name_asc',
    p_page: page,
    p_limit: limit,
  });

  if (error) throw new Error(`Failed to search members: ${error.message}`);

  const rows = data ?? [];
  const total = rows.length > 0 ? Number(rows[0].total) : 0;

  const results: MemberSearchResult[] = rows.map((row: any) => ({
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email,
    company_id: row.company_id,
    company_name: row.company_name,
    current_role: row.current_role_title,
    metro_area_name: row.metro_area_name,
    state_region: row.state_region,
    icp: row.icp,
    last_updated: row.last_updated,
  }));

  return { total, page, limit, results };
}

export async function getMember(id: string, role: UserRole): Promise<MemberDetail | null> {
  const { data, error } = await supabase.from('members').select(MEMBER_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch member ${id}: ${error.message}`);
  if (!data) return null;

  return applyRoleFilter(toMemberDetail(data as MemberRow), role);
}

export async function getMetroAreas(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await supabase.from('metro_areas').select('id, name').order('name');
  if (error) throw new Error(`Failed to fetch metro areas: ${error.message}`);
  return data ?? [];
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const all = await fetchAllMemberDetails();

  const states = new Set<string>();
  const industries = new Set<string>();
  const seniorityLevels = new Set<string>();
  const signupSources = new Set<string>();
  const companyTags = new Set<string>();
  const teamSizes = new Set<string>();

  for (const member of all) {
    if (member.profile.state_region) states.add(member.profile.state_region);
    const industry = industryByMemberId.get(member.id);
    if (industry) industries.add(industry);
    if (member.profile.seniority_level) seniorityLevels.add(member.profile.seniority_level);
    if (member.profile.signup_source) signupSources.add(member.profile.signup_source);
    if (member.profile.team_size !== null && member.profile.team_size !== undefined) {
      const range = TEAM_SIZE_RANGES.find(
        (r) => member.profile.team_size! >= r.min && member.profile.team_size! <= r.max,
      );
      if (range) teamSizes.add(range.value);
    }
    for (const tag of member.profile.company_tags) {
      companyTags.add(tag);
    }
  }

  const sort = (values: Set<string>) => [...values].sort((a, b) => a.localeCompare(b));

  return {
    states: sort(states),
    industries: sort(industries),
    seniorityLevels: sort(seniorityLevels),
    signupSources: sort(signupSources),
    companyTags: sort(companyTags),
    teamSizes: TEAM_SIZE_RANGES.filter((r) => teamSizes.has(r.value)).map((r) => r.value),
  };
}