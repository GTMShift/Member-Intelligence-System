const express = require('express');
const { buildDuplicateCandidates } = require('../utils/duplicateDetection');
const { createAuthMiddleware } = require('../middleware/auth');

const LINKED_TABLES = [
  ['member_profile', 'member_id'],
  ['employment_history', 'member_id'],
  ['member_data', 'member_id'],
  ['interactions', 'member_id'],
  ['member_socials', 'member_id'],
  ['event_signups', 'member_id'],
  ['newsletter_engagement', 'member_id'],
  ['enrichment_runs', 'member_id'],
  ['profiles', 'member_id'],
  ['substack_subscribers', 'member_id'],
  ['substack_engagement_snapshots', 'member_id'],
  ['join_us_applications', 'member_id'],
  ['otr_applications', 'member_id'],
  ['notifications', 'member_id'],
  ['duplicate_flags', 'existing_member_id'],
  ['members_history', 'id'],
  ['member_profile_history', 'member_id'],
  ['employment_history_log', 'member_id'],
];

function createDuplicateReviewRouter(client = require('../supabaseClient')) {
  const router = express.Router();
  const { requireAuth, requireRole } = createAuthMiddleware(client);
  router.use(requireAuth, requireRole(['admin']));

  async function fetchSnapshots(memberIds) {
    if (!memberIds.length) return {};
    const [memberResult, profileResult, employmentResult] = await Promise.all([
      client.from('members').select('id, first_name, last_name, email, linkedin_url, phone, created_at').in('id', memberIds),
      client.from('member_profile').select('member_id, job_title, seniority_level, company_id, city, state_region, country').in('member_id', memberIds),
      client.from('employment_history').select('id, member_id, company, role, start_date, end_date, is_current, source').in('member_id', memberIds).order('start_date', { ascending: false }),
    ]);
    if (memberResult.error || profileResult.error || employmentResult.error) throw new Error('Could not load member comparison data');

    const companyIds = [...new Set((profileResult.data ?? []).map((profile) => profile.company_id).filter(Boolean))];
    const companyResult = companyIds.length
      ? await client.from('companies').select('id, name').in('id', companyIds)
      : { data: [], error: null };
    if (companyResult.error) throw new Error('Could not load company comparison data');
    const companies = new Map((companyResult.data ?? []).map((company) => [company.id, company.name]));
    const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.member_id, {
      ...profile,
      company_name: companies.get(profile.company_id) ?? null,
    }]));
    const employment = new Map(memberIds.map((id) => [id, []]));
    for (const row of employmentResult.data ?? []) employment.get(row.member_id)?.push(row);

    const snapshots = Object.fromEntries((memberResult.data ?? []).map((member) => [member.id, {
      ...member,
      profile: profiles.get(member.id) ?? null,
      employment_history: employment.get(member.id) ?? [],
    }]));

    const linkedResults = await Promise.all(LINKED_TABLES.map(async ([table, column]) => {
      const { data, error } = await client.from(table).select(`id, ${column}`).in(column, memberIds);
      if (error) throw new Error('Could not map linked records for the comparison');
      return { table, column, rows: data ?? [] };
    }));
    for (const id of memberIds) snapshots[id].linked_records = {};
    for (const { table, column, rows } of linkedResults) {
      for (const row of rows) {
        const memberId = row[column];
        if (!snapshots[memberId]) continue;
        (snapshots[memberId].linked_records[table] ??= []).push(row.id);
      }
    }
    return snapshots;
  }

  router.get('/', async (req, res) => {
    const status = req.query.status ?? 'pending';
    if (!['pending', 'deferred', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid review status' });
    }
    try {
      const { data: pairs, error } = await client.from('duplicate_review_pairs')
        .select('*').eq('status', status).order('confidence', { ascending: false }).order('created_at', { ascending: false }).limit(100);
      if (error) throw error;
      const ids = [...new Set((pairs ?? []).flatMap((pair) => [pair.member_low_id, pair.member_high_id]))];
      const snapshots = await fetchSnapshots(ids);
      return res.json({ pairs: (pairs ?? []).map((pair) => ({
        ...pair,
        member_a: snapshots[pair.member_low_id] ?? null,
        member_b: snapshots[pair.member_high_id] ?? null,
      })) });
    } catch {
      return res.status(500).json({ error: 'Could not load the duplicate review queue' });
    }
  });

  router.post('/scan', async (req, res) => {
    try {
      const snapshots = await fetchSnapshotsForScan(client);
      const candidates = buildDuplicateCandidates(snapshots);
      if (!candidates.length) return res.json({ scanned: snapshots.length, proposed: 0 });

      // The database unique key prevents the same member pair from being re-flagged.
      const { data, error } = await client.from('duplicate_review_pairs').upsert(candidates, {
        onConflict: 'member_low_id,member_high_id',
        ignoreDuplicates: true,
      }).select('id');
      if (error) throw error;
      return res.json({ scanned: snapshots.length, candidates: candidates.length, added: data?.length ?? 0 });
    } catch {
      return res.status(500).json({ error: 'Could not scan member records for duplicates' });
    }
  });

  router.patch('/:id/status', async (req, res) => {
    const { status } = req.body ?? {};
    if (!['pending', 'deferred', 'dismissed'].includes(status)) {
      return res.status(400).json({ error: 'Status must be pending, deferred, or dismissed' });
    }
    try {
      const { data, error } = await client.from('duplicate_review_pairs')
        .update({
          status,
          reviewed_by: status === 'pending' ? null : req.user.id,
          reviewed_at: status === 'pending' ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.params.id).in('status', status === 'pending' ? ['deferred'] : ['pending', 'deferred'])
        .select('id, status').maybeSingle();
      if (error) throw error;
      if (!data) return res.status(409).json({ error: 'This pair is no longer pending review' });
      return res.json(data);
    } catch {
      return res.status(500).json({ error: 'Could not update this review' });
    }
  });

  router.post('/:id/merge', async (req, res) => {
    const { survivorId, fieldSources } = req.body ?? {};
    const allowedFields = new Set(['first_name', 'last_name', 'email', 'linkedin_url', 'phone', 'company_name', 'job_title', 'seniority_level', 'city', 'state_region', 'country']);
    const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value ?? '');
    if (!isUuid(req.params.id) || !isUuid(survivorId) || !fieldSources || typeof fieldSources !== 'object' || Array.isArray(fieldSources)
      || Object.keys(fieldSources).some((field) => !allowedFields.has(field) || !['a', 'b'].includes(fieldSources[field]))) {
      return res.status(400).json({ error: 'Choose a survivor profile and valid field sources' });
    }
    try {
      const { data, error } = await client.rpc('merge_duplicate_members', {
        p_pair_id: req.params.id,
        p_survivor_id: survivorId,
        p_field_sources: fieldSources,
        p_admin_id: req.user.id,
      });
      if (error) {
        if (error.code === 'P0002') return res.status(404).json({ error: 'This candidate no longer exists' });
        if (['P0001', '22023', '23505', '23503'].includes(error.code)) {
          return res.status(409).json({ error: error.code === '23505' || error.code === '23503'
            ? 'The merge conflicts with an existing linked record. Resolve that conflict and try again.'
            : (error.message?.startsWith('MERGE_BLOCKED: ') ? error.message.slice(15) : 'This pair cannot be merged in its current state.') });
        }
        throw error;
      }
      return res.json(data);
    } catch {
      return res.status(500).json({ error: 'Could not merge these profiles' });
    }
  });

  return router;
}

