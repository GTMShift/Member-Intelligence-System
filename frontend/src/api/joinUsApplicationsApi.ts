export type JoinUsApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface JoinUsApplication {
  id: string;
  first_name: string;
  last_name: string;
  email_address: string;
  linkedin: string | null;
  phone_number: string | null;
  company: string | null;
  job_title: string | null;
  status: JoinUsApplicationStatus;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface ApplicationsResponse {
  applications: JoinUsApplication[];
}

interface ApplicationResponse {
  application: {
    id: string;
    status: JoinUsApplicationStatus;
    member_id?: string | null;
  };
}

function getApiBaseUrl(): string {
  const apiBaseUrl = import.meta.env.VITE_API_URL;

  if (!apiBaseUrl) {
    throw new Error('VITE_API_URL is not configured');
  }

  return apiBaseUrl;
}

async function request<T>(
  path: string,
  accessToken: string,
  method: 'GET' | 'POST' = 'GET',
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || 'Request failed');
  }

  return data as T;
}

export async function getJoinUsApplications(
  accessToken: string,
  status?: JoinUsApplicationStatus,
): Promise<JoinUsApplication[]> {
  const query = status ? `?status=${status}` : '';
  const data = await request<ApplicationsResponse>(
    `/join-us-applications${query}`,
    accessToken,
  );

  return data.applications;
}

export async function approveJoinUsApplication(
  accessToken: string,
  applicationId: string,
): Promise<ApplicationResponse['application']> {
  const data = await request<ApplicationResponse>(
    `/join-us-applications/${applicationId}/approve`,
    accessToken,
    'POST',
  );

  return data.application;
}

export async function rejectJoinUsApplication(
  accessToken: string,
  applicationId: string,
): Promise<ApplicationResponse['application']> {
  const data = await request<ApplicationResponse>(
    `/join-us-applications/${applicationId}/reject`,
    accessToken,
    'POST',
  );

  return data.application;
}