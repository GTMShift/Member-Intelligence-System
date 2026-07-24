
// src/components/InteractionTimeline.tsx
//
// Unified activity timeline combining:
//   - Manual interactions (meetings, calls, emails, notes) — passed as props
//   - Member signup date — passed as prop from MemberProfileCard
//   - Events attended — fetched from event_signups (approval=approved, rsvp=attended)
//   - Speaker applications — fetched from speaker_applications
//   - OTR applications — fetched from otr_applications
//
// Uses the project design system tokens:
//   text-ink, bg-surface, bg-charcoal, text-charcoal,
//   bg-orange, text-orange, bg-orange-dark, text-orange-dark,
//   bg-sage, text-sage, bg-sage-tint
 
import React from 'react';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Interaction } from '../types/api';
import { formatTimestamp } from '../utils/format';
 
// ---- Types ------------------------------------------------------------------
 
type TimelineEventType =
  | 'signup'
  | 'event_attended'
  | 'speaker_application'
  | 'otr_application'
  | 'meeting'
  | 'call'
  | 'email'
  | 'event'
  | 'note';
 
interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  date: string;
  title: string;
  subtitle?: string;
  badge?: string;
}
 
// ---- Supabase row types -----------------------------------------------------
 
interface EventSignupRow {
  id: string;
  signup_date: string;
  event_id: string | null;
}
 
interface EventRow {
  id: string;
  event_name: string;
  event_date: string;
  location: string | null;
  event_type: string | null;
}
 
interface SpeakerApplicationRow {
  id: string;
  submitted_at: string;
  status: string;
}
 
interface OtrApplicationRow {
  id: string;
  created_at: string;
  status: string | null;
  event_id: string | null;
}
 
// ---- Style config -----------------------------------------------------------
 
const EVENT_STYLES: Record<
  TimelineEventType,
  { dot: string; badgeBg: string; badgeText: string; label: string }
> = {
  signup: {
    dot: 'bg-sage',
    badgeBg: 'bg-sage-tint',
    badgeText: 'text-sage',
    label: 'Joined',
  },
  event_attended: {
    dot: 'bg-orange',
    badgeBg: 'bg-orange/10',
    badgeText: 'text-orange-dark',
    label: 'Event attended',
  },
  speaker_application: {
    dot: 'bg-charcoal',
    badgeBg: 'bg-surface',
    badgeText: 'text-charcoal',
    label: 'Speaker application',
  },
  otr_application: {
    dot: 'bg-orange-dark',
    badgeBg: 'bg-orange/10',
    badgeText: 'text-orange-dark',
    label: 'OTR application',
  },
  meeting: {
    dot: 'bg-charcoal',
    badgeBg: 'bg-surface',
    badgeText: 'text-charcoal',
    label: 'Meeting',
  },
  call: {
    dot: 'bg-charcoal',
    badgeBg: 'bg-surface',
    badgeText: 'text-charcoal',
    label: 'Call',
  },
  email: {
    dot: 'bg-charcoal',
    badgeBg: 'bg-surface',
    badgeText: 'text-charcoal',
    label: 'Email',
  },
  event: {
    dot: 'bg-charcoal',
    badgeBg: 'bg-surface',
    badgeText: 'text-charcoal',
    label: 'Event',
  },
  note: {
    dot: 'bg-orange',
    badgeBg: 'bg-orange/10',
    badgeText: 'text-orange-dark',
    label: 'Note',
  },
};
 
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  declined: 'Declined',
  waitlist: 'Waitlist',
};
 
// ---- Component --------------------------------------------------------------
 
interface InteractionTimelineProps {
  memberId: string;
  memberCreatedAt: string;
  interactions: Interaction[];
}
 