async function fetchSnapshotsForScan(client) {
  const { data: members, error } = await client.from('members')
    .select('id, first_name, last_name, email, linkedin_url, phone')
    .is('merged_into_member_id', null);
  if (error) throw error;
  const ids = (members ?? []).map((member) => member.id);
  if (!ids.length) return [];
  const [profileResult, employmentResult] = await Promise.all([
    client.from('member_profile').select('member_id, job_title, company_id').in('member_id', ids),
    client.from('employment_history').select('member_id, company, role, is_current').in('member_id', ids),
  ]);
  if (profileResult.error || employmentResult.error) throw new Error('Could not load duplicate signals');
  const companyIds = [...new Set((profileResult.data ?? []).map((profile) => profile.company_id).filter(Boolean))];
  const companyResult = companyIds.length
    ? await client.from('companies').select('id, name').in('id', companyIds)
    : { data: [], error: null };
  if (companyResult.error) throw new Error('Could not load duplicate signals');
  const companies = new Map((companyResult.data ?? []).map((company) => [company.id, company.name]));
  const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.member_id, {
    ...profile,
    company: { name: companies.get(profile.company_id) ?? null },
  }]));
  const histories = new Map(ids.map((id) => [id, []]));
  for (const row of employmentResult.data ?? []) histories.get(row.member_id)?.push(row);
  return (members ?? []).map((member) => ({
    ...member,
    profile: profiles.get(member.id) ?? null,
    employment_history: histories.get(member.id) ?? [],
  }));
}

const router = createDuplicateReviewRouter();
module.exports = router;
module.exports.createDuplicateReviewRouter = createDuplicateReviewRouter;
