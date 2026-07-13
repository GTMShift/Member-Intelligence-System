// src/api/membersApi.ts
import { supabase } from '../lib/supabaseClient';
import type {
  FilterOptions,
  IcpStatus,
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
    work_email_enriched, icp, signup_source, updated_at, metro_area_id,
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

// Supabase returns a to-one relation as an object if a unique constraint is
// detected, but as an array otherwise — this normalizes either shape.
function firstOrSelf<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toMemberDetail(row: any): MemberDetail {
  const profileRaw = firstOrSelf(row.profile);
  const linkedProfile = firstOrSelf(row.linked_profile);
  const company = firstOrSelf(profileRaw?.company);
  const metroArea = firstOrSelf(profileRaw?.metro_area);
  const employment = row.employment_history ?? [];

  const currentEntry = employment.find((e: any) => e.is_current);
  const prevEntries = [...employment]
    .filter((e: any) => !e.is_current)
    .sort((a: any, b: any) => (b.start_date ?? '').localeCompare(a.start_date ?? ''));

  const companyTags = company?.tags
    ? company.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];

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
      company_tags: companyTags,
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

function matchesQuery(member: MemberDetail, q: string): boolean {
  const normalized = q.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    member.first_name,
    member.last_name,
    `${member.first_name} ${member.last_name}`,
    member.email,
    member.profile.company_name,
    getCurrentRole(member),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

function filterMembers(all: MemberDetail[], params: MemberSearchParams): MemberDetail[] {
  return all.filter((member) => {
    if (params.q && !matchesQuery(member, params.q)) return false;
    if (params.icp && member.profile.icp !== params.icp) return false;
    if (params.metro_area_name && member.profile.metro_area_name !== params.metro_area_name) {
      return false;
    }
    if (params.state && member.profile.state_region !== params.state) return false;
    if (params.industry && industryByMemberId.get(member.id) !== params.industry) return false;
    if (params.seniority && member.profile.seniority_level !== params.seniority) return false;
    if (params.source && member.profile.signup_source !== params.source) return false;
    if (params.company_size && member.profile.company_size !== params.company_size) return false;
    if (params.tag && !member.profile.company_tags.includes(params.tag)) return false;
    return true;
  });
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
  return (data ?? []).map(toMemberDetail);
}

export async function searchMembers(
  params: MemberSearchParams,
): Promise<MemberSearchResponse> {
  const all = await fetchAllMemberDetails();

  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const filtered = filterMembers(all, params);
  const start = (page - 1) * limit;
  const pageResults = filtered.slice(start, start + limit);

  return {
    total: filtered.length,
    page,
    limit,
    results: pageResults.map(toSearchResult),
  };
}

export async function getMember(id: string, role: UserRole): Promise<MemberDetail | null> {
  const { data, error } = await supabase.from('members').select(MEMBER_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`Failed to fetch member ${id}: ${error.message}`);
  if (!data) return null;

  return applyRoleFilter(toMemberDetail(data), role);
}

export async function getFilterOptions(): Promise<FilterOptions> {
  const all = await fetchAllMemberDetails();

  const states = new Set<string>();
  const industries = new Set<string>();
  const seniorityLevels = new Set<string>();
  const signupSources = new Set<string>();
  const companyTags = new Set<string>();

  for (const member of all) {
    if (member.profile.state_region) states.add(member.profile.state_region);
    const industry = industryByMemberId.get(member.id);
    if (industry) industries.add(industry);
    if (member.profile.seniority_level) seniorityLevels.add(member.profile.seniority_level);
    if (member.profile.signup_source) signupSources.add(member.profile.signup_source);
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
  };
}