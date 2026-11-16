import { supabase } from '../lib/supabaseClient';

export type MemberAccessRequestStatus = 'pending' | 'reviewed' | 'approved' | 'rejected';

export interface MemberAccessRequest {
  id: string;
  email: string;
  status: MemberAccessRequestStatus;
  submitted_at: string;
  submitted_data: Record<string, unknown>;
  reviewed_at: string | null;
  review_note: string | null;
}

export async function submitMyMemberAccessRequest(
  submittedData: Record<string, unknown>,
): Promise<string> {
  const { data, error } = await supabase.rpc('submit_my_member_access_request', {
    p_data: submittedData,
  });
  if (error) throw new Error(`Could not submit your member access request: ${error.message}`);
  return data;
}

export async function fetchMyMemberAccessRequest(): Promise<Pick<MemberAccessRequest, 'status' | 'submitted_at' | 'submitted_data'> | null> {
  const { data, error } = await supabase
    .from('member_access_requests')
    .select('status, submitted_at, submitted_data')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Could not check your request status: ${error.message}`);
  return data as Pick<MemberAccessRequest, 'status' | 'submitted_at' | 'submitted_data'> | null;
}

export async function fetchMemberAccessRequests(): Promise<MemberAccessRequest[]> {
  const { data, error } = await supabase
    .from('member_access_requests')
    .select('id, email, status, submitted_at, submitted_data, reviewed_at, review_note')
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(`Could not load access requests: ${error.message}`);
  return (data ?? []) as MemberAccessRequest[];
}

export async function decideMemberAccessRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewNote: string,
): Promise<void> {
  const { error } = await supabase.rpc('decide_member_access_request', {
    p_request_id: requestId,
    p_decision: decision,
    p_review_note: reviewNote,
  });
  if (error) throw new Error(`Could not ${decision === 'approved' ? 'accept' : 'reject'} access request: ${error.message}`);
}
