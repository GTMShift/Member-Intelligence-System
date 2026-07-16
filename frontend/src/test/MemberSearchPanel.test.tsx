import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { MemberSearchPanel } from '../components/MemberSearchPanel';
import { MOCK_MEMBERS } from '../api/mockMembers';
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

  it('renders filter dropdowns for ICP, metro area, state, industry, seniority, and signup source', () => {
    renderPanel();

    expect(screen.getByLabelText('ICP')).toBeInTheDocument();
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

  it('selecting ICP filter YES shows only ICP members', async () => {
    renderPanel();

    await advanceSearchTimers();

    fireEvent.change(screen.getByLabelText('ICP'), { target: { value: 'YES' } });
    await advanceSearchTimers();

    const icpYesMembers = MOCK_MEMBERS.filter((m) => m.profile.icp === 'YES');
    expect(screen.getByText(`${icpYesMembers.length} members`)).toBeInTheDocument();

    for (const member of icpYesMembers) {
      expect(screen.getByText(`${member.first_name} ${member.last_name}`)).toBeInTheDocument();
    }

    const icpNoMembers = MOCK_MEMBERS.filter((m) => m.profile.icp === 'NO');
    for (const member of icpNoMembers) {
      expect(screen.queryByText(`${member.first_name} ${member.last_name}`)).not.toBeInTheDocument();
    }

    const resultButtons = getResultButtons();
    for (const button of resultButtons) {
      expect(within(button).getByText('ICP')).toBeInTheDocument();
    }
  });

  it('selecting ICP filter NO shows only non-ICP members', async () => {
    renderPanel();

    await advanceSearchTimers();

    fireEvent.change(screen.getByLabelText('ICP'), { target: { value: 'NO' } });
    await advanceSearchTimers();

    const icpNoMembers = MOCK_MEMBERS.filter((m) => m.profile.icp === 'NO');
    expect(screen.getByText(`${icpNoMembers.length} members`)).toBeInTheDocument();

    for (const member of icpNoMembers) {
      expect(screen.getByText(`${member.first_name} ${member.last_name}`)).toBeInTheDocument();
    }

    const icpYesMembers = MOCK_MEMBERS.filter((m) => m.profile.icp === 'YES');
    for (const member of icpYesMembers) {
      expect(screen.queryByText(`${member.first_name} ${member.last_name}`)).not.toBeInTheDocument();
    }

    const resultButtons = getResultButtons();
    for (const button of resultButtons) {
      expect(within(button).getByText('Non-ICP')).toBeInTheDocument();
    }
  });

  it('multiple filters can be active at once', async () => {
    renderPanel();

    await advanceSearchTimers();

    fireEvent.change(screen.getByLabelText('ICP'), { target: { value: 'YES' } });
    fireEvent.change(screen.getByLabelText('Metro Area'), { target: { value: 'Chicago' } });
    await advanceSearchTimers();

    const matchingMembers = MOCK_MEMBERS.filter(
      (m) => m.profile.icp === 'YES' && m.profile.metro_area_name === 'Chicago',
    );
    expect(screen.getByText(`${matchingMembers.length} members`)).toBeInTheDocument();
    expect(screen.getByText('Sarah Chen')).toBeInTheDocument();
    expect(screen.getByText('David Okafor')).toBeInTheDocument();
    expect(screen.queryByText('Marcus Rivera')).not.toBeInTheDocument();
  });
});
