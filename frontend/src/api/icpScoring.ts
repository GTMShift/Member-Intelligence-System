import { supabase } from '../lib/supabaseClient';
 
export interface IcpBucketSuggestion {
  bucket: string;
  reason?: string;
  score: number; // filled in by the caller after calculateFitScore resolves
}
 
/**
 * Calls the existing calculate_fit_score(member_id) Postgres function.
 * Returns the numeric fit score (0-100), NOT persisted until the admin
 * approves the suggestion.
 */
export async function calculateFitScore(memberId: string): Promise<number> {
  const { data, error } = await supabase.rpc('calculate_fit_score', {
    p_member_id: memberId,
  });
  if (error) {
    throw new Error(`calculate_fit_score failed: ${error.message}`);
  }
  if (typeof data !== 'number') {
    throw new Error('calculate_fit_score returned an unexpected value');
  }
  return data;
}
 
/**
 * Calls the new suggest_icp_bucket(member_id) Postgres function (see
 * migrations/022_suggest_icp_bucket.sql). Returns the suggested bucket enum
 * value plus a short human-readable reason for the suggestion, so the admin
 * can sanity-check before approving.
 */
export async function suggestIcpBucket(
  memberId: string,
): Promise<Omit<IcpBucketSuggestion, 'score'>> {
  const { data, error } = await supabase.rpc('suggest_icp_bucket', {
    p_member_id: memberId,
  });
  if (error) {
    throw new Error(`suggest_icp_bucket failed: ${error.message}`);
  }
  // suggest_icp_bucket returns a single row: { bucket, reason }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row.bucket !== 'string') {
    throw new Error('suggest_icp_bucket returned an unexpected value');
  }
  return { bucket: row.bucket, reason: row.reason ?? undefined };
}