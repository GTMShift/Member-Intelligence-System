import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MemberProfileCard } from '../components/MemberProfileCard';
import { useAuth } from '../context/AuthContext';
import { MOCK_MEMBERS } from '../testFixtures/members';
import { formatTimestamp } from '../utils/format';
import { renderWithProviders } from './testHelpers';

vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../context/AuthContext')>();
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
    const timeline = within(timelineSection).getByRole('list');
    expect(within(timeline).getByText('Email')).toBeInTheDocument();
    expect(within(timeline).getByText(emailInteraction.summary)).toBeInTheDocument();
    expect(
      within(timeline).getByText(formatTimestamp(emailInteraction.occurred_at)),
    ).toBeInTheDocument();
  });
});