export function InteractionTimeline({
  memberId,
  memberCreatedAt,
  interactions,
}: InteractionTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
 
  const loadTimelineEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: fetch event signups separately to avoid FK ambiguity in
      // Supabase's nested select (event_signups has multiple FKs to events)
      const signupsResult = await supabase
        .from('event_signups')
        .select('id, signup_date, event_id')
        .eq('member_id', memberId)
        .eq('approval_status', 'approved')
        .eq('rsvp_status', 'attended');
 
      const signups = signupsResult.data ?? [];
 
      // Step 2: fetch events for those signups
      const eventIds = signups
        .map((s: EventSignupRow) => s.event_id)
        .filter(Boolean) as string[];
 
      const eventsResult = eventIds.length > 0
        ? await supabase
            .from('events')
            .select('id, event_name, event_date, location, event_type')
            .in('id', eventIds)
        : { data: [] as EventRow[] };
 
      const eventsMap = Object.fromEntries(
        (eventsResult.data ?? []).map((e: EventRow) => [e.id, e]),
      );
 
      // Step 3: fetch speaker and OTR applications in parallel
      const [speakerResult, otrResult] = await Promise.all([
        supabase
          .from('speaker_applications')
          .select('id, submitted_at, status')
          .eq('member_id', memberId),
        supabase
          .from('otr_applications')
          .select('id, created_at, status, event_id')
          .eq('member_id', memberId),
      ]);
 
      const timelineEvents: TimelineEvent[] = [];
 
      // Signup
      timelineEvents.push({
        id: 'signup',
        type: 'signup',
        date: memberCreatedAt,
        title: 'Joined the community',
      });
 
      // Events attended
      for (const row of signups as EventSignupRow[]) {
        const ev = eventsMap[row.event_id ?? ''];
        timelineEvents.push({
          id: `event-${row.id}`,
          type: 'event_attended',
          date: ev?.event_date ?? row.signup_date,
          title: ev?.event_name ?? 'Event attended',
          subtitle: ev?.location ?? undefined,
          badge: ev?.event_type ?? undefined,
        });
      }
 
      // Speaker applications
      for (const row of (speakerResult.data ?? []) as SpeakerApplicationRow[]) {
        timelineEvents.push({
          id: `speaker-${row.id}`,
          type: 'speaker_application',
          date: row.submitted_at,
          title: 'Applied to speak',
          badge: STATUS_LABELS[row.status] ?? row.status,
        });
      }
 
      // OTR applications
      for (const row of (otrResult.data ?? []) as OtrApplicationRow[]) {
        timelineEvents.push({
          id: `otr-${row.id}`,
          type: 'otr_application',
          date: row.created_at,
          title: 'OTR application submitted',
          badge: row.status ? (STATUS_LABELS[row.status] ?? row.status) : undefined,
        });
      }
 
      // Manual interactions
      for (const interaction of interactions) {
        timelineEvents.push({
          id: `interaction-${interaction.id}`,
          type: interaction.interaction_type,
          date: interaction.occurred_at,
          title: interaction.summary,
          subtitle: interaction.logged_by ? `Logged by ${interaction.logged_by}` : undefined,
        });
      }
 
      // Sort newest first
      timelineEvents.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );
 
      setEvents(timelineEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load timeline.');
    } finally {
      setLoading(false);
    }
  }, [memberId, memberCreatedAt, interactions]);
 
  useEffect(() => {
    async function run() {
      await loadTimelineEvents();
    }
    run().catch(console.error);
  }, [loadTimelineEvents]);
 
  if (loading) {
    return <p className="text-sm text-ink/50">Loading timeline…</p>;
  }
 
  if (error) {
    return <p className="text-sm text-orange-dark">{error}</p>;
  }
 
  if (events.length === 0) {
    return <p className="text-sm text-ink/50">No activity yet.</p>;
  }
 
  return (
    <ol className="relative space-y-0 border-l-2 border-surface pl-6">
      {events.map((event) => {
        const style = EVENT_STYLES[event.type];
        return (
          <li key={event.id} className="relative pb-6 last:pb-0">
            <span
              className={`absolute -left-[1.375rem] top-1 h-3 w-3 rounded-full ring-2 ring-white ${style.dot}`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${style.badgeBg} ${style.badgeText}`}
              >
                {style.label}
              </span>
              {event.badge && (
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-ink/60">
                  {event.badge}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm font-medium text-ink">{event.title}</p>
            {event.subtitle && (
              <p className="mt-0.5 text-xs text-ink/50">{event.subtitle}</p>
            )}
            <time className="mt-0.5 block text-xs text-ink/40">
              {formatTimestamp(event.date)}
            </time>
          </li>
        );
      })}
    </ol>
  );
}
 