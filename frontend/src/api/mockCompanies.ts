import type { CompanyDetail } from '../types/api';

export const MOCK_COMPANIES_BY_ID: Record<string, CompanyDetail> = {
  'c0000001-0000-4000-8000-000000000001': {
    id: 'c0000001-0000-4000-8000-000000000001',
    name: 'Acme Corp',
    linkedin_url: 'https://www.linkedin.com/company/acme-corp',
    domain: 'acmecorp.com',
    size: '201-500',
    industry: 'Software',
    sub_industry: 'Enterprise SaaS',
    overview:
      'Acme Corp builds revenue intelligence software for mid-market and enterprise sales teams, with a focus on outbound automation and pipeline visibility.',
    company_type: 'Privately Held',
    revenue: '$50M–$100M',
    tags: 'SaaS, Enterprise',
    created_at: '2024-11-15T10:00:00Z',
    updated_at: '2026-06-10T09:15:00Z',
  },
  'c0000002-0000-4000-8000-000000000002': {
    id: 'c0000002-0000-4000-8000-000000000002',
    name: 'Velocity IO',
    linkedin_url: 'https://www.linkedin.com/company/velocity-io',
    domain: 'velocity.io',
    size: '51-200',
    industry: 'Software',
    sub_industry: 'Developer Tools',
    overview:
      'Velocity IO provides a product-led growth platform for B2B SaaS companies transitioning from self-serve to enterprise sales motions.',
    company_type: 'Privately Held',
    revenue: '$10M–$50M',
    tags: 'DevTools, PLG',
    created_at: '2025-02-20T14:30:00Z',
    updated_at: '2026-06-08T16:45:00Z',
  },
  'c0000003-0000-4000-8000-000000000003': {
    id: 'c0000003-0000-4000-8000-000000000003',
    name: 'Greenfield Analytics',
    linkedin_url: 'https://www.linkedin.com/company/greenfield-analytics',
    domain: 'greenfield.co',
    size: '11-50',
    industry: 'Data & Analytics',
    sub_industry: 'Business Intelligence',
    overview:
      'Greenfield Analytics helps finance and operations teams model scenarios and track KPIs with lightweight analytics tooling for growth-stage companies.',
    company_type: 'Privately Held',
    revenue: '$1M–$10M',
    tags: 'Analytics, FinTech',
    created_at: '2025-05-10T09:00:00Z',
    updated_at: '2026-06-05T11:30:00Z',
  },
  'c0000004-0000-4000-8000-000000000004': {
    id: 'c0000004-0000-4000-8000-000000000004',
    name: 'Nexus Health',
    linkedin_url: 'https://www.linkedin.com/company/nexus-health',
    domain: 'nexushealth.com',
    size: '501-1000',
    industry: 'Healthcare',
    sub_industry: 'Health Technology',
    overview:
      'Nexus Health delivers care coordination and commercial operations software for hospital networks and specialty provider groups.',
    company_type: 'Privately Held',
    revenue: '$100M–$250M',
    tags: 'Healthcare, Enterprise',
    created_at: '2023-08-01T12:00:00Z',
    updated_at: '2026-06-12T08:00:00Z',
  },
  'c0000005-0000-4000-8000-000000000005': {
    id: 'c0000005-0000-4000-8000-000000000005',
    name: 'BrightPath Education',
    linkedin_url: 'https://www.linkedin.com/company/brightpath-education',
    domain: 'brightpath.com',
    size: '51-200',
    industry: 'Education',
    sub_industry: 'EdTech',
    overview:
      'BrightPath Education partners with districts and learning providers to deliver curriculum tools and partnership programs for K-12 schools.',
    company_type: 'Privately Held',
    revenue: '$10M–$50M',
    tags: 'EdTech, K-12',
    created_at: '2024-06-18T11:20:00Z',
    updated_at: '2026-06-01T14:20:00Z',
  },
  'c0000006-0000-4000-8000-000000000006': {
    id: 'c0000006-0000-4000-8000-000000000006',
    name: 'LogiStream',
    linkedin_url: 'https://www.linkedin.com/company/logistream',
    domain: 'logistream.com',
    size: '201-500',
    industry: 'Logistics',
    sub_industry: 'Supply Chain Software',
    overview:
      'LogiStream offers shipment visibility and last-mile optimization software for e-commerce retailers and third-party logistics providers.',
    company_type: 'Privately Held',
    revenue: '$50M–$100M',
    tags: 'Logistics, E-commerce',
    created_at: '2024-01-09T08:45:00Z',
    updated_at: '2026-05-28T17:10:00Z',
  },
};

export const MOCK_COMPANIES: CompanyDetail[] = Object.values(MOCK_COMPANIES_BY_ID);

export function getCompanyById(id: string): CompanyDetail | undefined {
  return MOCK_COMPANIES_BY_ID[id];
}
