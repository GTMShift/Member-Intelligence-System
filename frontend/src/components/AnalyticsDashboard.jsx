import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { supabase } from '../lib/supabaseClient';

const BUCKET_LABELS = {
  icp_member: 'ICP Member',
  adjacent_remit: 'Adjacent Remit',
  between_roles: 'Between Roles',
  consultant: 'Consultant',
  sponsor: 'Sponsor',
  personal_connection: 'Personal Connection',
  Unclassified: 'Unclassified',
};

const BUCKET_BADGE = {
  icp_member: 'bg-emerald-950/60 text-emerald-400 border-emerald-800',
  adjacent_remit: 'bg-blue-950/60 text-blue-400 border-blue-800',
  between_roles: 'bg-yellow-950/60 text-yellow-400 border-yellow-800',
  consultant: 'bg-orange-950/60 text-orange-400 border-orange-800',
  sponsor: 'bg-purple-950/60 text-purple-400 border-purple-800',
  personal_connection: 'bg-slate-700/60 text-slate-300 border-slate-600',
  Unclassified: 'bg-slate-800/60 text-slate-400 border-slate-700',
};

const BUCKET_CHART_COLORS = {
  icp_member: '#34d399',
  adjacent_remit: '#60a5fa',
  between_roles: '#facc15',
  consultant: '#fb923c',
  sponsor: '#c084fc',
  personal_connection: '#9ca3af',
  Unclassified: '#64748b',
};

const SCORE_RANGE_ORDER = ['No Score', '1–20', '21–40', '41–60', '61–80', '81–100', '100+'];

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function scoreTextClass(score) {
  if (score == null) return 'text-slate-400';
  if (score >= 80) return 'text-emerald-400';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 20) return 'text-orange-400';
  return 'text-red-400';
}

function attendanceRateClass(rate) {
  if (rate == null) return 'text-slate-400';
  if (rate > 70) return 'text-emerald-400';
  if (rate >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function bucketKey(bucket) {
  return bucket ?? 'Unclassified';
}

function bucketLabel(bucket) {
  return BUCKET_LABELS[bucketKey(bucket)] ?? bucketKey(bucket);
}

function normalizeProfile(profile) {
  if (Array.isArray(profile)) return profile[0] ?? null;
  return profile ?? null;
}

function getCompanyName(profile) {
  const p = normalizeProfile(profile);
  if (!p) return '—';
  const company = p.company ?? p.companies;
  if (Array.isArray(company)) return company[0]?.name ?? '—';
  return company?.name ?? '—';
}

function scoreRange(score) {
  if (score == null || score === 0) return 'No Score';
  if (score < 20) return '1–20';
  if (score < 40) return '21–40';
  if (score < 60) return '41–60';
  if (score < 80) return '61–80';
  if (score < 100) return '81–100';
  return '100+';
}

async function fetchStats() {
  const thirtyDaysAgo = daysAgoIso(30);

  const [activeRes, engagedRes, scoresRes, eventsRes] = await Promise.all([
    supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .eq('subscription_status', 'active'),
    supabase
      .from('members')
      .select('*', { count: 'exact', head: true })
      .gte('last_engagement_date', thirtyDaysAgo),
    supabase.from('members').select('engagement_score').gt('engagement_score', 0),
    supabase.from('events').select('*', { count: 'exact', head: true }),
  ]);

  if (activeRes.error) throw activeRes.error;
  if (engagedRes.error) throw engagedRes.error;
  if (scoresRes.error) throw scoresRes.error;
  if (eventsRes.error) throw eventsRes.error;

  const scores = scoresRes.data ?? [];
  const avgScore =
    scores.length > 0
      ? Math.round((scores.reduce((sum, r) => sum + Number(r.engagement_score), 0) / scores.length) * 10) / 10
      : 0;

  return {
    totalActive: activeRes.count ?? 0,
    engagedLast30: engagedRes.count ?? 0,
    avgEngagementScore: avgScore,
    totalEvents: eventsRes.count ?? 0,
  };
}

async function fetchTopMembers() {
  const { data, error } = await supabase
    .from('members')
    .select(
      `first_name, last_name, email, engagement_score, events_attended_count,
       last_engagement_date, last_newsletter_open_at, subscription_status,
       member_profile ( seniority_level, bucket, company:companies ( name ) )`,
    )
    .gt('engagement_score', 0)
    .order('engagement_score', { ascending: false })
    .limit(25);

  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = normalizeProfile(row.member_profile);
    return {
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
      seniority_level: profile?.seniority_level ?? null,
      bucket: profile?.bucket ?? null,
      company: getCompanyName(row.member_profile),
      engagement_score: Number(row.engagement_score),
      events_attended_count: row.events_attended_count ?? 0,
      last_engagement_date: row.last_engagement_date,
      last_newsletter_open_at: row.last_newsletter_open_at,
      subscription_status: row.subscription_status,
    };
  });
}

