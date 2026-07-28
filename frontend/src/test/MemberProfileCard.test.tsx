import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemberProfileCard } from '../components/MemberProfileCard';
import { useAuth } from '../context/authShared';
import { MOCK_MEMBERS } from '../testFixtures/members';
import { formatTimestamp } from '../utils/format';
import { renderWithProviders } from './testHelpers';
 
// Mock Supabase so InteractionTimeline's DB fetches don't fail in the test
// environment. Returns empty arrays for all tables — the timeline still
// renders, it just shows only the interactions passed in as props.
vi.mock('../lib/supabaseClient', () => {
  const emptyResult = { data: [] as unknown[], error: null };
 
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const builder: any = {
    select: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolveFn: (v: typeof emptyResult) => void) =>
      Promise.resolve(emptyResult).then(resolveFn),
  };
 
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.in.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.limit.mockReturnValue(builder);
 
  return {
    supabase: {
      from: vi.fn().mockReturnValue(builder),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
  };
});
 
vi.mock('../context/authShared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/authShared')>();
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});
 
const mockUseAuth = vi.mocked(useAuth);
 
const sarah = MOCK_MEMBERS.find((m) => m.first_name === 'Sarah')!;
 
function mockAuthAs(role: 'admin' | 'member') {
  mockUseAuth.mockReturnValue({
    role,
    isAdmin: role === 'admin',
    session: null,
    user: null,
    loading: false,
    signOut: vi.fn().mockResolvedValue(undefined),
    memberId: null,
    needsOnboarding: false,
    refreshMemberId: vi.fn(),
  });
}
 
async function renderProfile(role: 'admin' | 'member' = 'admin') {
  mockAuthAs(role);
  renderWithProviders(<MemberProfileCard memberId={sarah.id} />);
  await waitFor(() => {
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
  });
}
 
describe('MemberProfileCard', () => {
  beforeEach(() => {
    mockAuthAs('admin');
    vi.clearAllMocks();
  });
 
  it('renders member name, job_title, city, and last_updated timestamp', async () => {
    await renderProfile('admin');
 
    expect(screen.getByRole('heading', { name: 'Sarah Chen' })).toBeInTheDocument();
    expect(screen.getAllByText('VP of Sales').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Chicago')).toBeInTheDocument();
    expect(
      screen.getByText(`Last updated ${formatTimestamp(sarah.last_updated)}`),
    ).toBeInTheDocument();
  });
 
  it('company name renders as a clickable link', async () => {
    await renderProfile('admin');
 
    const companyLinks = screen.getAllByRole('link', { name: 'Acme Corp' });
    expect(companyLinks.length).toBeGreaterThanOrEqual(1);
    for (const link of companyLinks) {
      expect(link).toBeInTheDocument();
    }
  });
 
  it('company link points to /companies/:company_id', async () => {
    await renderProfile('admin');
 
    const companyLinks = screen.getAllByRole('link', { name: 'Acme Corp' });
    for (const link of companyLinks) {
      expect(link).toHaveAttribute(
        'href',
        `/companies/${sarah.profile.company_id}`,
      );
    }
  });
 
  it('admin-only fields are visible when role is admin', async () => {
    await renderProfile('admin');
 
    expect(screen.getByText('Admin Intelligence')).toBeInTheDocument();
    expect(screen.getByText('Note')).toBeInTheDocument();
    expect(screen.getByText('Transcript')).toBeInTheDocument();
    expect(
      screen.getByText(/Strong ICP fit — intro'd by Chris at Sept dinner/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Discussed current outbound motion/),
    ).toBeInTheDocument();
  });
 
  it('admin-only fields are hidden when role is member', async () => {
    await renderProfile('member');
 
    expect(screen.queryByText('Admin Intelligence')).not.toBeInTheDocument();
    expect(screen.queryByText('Note')).not.toBeInTheDocument();
    expect(screen.queryByText('Transcript')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Strong ICP fit — intro'd by Chris at Sept dinner/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Interaction Timeline')).not.toBeInTheDocument();
  });
 
  it('interaction timeline renders with interaction_type, summary, and occurred_at', async () => {
    await renderProfile('admin');
 
    expect(screen.getByText('Interaction Timeline')).toBeInTheDocument();
 
    const emailInteraction = sarah.interactions.find(
      (i) => i.interaction_type === 'email',
    )!;
 
    const timelineSection = screen
      .getByRole('heading', { name: 'Interaction Timeline' })
      .closest('section')!;
 
    // Wait for the loading state to resolve before looking for the list
    await waitFor(() => {
      expect(within(timelineSection).queryByText('Loading timeline…')).not.toBeInTheDocument();
    });
 
    const timeline = within(timelineSection).getByRole('list');
    expect(within(timeline).getByText('Email')).toBeInTheDocument();
    expect(within(timeline).getByText(emailInteraction.summary)).toBeInTheDocument();
    expect(
      within(timeline).getByText(formatTimestamp(emailInteraction.occurred_at)),
    ).toBeInTheDocument();
  });
});
 