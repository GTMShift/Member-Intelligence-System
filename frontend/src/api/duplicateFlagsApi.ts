// src/api/duplicateFlagsApi.ts
import { supabase } from '../lib/supabaseClient';
import { createNotification } from './notificationsApi';
import type { DedupMatchedOn, PendingDuplicateFlag } from '../types/api';

export interface DedupCheckIncoming {
  first_name: string;
  last_name: string;
  email: string;
  linkedin_url: string | null;
  phone: string | null;
  current_role: string | null;
}

/**
 * Checks a newly-created member (newMemberId) against all OTHER existing
 * members for a match on email, LinkedIn URL, or phone (checked in that
 * priority order). If found, creates a duplicate_flags row for admin review
 * and a notification. This runs AFTER the member is created — it never
 * blocks signup, only flags it for review afterward.
 */
export async function checkAndFlagDuplicate(
  newMemberId: string,
  incoming: DedupCheckIncoming,
): Promise<void> {
  const orConditions: string[] = [`email.eq.${incoming.email}`];
  if (incoming.linkedin_url) orConditions.push(`linkedin_url.eq.${incoming.linkedin_url}`);
  if (incoming.phone) orConditions.push(`phone.eq.${incoming.phone}`);

  const { data: candidates, error } = await supabase
    .from('members')
    .select('id, email, linkedin_url, phone')
    .neq('id', newMemberId)
    .or(orConditions.join(','));

  if (error) {
    console.error('Duplicate check failed:', error.message);
    return; // fail quietly — don't block signup over a dedup-check error
  }
  if (!candidates || candidates.length === 0) return;

  // Priority: email match first, then LinkedIn, then phone
  let matched: { id: string } | null = null;
  let matchedOn: DedupMatchedOn | null = null;

  const emailMatch = candidates.find((c) => c.email === incoming.email);
  if (emailMatch) {
    matched = emailMatch;
    matchedOn = 'email';
  } else if (incoming.linkedin_url) {
    const linkedinMatch = candidates.find((c) => c.linkedin_url === incoming.linkedin_url);
    if (linkedinMatch) {
      matched = linkedinMatch;
      matchedOn = 'linkedin_url';
    }
  }
  if (!matched && incoming.phone) {
    const phoneMatch = candidates.find((c) => c.phone === incoming.phone);
    if (phoneMatch) {
      matched = phoneMatch;
      matchedOn = 'phone';
    }
  }

  if (!matched || !matchedOn) return;

  const { error: flagErr } = await supabase.from('duplicate_flags').insert({
    incoming_first_name: incoming.first_name,
    incoming_last_name: incoming.last_name,
    incoming_email: incoming.email,
    incoming_linkedin_url: incoming.linkedin_url,
    incoming_phone: incoming.phone,
    incoming_current_role: incoming.current_role,
    existing_member_id: matched.id,
    matched_on: matchedOn,
  });
  if (flagErr) {
    console.error('Failed to create duplicate flag:', flagErr.message);
    return;
  }

  await createNotification({
    type: 'duplicate_detected',
    title: 'Possible duplicate member detected',
    body: `A new signup for "${incoming.first_name} ${incoming.last_name}" matches an existing member on ${matchedOn.replace('_', ' ')}. Review before merging.`,
    member_id: newMemberId,
    member_name: `${incoming.first_name} ${incoming.last_name}`,
  });
}

export async function fetchPendingDuplicateFlags(): Promise<PendingDuplicateFlag[]> {
  const { data, error } = await supabase
    .from('duplicate_flags')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to fetch duplicate flags: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    check: {
      duplicate_found: true,
      existing_member_id: row.existing_member_id,
      matched_on: row.matched_on,
    },
    incoming: {
      first_name: row.incoming_first_name,
      last_name: row.incoming_last_name,
      email: row.incoming_email,
      linkedin_url: row.incoming_linkedin_url,
      phone: row.incoming_phone,
      current_role: row.incoming_current_role,
    },
  }));
}

export async function dismissDuplicateFlag(flagId: string, dismissedByProfileId: string): Promise<void> {
  const { error } = await supabase
    .from('duplicate_flags')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString(),
      dismissed_by: dismissedByProfileId,
    })
    .eq('id', flagId);
  if (error) throw new Error(`Failed to dismiss duplicate flag: ${error.message}`);
}