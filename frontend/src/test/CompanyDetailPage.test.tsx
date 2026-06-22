import { fireEvent, screen, waitFor } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CompanyDetailPage } from '../pages/CompanyDetailPage';
import { MOCK_COMPANIES } from '../api/mockCompanies';
import { MOCK_MEMBERS } from '../api/mockMembers';
import { renderWithProviders } from './testHelpers';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const acme = MOCK_COMPANIES.find((c) => c.name === 'Acme Corp')!;
const sarah = MOCK_MEMBERS.find((m) => m.first_name === 'Sarah')!;

function renderCompanyPage(fromMemberId?: string) {
  renderWithProviders(
    <Routes>
      <Route path="/companies/:id" element={<CompanyDetailPage />} />
    </Routes>,
    {
      routerProps: {
        initialEntries: [
          {
            pathname: `/companies/${acme.id}`,
            state: fromMemberId ? { fromMemberId } : undefined,
          },
        ],
      },
    },
  );
}

describe('CompanyDetailPage', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
  });

  it('renders company name, domain, industry, size, revenue, company_type, overview, and tags', async () => {
    renderCompanyPage();

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: acme.name })).toBeInTheDocument();
    });

    expect(screen.getByText(acme.domain!)).toBeInTheDocument();
    expect(screen.getByText(acme.industry!)).toBeInTheDocument();
    expect(screen.getByText(acme.size!)).toBeInTheDocument();
    expect(screen.getByText(acme.revenue!)).toBeInTheDocument();
    expect(screen.getByText(acme.company_type!)).toBeInTheDocument();
    expect(screen.getByText(acme.overview!)).toBeInTheDocument();
    expect(screen.getByText(acme.tags!)).toBeInTheDocument();
  });

  it('back button navigates back to the member profile', async () => {
    renderCompanyPage(sarah.id);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: acme.name })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /back to member profile/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/', {
      state: { selectedMemberId: sarah.id },
    });
  });
});
