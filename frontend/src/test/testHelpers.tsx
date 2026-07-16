import { vi } from 'vitest';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { AuthProvider } from '../context/AuthContext';
import type {
  FilterOptions,
  MemberDetail,
  MemberSearchParams,
  MemberSearchResponse,
  MemberSearchResult,
  UserRole,
} from '../types/api';

vi.mock('../api/membersApi', async () => {
  const { MOCK_MEMBERS } = await import('../testFixtures/members');
  const { MOCK_COMPANIES_BY_ID } = await import('../testFixtures/companies');

  function getCurrentRole(member: MemberDetail): string | null {
    return member.employment_history.find((entry) => entry.is_current)?.role ?? null;
  }

  function getIndustry(member: MemberDetail): string | null {
    const companyId = member.profile.company_id;
    if (!companyId) return null;
    return MOCK_COMPANIES_BY_ID[companyId]?.industry ?? null;
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
      if (params.industry && getIndustry(member) !== params.industry) return false;
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

  async function searchMembers(params: MemberSearchParams): Promise<MemberSearchResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 50;
    const filtered = filterMembers(MOCK_MEMBERS, params);
    const start = (page - 1) * limit;
    const pageResults = filtered.slice(start, start + limit);

    return {
      total: filtered.length,
      page,
      limit,
      results: pageResults.map(toSearchResult),
    };
  }

  async function getMember(id: string, role: UserRole): Promise<MemberDetail | null> {
    const member = MOCK_MEMBERS.find((entry) => entry.id === id);
    if (!member) return null;
    return applyRoleFilter(member, role);
  }

  async function getMetroAreas(): Promise<{ id: string; name: string }[]> {
    return [
      { id: 'ma-1', name: 'Chicago' },
      { id: 'ma-2', name: 'San Francisco' },
      { id: 'ma-3', name: 'New York City' },
      { id: 'ma-4', name: 'Boston' },
    ];
  }

  async function getFilterOptions(): Promise<FilterOptions> {
    const states = new Set<string>();
    const industries = new Set<string>();
    const seniorityLevels = new Set<string>();
    const signupSources = new Set<string>();
    const companyTags = new Set<string>();

    for (const member of MOCK_MEMBERS) {
      if (member.profile.state_region) states.add(member.profile.state_region);
      const industry = getIndustry(member);
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
      teamSizes: [],
    };
  }

  return {
    searchMembers,
    getMember,
    getFilterOptions,
    getMetroAreas,
  };
});

interface WrapperOptions {
  routerProps?: MemoryRouterProps;
}

export function renderWithProviders(
  ui: ReactElement,
  { routerProps, ...renderOptions }: WrapperOptions & Omit<RenderOptions, 'wrapper'> = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter {...routerProps}>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export async function advanceSearchTimers() {
  const { act } = await import('@testing-library/react');
  await act(async () => {
    await vi.runAllTimersAsync();
  });
}
