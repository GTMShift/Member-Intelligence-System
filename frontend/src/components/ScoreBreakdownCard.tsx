import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { pointsForInteractionType } from '../utils/interactionScoring';

interface ScoreBreakdownCardProps {
  memberId: string;
}

interface ScoreBreakdown {
  eventAttendance: number;
  interactions: number;
  newsletterOpens: number;
  linkClicks: number;
  lifetimeBonus: number;
  total: number;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60 * 24);
}

function recencyMultiplier(lastEngagementDate: string | null | undefined): number {
  const days = daysSince(lastEngagementDate);
  if (days === null) return 0;
  if (days <= 60) return 1.0;
  if (days <= 120) return 0.75;
  if (days <= 365) return 0.4;
  return 0;
}

function lifetimeDecayMultiplier(lastEventDate: string | null | undefined): number {
  const days = daysSince(lastEventDate);
  if (days === null) return 0.25;
  if (days <= 180) return 1.0;
  if (days <= 365) return 0.5;
  return 0.25;
}

function statusMultiplier(status: string | null | undefined): number {
  if (status === 'active') return 1.0;
  if (status === 'unsubscribed') return 0.3;
  return 0; // bounced or unknown
}

function eventAttendanceRawPoints(count90d: number): number {
  if (count90d <= 0) return 0;
  if (count90d === 1) return 25;
  if (count90d === 2) return 35;
  if (count90d === 3) return 39;
  return 40;
}

function interactionRawPoints(interactions: { interaction_type: string }[]): number {
  const pts = interactions.reduce((sum, i) => sum + pointsForInteractionType(i.interaction_type), 0);
  return Math.min(pts, 30);
}

function newsletterRawPoints(opened: number, received: number): number {
  if (!received) return 0;
  return Math.min((opened / received) * 10, 10);
}

function linkClickRawPoints(clicks: number): number {
  return Math.min(clicks, 10);
}

function lifetimeBonusRawPoints(eventsAttendedCount: number): number {
  if (eventsAttendedCount <= 0) return 0;
  if (eventsAttendedCount === 1) return 5;
  return 10;
}

function scoreColorClass(score: number): string {
  if (score <= 0) return 'text-slate-400';
  if (score <= 30) return 'text-orange-600';
  if (score <= 60) return 'text-amber-600';
  return 'text-emerald-600';
}

export function ScoreBreakdownCard({ memberId }: ScoreBreakdownCardProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [breakdown, setBreakdown] = useState<ScoreBreakdown | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const cutoffIso = new Date(Date.now() - NINETY_DAYS_MS).toISOString();

        const { data: memberRow, error: memberError } = await supabase
          .from('members')
          .select('last_engagement_date, last_event_date, events_attended_count, subscription_status')
          .eq('id', memberId)
          .single();
        if (memberError) throw memberError;

        const { data: signups, error: signupsError } = await supabase
          .from('event_signups')
          .select('event_id, rsvp_status, events(event_date)')
          .eq('member_id', memberId)
          .eq('rsvp_status', 'attended');
        if (signupsError) throw signupsError;

        const events90d = (signups ?? []).filter((s: any) => {
          const eventDate = s.events?.event_date;
          return eventDate && eventDate >= cutoffIso;
        }).length;

        const { data: interactions, error: interactionsError } = await supabase
          .from('interactions')
          .select('interaction_type, occurred_at')
          .eq('member_id', memberId)
          .eq('direction', 'inbound')
          .gte('occurred_at', cutoffIso);
        if (interactionsError) throw interactionsError;

        const { data: snapshot, error: snapshotError } = await supabase
          .from('substack_engagement_snapshots')
          .select('links_clicked, emails_opened_6mo, emails_received_6mo')
          .eq('member_id', memberId)
          .order('snapshot_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (snapshotError) throw snapshotError;

        if (cancelled) return;

        const recency = recencyMultiplier(memberRow.last_engagement_date);
        const decay = lifetimeDecayMultiplier(memberRow.last_event_date);
        const status = statusMultiplier(memberRow.subscription_status);

        const eventPts = eventAttendanceRawPoints(events90d) * recency * status;
        const interactionPts = interactionRawPoints(interactions ?? []) * recency * status;
        const newsletterPts =
          newsletterRawPoints(snapshot?.emails_opened_6mo ?? 0, snapshot?.emails_received_6mo ?? 0) *
          recency *
          status;
        const linkPts = linkClickRawPoints(snapshot?.links_clicked ?? 0) * recency * status;
        const lifetimePts = lifetimeBonusRawPoints(memberRow.events_attended_count ?? 0) * decay * status;

        setBreakdown({
          eventAttendance: Math.round(eventPts),
          interactions: Math.round(interactionPts),
          newsletterOpens: Math.round(newsletterPts),
          linkClicks: Math.round(linkPts),
          lifetimeBonus: Math.round(lifetimePts),
          total: Math.round(eventPts + interactionPts + newsletterPts + linkPts + lifetimePts),
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to calculate score breakdown.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const rows = breakdown
    ? [
        { label: 'Event Attendance', value: breakdown.eventAttendance },
        { label: 'Interactions', value: breakdown.interactions },
        { label: 'Newsletter Opens', value: breakdown.newsletterOpens },
        { label: 'Link Clicks', value: breakdown.linkClicks },
        { label: 'Lifetime Bonus', value: breakdown.lifetimeBonus },
      ]
    : [];

  return (
    <section className="rounded-xl border border-orange/25 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-900">Score Breakdown</h3>

      {loading && <p className="mt-3 text-sm text-slate-500">Calculating…</p>}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {breakdown && !loading && !error && (
        <div className="mt-4">
          <dl className="divide-y divide-slate-100">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4 py-1.5">
                <dt className="text-sm text-slate-500">{row.label}</dt>
                <dd className="text-sm font-medium text-slate-900">{row.value} pts</dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-slate-200 pt-3">
            <span className="text-sm font-semibold text-slate-700">Total</span>
            <span className={`text-lg font-bold ${scoreColorClass(breakdown.total)}`}>
              {breakdown.total} pts
            </span>
          </div>
        </div>
      )}
    </section>
  );
}