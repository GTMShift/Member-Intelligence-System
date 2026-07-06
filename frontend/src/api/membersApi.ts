import { getCompanyById } from './mockCompanies';
import { MOCK_MEMBERS } from './mockMembers';
import type {
  FilterOptions,
  MemberDetail,
  MemberSearchParams,
  MemberSearchResponse,
  MemberSearchResult,
  UserRole,
} from '../types/api';

const SEARCH_DELAY_MS = 150;

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

function filterMembers(params: MemberSearchParams): MemberDetail[] {
  return MOCK_MEMBERS.filter((member) => {
    if (params.q && !matchesQuery(member, params.q)) return false;
    if (params.icp && member.profile.icp !== params.icp) return false;
    if (params.metro_area_name && member.profile.metro_area_name !== params.metro_area_name) {
      return false;
    }
    if (params.state && member.profile.state_region !== params.state) return false;
    if (params.industry) {
      const company = member.profile.company_id
        ? getCompanyById(member.profile.company_id)
        : undefined;
      if (company?.industry !== params.industry) return false;
    }
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchMembers(
  params: MemberSearchParams,
): Promise<MemberSearchResponse> {
  await delay(SEARCH_DELAY_MS);

  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const filtered = filterMembers(params);
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
  await delay(SEARCH_DELAY_MS);

  const member = MOCK_MEMBERS.find((m) => m.id === id);
  if (!member) return null;

  return applyRoleFilter(member, role);
}

export function getFilterOptions(): FilterOptions {
  const states = new Set<string>();
  const industries = new Set<string>();
  const seniorityLevels = new Set<string>();
  const signupSources = new Set<string>();
  const companyTags = new Set<string>();

  for (const member of MOCK_MEMBERS) {
    if (member.profile.state_region) states.add(member.profile.state_region);
    if (member.profile.company_id) {
      const company = getCompanyById(member.profile.company_id);
      if (company?.industry) industries.add(company.industry);
    }
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
