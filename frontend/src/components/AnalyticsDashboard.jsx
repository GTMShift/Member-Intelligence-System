import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { supabase } from '../lib/supabaseClient';

// ============================================================================
// GTMShift Analytics Dashboard
// Light theme matching the member directory design language.
// ============================================================================

const BUCKET_STYLES = {
  icp_member: {
    label: 'ICP',
    className: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    color: '#10b981',
  },
  adjacent_remit: {
    label: 'Adjacent',
    className: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-200',
    color: '#0ea5e9',
  },
  between_roles: {
    label: 'Between Roles',
    className: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200',
    color: '#f59e0b',
  },
  consultant: {
    label: 'Consultant',
    className: 'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200',
    color: '#f97316',
  },
  sponsor: {
    label: 'Sponsor',
    className: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-200',
    color: '#8b5cf6',
  },
  personal_connection: {
    label: 'Personal',
    className: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
    color: '#64748b',
  },
  unclassified: {
    label: 'Unclassified',
    className: 'bg-slate-50 text-slate-500 ring-1 ring-inset ring-slate-200',
    color: '#cbd5e1',
  },
};

function scoreColor(score) {
  if (score == null || score === 0) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-600 font-semibold';
  if (score >= 50) return 'text-amber-600 font-semibold';
  if (score >= 20) return 'text-orange-600 font-medium';
  return 'text-slate-500';
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function daysAgo(value) {
  if (!value) return null;
  const then = new Date(value).getTime();
  const now = Date.now();
  const days = Math.floor((now - then) / (1000 * 60 * 60 * 24));
  return days;
}

function relativeDate(value) {
  const d = daysAgo(value);
  if (d == null) return 'Never';
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

function BucketBadge({ bucket }) {
  const key = bucket || 'unclassified';
  const style = BUCKET_STYLES[key] || BUCKET_STYLES.unclassified;
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${style.className}`}
    >
      {style.label}
    </span>
  );
}

// ============================================================================
// Metric Card
// ============================================================================

function MetricCard({ label, value, sublabel, trend }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-semibold text-slate-900">{value}</p>
        {trend && (
          <span className="text-xs font-medium text-emerald-600">{trend}</span>
        )}
      </div>
      {sublabel && (
        <p className="mt-1 text-xs text-slate-500">{sublabel}</p>
      )}
    </div>
  );
}

// ============================================================================
// Section Wrapper
// ============================================================================

function Section({ title, subtitle, action, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm h-full flex flex-col">
      <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="p-5 flex-1">{children}</div>
    </section>
  );
}

// ============================================================================
// Event History Section (with show all toggle)
// ============================================================================

// ============================================================================
// Cold Members Section (compact sidebar, paginated)
// ============================================================================

function ColdMembersSection({ coldMembers }) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(coldMembers.length / PAGE_SIZE);
  const displayed = coldMembers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Section
      title="Going Cold"
      subtitle={`${coldMembers.length} members to re-engage`}
    >
      {coldMembers.length === 0 ? (
        <p className="text-sm text-slate-500">No members flagged. Network is warm.</p>
      ) : (
        <>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-3">Member</th>
                <th className="pb-3 pr-3 text-right">Events</th>
                <th className="pb-3 text-right">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayed.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="py-3 pr-3">
                    <div className="text-sm font-medium text-slate-900">
                      {m.first_name} {m.last_name}
                    </div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </td>
                  <td className="py-3 pr-3 text-right text-slate-700 align-top pt-3.5">
                    {m.events_attended_count}
                  </td>
                  <td className="py-3 text-right text-slate-600 align-top pt-3.5 whitespace-nowrap">
                    {relativeDate(m.last_engagement_date || m.last_event_date)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <Pagination
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage((p) => Math.max(0, p - 1))}
              onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            />
          )}
        </>
      )}
    </Section>
  );
}

// ============================================================================
// Top Members Section (paginated)
// ============================================================================

function TopMembersSection({ topMembers }) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(topMembers.length / PAGE_SIZE);
  const displayed = topMembers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const startRank = page * PAGE_SIZE + 1;

  return (
    <Section
      title="Top Engaged Members"
      subtitle={`Top ${topMembers.length} by engagement score`}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="pb-3 pr-3 w-8">#</th>
              <th className="pb-3 pr-4">Member</th>
              <th className="pb-3 pr-4">Bucket</th>
              <th className="pb-3 pr-4 text-right">Score</th>
              <th className="pb-3 pr-4 text-right">Events</th>
              <th className="pb-3">Last Engaged</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map((m, i) => (
              <tr key={m.id} className="hover:bg-slate-50">
                <td className="py-3 pr-3 text-xs text-slate-400 tabular-nums">
                  {startRank + i}
                </td>
                <td className="py-3 pr-4">
                  <div className="font-medium text-slate-900">
                    {m.first_name} {m.last_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {m.current_company || m.seniority_level || m.email}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <BucketBadge bucket={m.bucket} />
                </td>
                <td className={`py-3 pr-4 text-right ${scoreColor(m.engagement_score)}`}>
                  {m.engagement_score.toFixed(1)}
                </td>
                <td className="py-3 pr-4 text-right text-slate-700">
                  {m.events_attended_count}
                </td>
                <td className="py-3 text-slate-600">
                  {relativeDate(m.last_engagement_date)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        />
      )}
    </Section>
  );
}

// ============================================================================
// Pagination Controls
// ============================================================================

function Pagination({ page, totalPages, onPrev, onNext }) {
  return (
    <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
      <button
        onClick={onPrev}
        disabled={page === 0}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
        </svg>
        Previous
      </button>
      <span className="text-xs text-slate-500">
        Page {page + 1} of {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={page >= totalPages - 1}
        className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

// ============================================================================
// Event History Section (paginated)
// ============================================================================

function EventHistorySection({ eventHistory }) {
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(eventHistory.length / PAGE_SIZE);
  const displayed = eventHistory.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Section
      title="Event History"
      subtitle={`${eventHistory.length} events total`}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="pb-3 pr-4">Event</th>
              <th className="pb-3 pr-4">Date</th>
              <th className="pb-3 pr-4 text-right">Signups</th>
              <th className="pb-3 pr-4 text-right">Attended</th>
              <th className="pb-3 pr-4 text-right">No-show</th>
              <th className="pb-3 text-right">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayed.map((e) => {
              const rate = e.attendanceRate;
              const rateColor =
                rate == null
                  ? 'text-slate-400'
                  : rate >= 70
                  ? 'text-emerald-600'
                  : rate >= 40
                  ? 'text-amber-600'
                  : 'text-orange-600';
              return (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-900">{e.event_name}</div>
                    {e.location && (
                      <div className="text-xs text-slate-500">{e.location}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{formatDate(e.event_date)}</td>
                  <td className="py-3 pr-4 text-right text-slate-700">{e.total}</td>
                  <td className="py-3 pr-4 text-right text-slate-700">{e.attended}</td>
                  <td className="py-3 pr-4 text-right text-slate-700">{e.noShow}</td>
                  <td className={`py-3 text-right font-medium ${rateColor}`}>
                    {rate == null ? '—' : `${rate.toFixed(0)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPrev={() => setPage((p) => Math.max(0, p - 1))}
          onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
        />
      )}
    </Section>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function AnalyticsDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [topMembers, setTopMembers] = useState([]);
  const [icpBreakdown, setIcpBreakdown] = useState([]);
  const [scoreDistribution, setScoreDistribution] = useState([]);
  const [newsletterStats, setNewsletterStats] = useState(null);
  const [eventHistory, setEventHistory] = useState([]);
  const [coldMembers, setColdMembers] = useState([]);
  const [topClickers, setTopClickers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        setLoading(true);
        setError(null);

        const [
          statsRes,
          topRes,
          icpRes,
          scoreRes,
          newsRes,
          eventsRes,
          coldRes,
          clickersRes,
        ] = await Promise.all([
          fetchStats(),
          fetchTopMembers(),
          fetchIcpBreakdown(),
          fetchScoreDistribution(),
          fetchNewsletterStats(),
          fetchEventHistory(),
          fetchColdMembers(),
          fetchTopClickers(),
        ]);

        setStats(statsRes);
        setTopMembers(topRes);
        setIcpBreakdown(icpRes);
        setScoreDistribution(scoreRes);
        setNewsletterStats(newsRes);
        setEventHistory(eventsRes);
        setColdMembers(coldRes);
        setTopClickers(clickersRes);
      } catch (err) {
        console.error(err);
        setError(err.message || 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // --------------------------------------------------------------------------
  // Data fetchers
  // --------------------------------------------------------------------------

  async function fetchStats() {
    const [activeRes, engagedRes, avgRes, eventsRes] = await Promise.all([
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('subscription_status', 'active'),
      supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .gte(
          'last_engagement_date',
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        ),
      supabase
        .from('members')
        .select('engagement_score')
        .gt('engagement_score', 0),
      supabase.from('events').select('id', { count: 'exact', head: true }),
    ]);

    const scores = (avgRes.data || []).map((r) => Number(r.engagement_score));
    const avg = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    return {
      totalActive: activeRes.count || 0,
      engaged30d: engagedRes.count || 0,
      avgScore: Math.round(avg * 10) / 10,
      totalEvents: eventsRes.count || 0,
    };
  }

  async function fetchTopMembers() {
    const { data, error } = await supabase
      .from('members')
      .select(
        `
          id,
          first_name,
          last_name,
          email,
          engagement_score,
          events_attended_count,
          last_engagement_date,
          last_newsletter_open_at,
          subscription_status,
          member_profile ( bucket, seniority_level )
        `,
      )
      .gt('engagement_score', 0)
      .order('engagement_score', { ascending: false })
      .limit(30);

    if (error) throw error;
    return (data || []).map((row) => {
      const profile = Array.isArray(row.member_profile)
        ? row.member_profile[0]
        : row.member_profile;
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        engagement_score: Number(row.engagement_score),
        events_attended_count: row.events_attended_count ?? 0,
        last_engagement_date: row.last_engagement_date,
        last_newsletter_open_at: row.last_newsletter_open_at,
        subscription_status: row.subscription_status,
        bucket: profile?.bucket ?? null,
        seniority_level: profile?.seniority_level ?? null,
        current_company: null,
      };
    });
  }

  async function fetchIcpBreakdown() {
    const { data, error } = await supabase
      .from('member_profile')
      .select('bucket');
    if (error) throw error;

    const counts = {};
    (data || []).forEach((r) => {
      const key = r.bucket || 'unclassified';
      counts[key] = (counts[key] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([bucket, count]) => ({
        bucket,
        label: BUCKET_STYLES[bucket]?.label || bucket,
        count,
        color: BUCKET_STYLES[bucket]?.color || '#cbd5e1',
      }))
      .sort((a, b) => b.count - a.count);
  }

  async function fetchScoreDistribution() {
    const { data, error } = await supabase
      .from('members')
      .select('engagement_score');
    if (error) throw error;

    const buckets = [
      { range: 'No score', min: -1, max: 0.001, count: 0 },
      { range: '1–20', min: 0.001, max: 20, count: 0 },
      { range: '21–40', min: 20, max: 40, count: 0 },
      { range: '41–60', min: 40, max: 60, count: 0 },
      { range: '61–80', min: 60, max: 80, count: 0 },
      { range: '81–100', min: 80, max: 100, count: 0 },
      { range: '100+', min: 100, max: Infinity, count: 0 },
    ];

    (data || []).forEach((r) => {
      const s = Number(r.engagement_score ?? 0);
      const bucket = buckets.find((b) => s >= b.min && s < b.max);
      if (bucket) bucket.count += 1;
    });

    return buckets.map(({ range, count }) => ({ range, count }));
  }

  async function fetchNewsletterStats() {
    const { data, error } = await supabase
      .from('members')
      .select('last_newsletter_open_at, subscription_status')
      .eq('subscription_status', 'active');
    if (error) throw error;

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const total = (data || []).length;

    let opened7 = 0;
    let opened30 = 0;
    let opened90 = 0;
    let neverOpened = 0;

    (data || []).forEach((r) => {
      if (!r.last_newsletter_open_at) {
        neverOpened += 1;
        return;
      }
      const daysAgo = (now - new Date(r.last_newsletter_open_at).getTime()) / day;
      if (daysAgo <= 7) opened7 += 1;
      if (daysAgo <= 30) opened30 += 1;
      if (daysAgo <= 90) opened90 += 1;
    });

    return {
      total,
      opened7,
      opened30,
      opened90,
      neverOpened,
      chart: [
        { window: 'Last 7d', members: opened7 },
        { window: 'Last 30d', members: opened30 },
        { window: 'Last 90d', members: opened90 },
        { window: 'Never', members: neverOpened },
      ],
    };
  }

  async function fetchEventHistory() {
    const { data: events, error: eventsErr } = await supabase
      .from('events')
      .select('id, event_name, event_date, event_type, location')
      .order('event_date', { ascending: false });
    if (eventsErr) throw eventsErr;

    const { data: signups, error: signupsErr } = await supabase
      .from('event_signups')
      .select('event_id, rsvp_status');
    if (signupsErr) throw signupsErr;

    return (events || []).map((e) => {
      const forEvent = (signups || []).filter((s) => s.event_id === e.id);
      const attended = forEvent.filter((s) => s.rsvp_status === 'attended').length;
      const noShow = forEvent.filter((s) => s.rsvp_status === 'no_show').length;
      const canceled = forEvent.filter((s) => s.rsvp_status === 'canceled').length;
      const registered = forEvent.filter((s) => s.rsvp_status === 'registered').length;
      const responded = attended + noShow;
      const attendanceRate = responded > 0 ? (attended / responded) * 100 : null;
      return {
        id: e.id,
        event_name: e.event_name,
        event_date: e.event_date,
        event_type: e.event_type,
        location: e.location,
        total: forEvent.length,
        attended,
        noShow,
        canceled,
        registered,
        attendanceRate,
      };
    });
  }

  async function fetchColdMembers() {
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('members')
      .select(
        `
          id,
          first_name,
          last_name,
          email,
          engagement_score,
          last_engagement_date,
          last_event_date,
          events_attended_count,
          subscription_status,
          member_profile ( bucket, seniority_level )
        `,
      )
      .eq('subscription_status', 'active')
      .gte('events_attended_count', 1)
      .order('events_attended_count', { ascending: false });

    if (error) throw error;

    const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;

    return (data || [])
      .filter((row) => {
        // Both last_engagement_date and last_event_date must be older than 90 days (or null)
        const engagementOld = !row.last_engagement_date || new Date(row.last_engagement_date).getTime() < cutoffMs;
        const eventOld = !row.last_event_date || new Date(row.last_event_date).getTime() < cutoffMs;
        return engagementOld && eventOld;
      }).map((row) => {
      const profile = Array.isArray(row.member_profile)
        ? row.member_profile[0]
        : row.member_profile;
      return {
        id: row.id,
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        engagement_score: Number(row.engagement_score),
        last_engagement_date: row.last_engagement_date,
        last_event_date: row.last_event_date,
        events_attended_count: row.events_attended_count ?? 0,
        bucket: profile?.bucket ?? null,
        seniority_level: profile?.seniority_level ?? null,
      };
    });
  }

  async function fetchTopClickers() {
    const { data: snaps, error: snapsErr } = await supabase
      .from('substack_engagement_snapshots')
      .select(
        'member_id, links_clicked, emails_opened_6mo, emails_received_6mo, last_clicked_at, snapshot_at',
      )
      .not('member_id', 'is', null)
      .gt('links_clicked', 0)
      .order('snapshot_at', { ascending: false })
      .limit(500);
    if (snapsErr) throw snapsErr;

    // reduce to most recent snapshot per member
    const latestByMember = new Map();
    (snaps || []).forEach((s) => {
      if (!latestByMember.has(s.member_id)) latestByMember.set(s.member_id, s);
    });
    const sorted = Array.from(latestByMember.values())
      .sort((a, b) => (b.links_clicked || 0) - (a.links_clicked || 0))
      .slice(0, 10);

    if (sorted.length === 0) return [];

    const ids = sorted.map((s) => s.member_id);
    const { data: members, error: membersErr } = await supabase
      .from('members')
      .select(
        `
          id, first_name, last_name, email, engagement_score,
          member_profile ( bucket )
        `,
      )
      .in('id', ids);
    if (membersErr) throw membersErr;

    const map = new Map((members || []).map((m) => [m.id, m]));
    return sorted.map((s) => {
      const m = map.get(s.member_id) || {};
      const profile = Array.isArray(m.member_profile)
        ? m.member_profile[0]
        : m.member_profile;
      return {
        id: s.member_id,
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email,
        engagement_score: Number(m.engagement_score) || 0,
        bucket: profile?.bucket ?? null,
        links_clicked: s.links_clicked,
        emails_opened_6mo: s.emails_opened_6mo,
        emails_received_6mo: s.emails_received_6mo,
        last_clicked_at: s.last_clicked_at,
      };
    });
  }

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-slate-500">Loading analytics…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-medium text-red-800">
            Failed to load analytics
          </p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[90rem] space-y-6 px-4 py-6 sm:px-6">
      {/* Back to dashboard */}
      <button
        type="button"
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to dashboard
      </button>

      {/* Overview stats */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Community Overview
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Active Members"
            value={stats?.totalActive?.toLocaleString() ?? '—'}
            sublabel="Subscribed and reachable"
          />
          <MetricCard
            label="Engaged Last 30 Days"
            value={stats?.engaged30d?.toLocaleString() ?? '—'}
            sublabel={
              stats?.totalActive
                ? `${Math.round((stats.engaged30d / stats.totalActive) * 100)}% of active`
                : ''
            }
          />
          <MetricCard
            label="Avg Engagement Score"
            value={stats?.avgScore ?? '—'}
            sublabel="Across scored members"
          />
          <MetricCard
            label="Total Events Hosted"
            value={stats?.totalEvents ?? '—'}
            sublabel="All time"
          />
        </div>
      </div>

      {/* Two-column: Top Members + Going Cold */}
      <div className="grid gap-6 lg:grid-cols-3 items-stretch">
        <div className="lg:col-span-2 flex flex-col">
          <TopMembersSection topMembers={topMembers} />
        </div>
        <div className="flex flex-col">
          <ColdMembersSection coldMembers={coldMembers} />
        </div>
      </div>

      {/* Charts row */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="ICP Breakdown" subtitle="How members are classified">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={icpBreakdown}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {icpBreakdown.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {icpBreakdown.map((row) => (
              <div key={row.bucket} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: row.color }}
                />
                <span className="text-slate-700">{row.label}</span>
                <span className="ml-auto font-medium text-slate-900">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Engagement Score" subtitle="How members are distributed">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scoreDistribution} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <XAxis
                  dataKey="range"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Newsletter Engagement" subtitle="Active subscribers by time window">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={newsletterStats?.chart || []}
                margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
              >
                <XAxis
                  dataKey="window"
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#64748b' }}
                  axisLine={{ stroke: '#e2e8f0' }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="members" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
      </div>

      {/* Event history */}
      <EventHistorySection eventHistory={eventHistory} />

      {/* Top clickers */}
      <Section
        title="Top Newsletter Clickers"
        subtitle="Members clicking links in newsletters"
      >
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="pb-3 pr-4">Member</th>
                <th className="pb-3 pr-4">Bucket</th>
                <th className="pb-3 pr-4 text-right">Clicks</th>
                <th className="pb-3 pr-4 text-right">Score</th>
                <th className="pb-3">Last Click</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topClickers.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-900">
                      {m.first_name} {m.last_name}
                    </div>
                    <div className="text-xs text-slate-500">{m.email}</div>
                  </td>
                  <td className="py-3 pr-4">
                    <BucketBadge bucket={m.bucket} />
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold text-slate-900">
                    {m.links_clicked}
                  </td>
                  <td className={`py-3 pr-4 text-right ${scoreColor(m.engagement_score)}`}>
                    {m.engagement_score.toFixed(1)}
                  </td>
                  <td className="py-3 text-slate-600">
                    {relativeDate(m.last_clicked_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}