async function fetchIcpBreakdown() {
  const { data, error } = await supabase.from('member_profile').select('bucket');
  if (error) throw error;

  const counts = {};
  for (const row of data ?? []) {
    const key = bucketKey(row.bucket);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.entries(counts)
    .map(([bucket, count]) => ({
      bucket,
      label: bucketLabel(bucket),
      count,
    }))
    .sort((a, b) => b.count - a.count);
}

async function fetchScoreDistribution() {
  const { data, error } = await supabase.from('members').select('engagement_score');
  if (error) throw error;

  const counts = Object.fromEntries(SCORE_RANGE_ORDER.map((r) => [r, 0]));
  for (const row of data ?? []) {
    const range = scoreRange(row.engagement_score == null ? null : Number(row.engagement_score));
    counts[range] = (counts[range] ?? 0) + 1;
  }

  return SCORE_RANGE_ORDER.map((score_range) => ({
    score_range,
    member_count: counts[score_range] ?? 0,
  }));
}

async function fetchNewsletterStats() {
  const sevenDaysAgo = daysAgoIso(7);
  const thirtyDaysAgo = daysAgoIso(30);
  const ninetyDaysAgo = daysAgoIso(90);

  const { data, error } = await supabase
    .from('members')
    .select('last_newsletter_open_at')
    .eq('subscription_status', 'active');

  if (error) throw error;

  const rows = data ?? [];
  let opened7d = 0;
  let opened30d = 0;
  let opened90d = 0;
  let neverOpened = 0;

  for (const row of rows) {
    const openedAt = row.last_newsletter_open_at;
    if (!openedAt) {
      neverOpened += 1;
      continue;
    }
    if (openedAt >= sevenDaysAgo) opened7d += 1;
    if (openedAt >= thirtyDaysAgo) opened30d += 1;
    if (openedAt >= ninetyDaysAgo) opened90d += 1;
  }

  return {
    total_active: rows.length,
    opened_7d: opened7d,
    opened_30d: opened30d,
    opened_90d: opened90d,
    never_opened: neverOpened,
    chartData: [
      { label: 'Last 7 Days', value: opened7d },
      { label: 'Last 30 Days', value: opened30d },
      { label: 'Last 90 Days', value: opened90d },
      { label: 'Never Opened', value: neverOpened },
    ],
  };
}

async function fetchEventHistory() {
  const { data, error } = await supabase
    .from('events')
    .select(
      `id, event_name, event_date, event_type, location,
       event_signups ( id, rsvp_status )`,
    )
    .order('event_date', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((event) => {
    const signups = event.event_signups ?? [];
    const attended = signups.filter((s) => s.rsvp_status === 'attended').length;
    const noShow = signups.filter((s) => s.rsvp_status === 'no_show').length;
    const canceled = signups.filter((s) => s.rsvp_status === 'canceled').length;
    const registered = signups.filter((s) => s.rsvp_status === 'registered').length;
    const denominator = attended + noShow;
    const attendanceRate =
      denominator > 0 ? Math.round((attended / denominator) * 1000) / 10 : null;

    return {
      event_name: event.event_name,
      event_date: event.event_date,
      event_type: event.event_type,
      location: event.location,
      total_signups: signups.length,
      attended,
      no_show: noShow,
      canceled,
      registered,
      attendance_rate_pct: attendanceRate,
    };
  });
}

async function fetchColdMembers() {
  const ninetyDaysAgo = daysAgoIso(90);
  const targetBuckets = new Set(['icp_member', 'adjacent_remit', 'between_roles']);

  const { data, error } = await supabase
    .from('members')
    .select(
      `first_name, last_name, email, engagement_score, last_engagement_date, events_attended_count,
       member_profile ( bucket, seniority_level )`,
    )
    .eq('subscription_status', 'active')
    .gt('engagement_score', 20)
    .order('engagement_score', { ascending: false });

  if (error) throw error;

  return (data ?? [])
    .filter((row) => {
      const profile = normalizeProfile(row.member_profile);
      const bucket = profile?.bucket ?? null;
      const bucketOk = bucket == null || targetBuckets.has(bucket);
      const lastEngaged = row.last_engagement_date;
      const isCold = !lastEngaged || lastEngaged < ninetyDaysAgo;
      return bucketOk && isCold;
    })
    .slice(0, 10)
    .map((row) => {
      const profile = normalizeProfile(row.member_profile);
      return {
        first_name: row.first_name,
        last_name: row.last_name,
        email: row.email,
        bucket: profile?.bucket ?? null,
        seniority_level: profile?.seniority_level ?? null,
        engagement_score: Number(row.engagement_score),
        last_engagement_date: row.last_engagement_date,
        events_attended_count: row.events_attended_count ?? 0,
      };
    });
}

async function fetchTopClickers() {
  const { data: snapshots, error: snapError } = await supabase
    .from('substack_engagement_snapshots')
    .select(
      `member_id, links_clicked, emails_opened_6mo, emails_received_6mo,
       last_clicked_at, snapshot_at`,
    )
    .gt('links_clicked', 0)
    .order('snapshot_at', { ascending: false });

  if (snapError) throw snapError;

  const latestByMember = new Map();
  for (const row of snapshots ?? []) {
    if (!latestByMember.has(row.member_id)) {
      latestByMember.set(row.member_id, row);
    }
  }

  const topSnapshots = [...latestByMember.values()]
    .sort((a, b) => b.links_clicked - a.links_clicked)
    .slice(0, 15);

  if (topSnapshots.length === 0) return [];

  const memberIds = topSnapshots.map((s) => s.member_id);

  const { data: members, error: memberError } = await supabase
    .from('members')
    .select(
      `id, first_name, last_name, email, engagement_score,
       member_profile ( bucket )`,
    )
    .in('id', memberIds);

  if (memberError) throw memberError;

  const memberMap = Object.fromEntries((members ?? []).map((m) => [m.id, m]));

  return topSnapshots.map((snap) => {
    const member = memberMap[snap.member_id];
    const profile = normalizeProfile(member?.member_profile);
    return {
      first_name: member?.first_name ?? '—',
      last_name: member?.last_name ?? '—',
      email: member?.email ?? '—',
      bucket: profile?.bucket ?? null,
      links_clicked: snap.links_clicked,
      emails_opened_6mo: snap.emails_opened_6mo,
      emails_received_6mo: snap.emails_received_6mo,
      last_clicked_at: snap.last_clicked_at,
      engagement_score: member?.engagement_score != null ? Number(member.engagement_score) : null,
    };
  });
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-4 border-b border-slate-800 pb-3">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-5">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-50">{value}</p>
    </div>
  );
}

function BucketBadge({ bucket }) {
  const key = bucketKey(bucket);
  const classes = BUCKET_BADGE[key] ?? BUCKET_BADGE.Unclassified;
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${classes}`}>
      {bucketLabel(bucket)}
    </span>
  );
}

function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-slate-200">{label ?? payload[0]?.payload?.label}</p>
      <p className="text-slate-400">{payload[0].value} members</p>
    </div>
  );
}

export default function AnalyticsDashboard() {
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
  const [expandedRow, setExpandedRow] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: 'engagement_score', direction: 'desc' });

  useEffect(() => {
    async function fetchAllData() {
      try {
        setLoading(true);
        setError(null);

        const [
          statsData,
          topMembersData,
          icpData,
          scoreDistData,
          newsletterData,
          eventsData,
          coldData,
          clickersData,
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

        setStats(statsData);
        setTopMembers(topMembersData);
        setIcpBreakdown(icpData);
        setScoreDistribution(scoreDistData);
        setNewsletterStats(newsletterData);
        setEventHistory(eventsData);
        setColdMembers(coldData);
        setTopClickers(clickersData);
      } catch (err) {
        setError(err?.message ?? 'Failed to load analytics data');
      } finally {
        setLoading(false);
      }
    }

    fetchAllData();
  }, []);

  const sortedTopMembers = useMemo(() => {
    const sorted = [...topMembers];
    const { key, direction } = sortConfig;
    sorted.sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      if (key === 'name') {
        aVal = `${a.last_name} ${a.first_name}`.toLowerCase();
        bVal = `${b.last_name} ${b.first_name}`.toLowerCase();
      }
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      if (typeof aVal === 'string') {
        return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return direction === 'asc' ? aVal - bVal : bVal - aVal;
    });
    return sorted;
  }, [topMembers, sortConfig]);

  function handleSort(key) {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  }

  function sortIndicator(key) {
    if (sortConfig.key !== key) return '';
    return sortConfig.direction === 'asc' ? ' ↑' : ' ↓';
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-400">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-8">
        <div className="max-w-lg rounded-lg border border-red-800 bg-red-950/40 px-6 py-4 text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 px-8 py-8 text-slate-100">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-50">GTMShift Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">
          Internal community health dashboard — engagement, events, and outreach priorities
        </p>
      </header>

      {/* Section 1 — Top Stats */}
      <section className="mb-10">
        <SectionHeader title="Community Overview" />
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Active Members" value={stats?.totalActive ?? 0} />
          <StatCard label="Engaged Last 30 Days" value={stats?.engagedLast30 ?? 0} />
          <StatCard label="Avg Engagement Score" value={stats?.avgEngagementScore ?? 0} />
          <StatCard label="Total Events Hosted" value={stats?.totalEvents ?? 0} />
        </div>
      </section>

      {/* Section 2 — Top Engaged Members */}
      <section className="mb-10">
        <SectionHeader
          title="Top Engaged Members"
          subtitle="Top 25 members by engagement score — click a row for details"
        />
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="cursor-pointer px-4 py-3" onClick={() => handleSort('name')}>
                  Name{sortIndicator('name')}
                </th>
                <th className="px-4 py-3">Company</th>
                <th className="cursor-pointer px-4 py-3" onClick={() => handleSort('bucket')}>
                  ICP Bucket{sortIndicator('bucket')}
                </th>
                <th
                  className="cursor-pointer px-4 py-3"
                  onClick={() => handleSort('engagement_score')}
                >
                  Score{sortIndicator('engagement_score')}
                </th>
                <th
                  className="cursor-pointer px-4 py-3"
                  onClick={() => handleSort('events_attended_count')}
                >
                  Events{sortIndicator('events_attended_count')}
                </th>
                <th
                  className="cursor-pointer px-4 py-3"
                  onClick={() => handleSort('last_engagement_date')}
                >
                  Last Engaged{sortIndicator('last_engagement_date')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedTopMembers.map((member, idx) => {
                const rowKey = `${member.email}-${idx}`;
                const isExpanded = expandedRow === rowKey;
                return (
                  <Fragment key={rowKey}>
                    <tr
                      onClick={() => setExpandedRow(isExpanded ? null : rowKey)}
                      className={`cursor-pointer border-t border-slate-800 ${
                        idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'
                      } hover:bg-slate-800/50`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-100">
                        {member.first_name} {member.last_name}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{member.company}</td>
                      <td className="px-4 py-3">
                        <BucketBadge bucket={member.bucket} />
                      </td>
                      <td className={`px-4 py-3 font-semibold ${scoreTextClass(member.engagement_score)}`}>
                        {member.engagement_score}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{member.events_attended_count}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(member.last_engagement_date)}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-t border-slate-800 bg-slate-900/60">
                        <td colSpan={6} className="px-4 py-3 text-sm text-slate-400">
                          <span className="text-slate-300">Email:</span> {member.email}
                          <span className="mx-3 text-slate-700">|</span>
                          <span className="text-slate-300">Last engaged:</span>{' '}
                          {member.last_engagement_date
                            ? new Date(member.last_engagement_date).toLocaleString('en-US')
                            : '—'}
                          <span className="mx-3 text-slate-700">|</span>
                          <span className="text-slate-300">Last newsletter open:</span>{' '}
                          {formatDate(member.last_newsletter_open_at)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 3 — Charts */}
      <section className="mb-10">
        <SectionHeader title="Engagement & ICP Insights" />
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-300">ICP Breakdown</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={icpBreakdown} layout="vertical" margin={{ left: 20, right: 16 }}>
                <XAxis type="number" stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {icpBreakdown.map((entry) => (
                    <Cell
                      key={entry.bucket}
                      fill={BUCKET_CHART_COLORS[entry.bucket] ?? BUCKET_CHART_COLORS.Unclassified}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-300">Engagement Score Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={scoreDistribution} margin={{ bottom: 8 }}>
                <XAxis
                  dataKey="score_range"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                  height={60}
                />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="member_count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-4">
            <h3 className="mb-3 text-sm font-medium text-slate-300">Newsletter Engagement</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={newsletterStats?.chartData ?? []} margin={{ bottom: 8 }}>
                <XAxis
                  dataKey="label"
                  stroke="#64748b"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis stroke="#64748b" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip content={<DarkTooltip />} />
                <Bar dataKey="value" fill="#38bdf8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Section 4 — Event History */}
      <section className="mb-10">
        <SectionHeader title="Event History" subtitle="Attendance breakdown by event" />
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Location</th>
                <th className="px-4 py-3">Signups</th>
                <th className="px-4 py-3">Attended</th>
                <th className="px-4 py-3">No Show</th>
                <th className="px-4 py-3">Canceled</th>
                <th className="px-4 py-3">Registered</th>
                <th className="px-4 py-3">Rate</th>
              </tr>
            </thead>
            <tbody>
              {eventHistory.map((event, idx) => (
                <tr
                  key={`${event.event_name}-${event.event_date}`}
                  className={`border-t border-slate-800 ${
                    idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-100">{event.event_name}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDate(event.event_date)}</td>
                  <td className="px-4 py-3 text-slate-300">{event.event_type ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{event.location ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-300">{event.total_signups}</td>
                  <td className="px-4 py-3 text-emerald-400">{event.attended}</td>
                  <td className="px-4 py-3 text-orange-400">{event.no_show}</td>
                  <td className="px-4 py-3 text-slate-400">{event.canceled}</td>
                  <td className="px-4 py-3 text-slate-300">{event.registered}</td>
                  <td
                    className={`px-4 py-3 font-semibold ${attendanceRateClass(event.attendance_rate_pct)}`}
                  >
                    {event.attendance_rate_pct != null ? `${event.attendance_rate_pct}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 5 — Cold Members */}
      <section className="mb-10">
        <div className="rounded-lg border-2 border-amber-700/60 bg-amber-950/20 p-6">
          <SectionHeader
            title="Members Going Cold — Consider Outreach"
            subtitle="Active ICP-adjacent members with strong scores but no engagement in 90+ days"
          />
          <div className="overflow-hidden rounded-lg border border-amber-900/40">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">ICP Bucket</th>
                  <th className="px-4 py-3">Last Engaged</th>
                  <th className="px-4 py-3">Score</th>
                </tr>
              </thead>
              <tbody>
                {coldMembers.length === 0 ? (
                  <tr className="border-t border-slate-800">
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                      No cold members matching criteria
                    </td>
                  </tr>
                ) : (
                  coldMembers.map((member, idx) => (
                    <tr
                      key={`${member.email}-${idx}`}
                      className={`border-t border-slate-800 ${
                        idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-100">
                        {member.first_name} {member.last_name}
                      </td>
                      <td className="px-4 py-3">
                        <BucketBadge bucket={member.bucket} />
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {formatDate(member.last_engagement_date)}
                      </td>
                      <td className={`px-4 py-3 font-semibold ${scoreTextClass(member.engagement_score)}`}>
                        {member.engagement_score}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Section 6 — Link Clickers */}
      <section>
        <SectionHeader
          title="Top Link Clickers"
          subtitle="Warmest newsletter leads by lifetime link clicks (latest snapshot)"
        />
        <div className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">ICP Bucket</th>
                <th className="px-4 py-3">Links Clicked</th>
                <th className="px-4 py-3">Opens (6mo)</th>
                <th className="px-4 py-3">Received (6mo)</th>
                <th className="px-4 py-3">Last Clicked</th>
                <th className="px-4 py-3">Score</th>
              </tr>
            </thead>
            <tbody>
              {topClickers.length === 0 ? (
                <tr className="border-t border-slate-800">
                  <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                    No link clickers found
                  </td>
                </tr>
              ) : (
                topClickers.map((member, idx) => (
                  <tr
                    key={`${member.email}-${idx}`}
                    className={`border-t border-slate-800 ${
                      idx % 2 === 0 ? 'bg-slate-900/40' : 'bg-slate-900/20'
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-slate-100">
                      {member.first_name} {member.last_name}
                    </td>
                    <td className="px-4 py-3">
                      <BucketBadge bucket={member.bucket} />
                    </td>
                    <td className="px-4 py-3 font-semibold text-sky-400">{member.links_clicked}</td>
                    <td className="px-4 py-3 text-slate-300">{member.emails_opened_6mo ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{member.emails_received_6mo ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(member.last_clicked_at)}</td>
                    <td className={`px-4 py-3 font-semibold ${scoreTextClass(member.engagement_score)}`}>
                      {member.engagement_score ?? '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
