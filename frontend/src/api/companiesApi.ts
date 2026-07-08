import { getCompanyById } from './mockCompanies';
import type { CompanyDetail } from '../types/api';

const FETCH_DELAY_MS = 150;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getCompany(id: string): Promise<CompanyDetail | null> {
  await delay(FETCH_DELAY_MS);

  const company = getCompanyById(id);
  return company ?? null;
}
