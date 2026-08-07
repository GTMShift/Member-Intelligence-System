import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { MemberSearchPanel } from '../components/MemberSearchPanel';
import { MOCK_MEMBERS } from '../testFixtures/members';
import { advanceSearchTimers } from './testHelpers';

function renderPanel() {
  const onSelectMember = vi.fn();
  render(
    <MemberSearchPanel selectedMemberId={null} onSelectMember={onSelectMember} />,
  );
  return { onSelectMember };
}

function getResultButtons() {
  return screen.getAllByRole('button').filter(
    (button) => button.textContent?.includes('Updated'),
  );
}

describe('MemberSearchPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the search input', () => {
    renderPanel();
    expect(screen.getByRole('searchbox', { name: /search members/i })).toBeInTheDocument();
  });

  it('renders filter dropdowns for ICP bucket, metro area, state, industry, seniority, and signup source', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));

    expect(screen.getByLabelText('ICP Bucket')).toBeInTheDocument();
    expect(screen.getByLabelText('Metro Area')).toBeInTheDocument();
    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.getByLabelText('Industry')).toBeInTheDocument();
    expect(screen.getByLabelText('Seniority')).toBeInTheDocument();
    expect(screen.getByLabelText('Signup source')).toBeInTheDocument();
  });

  it('typing in the search input updates results', async () => {
    renderPanel();

    await advanceSearchTimers();
    expect(screen.getByText('6 members')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Sarah' } });
    await advanceSearchTimers();

    expect(screen.getByText('1 member')).toBeInTheDocument();
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.queryByText('Marcus Rivera')).not.toBeInTheDocument();
  });

  it('selecting Primary ICP bucket shows only primary ICP members', async () => {
    renderPanel();

    await advanceSearchTimers();
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));

    fireEvent.change(screen.getByLabelText('ICP Bucket'), {
      target: { value: 'primary_icp' },
    });
    await advanceSearchTimers();

    const primaryMembers = MOCK_MEMBERS.filter((m) => m.profile.bucket === 'primary_icp');
    expect(screen.getByText(`${primaryMembers.length} members`)).toBeInTheDocument();

    for (const member of primaryMembers) {
      expect(screen.getByText(`${member.first_name} ${member.last_name}`)).toBeInTheDocument();
    }

    const nonPrimary = MOCK_MEMBERS.filter((m) => m.profile.bucket !== 'primary_icp');
    for (const member of nonPrimary) {
      expect(screen.queryByText(`${member.first_name} ${member.last_name}`)).not.toBeInTheDocument();
    }

    const resultButtons = getResultButtons();
    for (const button of resultButtons) {
      expect(within(button).getByText(/Primary ICP|Unclassified/i)).toBeInTheDocument();
    }
  });

  it('selecting Non-ICP bucket shows only non-ICP members', async () => {
    renderPanel();

    await advanceSearchTimers();
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));

    fireEvent.change(screen.getByLabelText('ICP Bucket'), {
      target: { value: 'icp_no' },
    });
    await advanceSearchTimers();

    const nonIcpMembers = MOCK_MEMBERS.filter((m) => m.profile.bucket === 'icp_no');
    expect(screen.getByText(`${nonIcpMembers.length} members`)).toBeInTheDocument();

    for (const member of nonIcpMembers) {
      expect(screen.getByText(`${member.first_name} ${member.last_name}`)).toBeInTheDocument();
    }

    const primaryMembers = MOCK_MEMBERS.filter((m) => m.profile.bucket === 'primary_icp');
    for (const member of primaryMembers) {
      expect(screen.queryByText(`${member.first_name} ${member.last_name}`)).not.toBeInTheDocument();
    }

    const resultButtons = getResultButtons();
    for (const button of resultButtons) {
      expect(within(button).getByText(/Non-ICP|Unclassified/i)).toBeInTheDocument();
    }
  });

  it('multiple filters can be active at once', async () => {
    renderPanel();

    await advanceSearchTimers();
    fireEvent.click(screen.getByRole('button', { name: /filters/i }));

    fireEvent.change(screen.getByLabelText('ICP Bucket'), {
      target: { value: 'primary_icp' },
    });
    fireEvent.change(screen.getByLabelText('Metro Area'), { target: { value: 'Chicago' } });
    await advanceSearchTimers();

    const matchingMembers = MOCK_MEMBERS.filter(
      (m) => m.profile.bucket === 'primary_icp' && m.profile.metro_area_name === 'Chicago',
    );
    expect(screen.getByText(`${matchingMembers.length} members`)).toBeInTheDocument();
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('David Okafor')).toBeInTheDocument();
    expect(screen.queryByText('Marcus Rivera')).not.toBeInTheDocument();
  });
});
