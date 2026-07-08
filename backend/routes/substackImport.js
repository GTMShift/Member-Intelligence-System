// routes/substackImport.js
const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const router = express.Router();
const supabase = require('../supabaseClient');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Helpers to safely coerce CSV strings into numbers/dates, since blank cells are common
const toInt = (v) => (v === undefined || v === null || v === '' ? null : parseInt(v, 10) || null);
const toNum = (v) => (v === undefined || v === null || v === '' ? null : parseFloat(v) || null);
const toDate = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// For plain `date` columns (not timestamptz). Avoids the timezone-shift risk of
// toDate(): if the CSV value isn't already ISO-formatted, JS's Date constructor
// parses it as local time, and converting that to UTC via toISOString() can
// silently shift the calendar date by a day depending on timezone. This instead
// reads the date back using local getters (matching however it was parsed),
// so the stored date always matches what was in the source cell.
const toDateOnly = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const c = String(v).trim();
  if (c === '') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(c)) return c; // already unambiguous, use as-is
  const d = new Date(c);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// TODO: add an auth/admin check here once the project has one — right now this
// endpoint is open to anyone who can reach your backend, same as your other routes.
router.get('/import-runs', async (req, res) => {
  const { data, error } = await supabase
    .from('substack_import_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ error: 'Failed to fetch import runs', details: error.message });
  res.json(data);
});

// TODO: add an auth/admin check here once the project has one — right now this
// endpoint is open to anyone who can reach your backend, same as your other routes.
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No CSV file uploaded' });

  let rows;
  try {
    rows = parse(req.file.buffer.toString('utf-8'), { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse CSV', details: err.message });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'CSV appears to be empty' });

  const now = new Date().toISOString();

  // 1. Create the import run record first, so we have an id to attach engagement rows to
  const { data: importRun, error: importRunErr } = await supabase
    .from('substack_import_runs')
    .insert({ filename: req.file.originalname, imported_by: null, total_rows: rows.length })
    .select()
    .single();
  if (importRunErr) return res.status(500).json({ error: 'Failed to create import run', details: importRunErr.message });

  const parsedRows = rows
    .map((row) => ({
      email: row['Email']?.trim().toLowerCase(),
      name: row['Name'] || null,
      subscription_type: row['Type'] || row['Stripe plan'] || null,
      start_date: toDateOnly(row['Start date']),
      paid_upgrade_date: toDateOnly(row['Paid upgrade date']),
      cancel_date: toDateOnly(row['Cancel date']),
      expiration_date: toDateOnly(row['Expiration date']),
      country: row['Country'] || null,
      state_province: row['State/Province'] || null,
      raw_csv_row: row,
      engagement: {
        emails_received_6mo: toInt(row['Emails received (6mo)']),
        emails_dropped_6mo: toInt(row['Emails dropped (6mo)']),
        num_emails_opened: toInt(row['num_emails_opened']),
        emails_opened_6mo: toInt(row['Emails opened (6mo)']),
        emails_opened_7d: toInt(row['Emails opened (7d)']),
        emails_opened_30d: toInt(row['Emails opened (30d)']),
        last_email_open: toDate(row['Last email open']),
        links_clicked: toInt(row['Links clicked']),
        last_clicked_at: toDate(row['Last clicked at']),
        unique_emails_seen_6mo: toInt(row['Unique emails seen (6mo)']),
        unique_emails_seen_7d: toInt(row['Unique emails seen (7d)']),
        unique_emails_seen_30d: toInt(row['Unique emails seen (30d)']),
        post_views: toInt(row['Post views']),
        post_views_7d: toInt(row['Post views (7d)']),
        post_views_30d: toInt(row['Post views (30d)']),
        unique_posts_seen: toInt(row['Unique posts seen']),
        unique_posts_seen_7d: toInt(row['Unique posts seen (7d)']),
        unique_posts_seen_30d: toInt(row['Unique posts seen (30d)']),
        comments: toInt(row['Comments']),
        comments_7d: toInt(row['Comments (7d)']),
        comments_30d: toInt(row['Comments (30d)']),
        shares: toInt(row['Shares']),
        shares_7d: toInt(row['Shares (7d)']),
        shares_30d: toInt(row['Shares (30d)']),
        subscriptions_gifted: toInt(row['Subscriptions gifted']),
        revenue: toNum(row['Revenue']),
        days_active_30d: toInt(row['Days active (30d)']),
        activity: row['Activity'] || null,
      },
    }))
    .filter((r) => r.email);

  const incomingEmails = parsedRows.map((r) => r.email);

  // 2. Find which subscribers already exist
  const { data: existingRows, error: fetchErr } = await supabase
    .from('substack_subscribers')
    .select('id, email, status')
    .in('email', incomingEmails);
  if (fetchErr) return res.status(500).json({ error: 'Failed to query existing subscribers', details: fetchErr.message });

  const existingByEmail = new Map((existingRows || []).map((r) => [r.email, r]));
  const toInsert = [];
  let reactivatedCount = 0;

  for (const row of parsedRows) {
    const existing = existingByEmail.get(row.email);
    if (!existing) {
      toInsert.push({
        email: row.email,
        name: row.name,
        subscription_type: row.subscription_type,
        status: 'active',
        start_date: row.start_date,
        paid_upgrade_date: row.paid_upgrade_date,
        cancel_date: row.cancel_date,
        expiration_date: row.expiration_date,
        country: row.country,
        state_province: row.state_province,
        first_seen_at: now,
        last_seen_at: now,
        raw_csv_row: row.raw_csv_row,
      });
    } else if (existing.status === 'unsubscribed') {
      reactivatedCount++;
    }
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase.from('substack_subscribers').insert(toInsert);
    if (insertErr) return res.status(500).json({ error: 'Failed to insert new subscribers', details: insertErr.message });
  }

  // 3. Mark everyone in this import as active + update last_seen_at
  const { error: touchErr } = await supabase
    .from('substack_subscribers')
    .update({ last_seen_at: now, status: 'active', unsubscribed_at: null, updated_at: now })
    .in('email', incomingEmails);
  if (touchErr) return res.status(500).json({ error: 'Failed to update seen subscribers', details: touchErr.message });

  // 4. Anyone previously active but missing from this import = unsubscribed.
  // Compared in JS rather than a giant inline SQL "NOT IN" list, since that approach
  // silently failed once the subscriber list grew large enough.
  const incomingEmailSet = new Set(incomingEmails);
  const { data: allActive, error: activeErr } = await supabase
    .from('substack_subscribers')
    .select('id, email')
    .eq('status', 'active');
  if (activeErr) return res.status(500).json({ error: 'Failed to fetch active subscribers', details: activeErr.message });

  const missingIds = (allActive || [])
    .filter((s) => !incomingEmailSet.has(s.email))
    .map((s) => s.id);

  let unsubscribedCount = 0;
  if (missingIds.length > 0) {
    const { error: unsubErr } = await supabase
      .from('substack_subscribers')
      .update({ status: 'unsubscribed', unsubscribed_at: now })
      .in('id', missingIds);
    if (unsubErr) return res.status(500).json({ error: 'Failed to mark unsubscribed', details: unsubErr.message });
    unsubscribedCount = missingIds.length;
  }

  // 5. Match subscribers to existing members by normalized (trimmed, lowercased) email.
  // Only sets member_id where it's currently null, so this never overwrites a manual link.
  const { data: membersData, error: membersErr } = await supabase
    .from('members')
    .select('id, email');
  if (membersErr) return res.status(500).json({ error: 'Failed to fetch members for matching', details: membersErr.message });

  const memberIdByEmail = new Map(
    (membersData || [])
      .filter((m) => m.email)
      .map((m) => [m.email.trim().toLowerCase(), m.id])
  );

  let matchedCount = 0;
  for (const email of incomingEmails) {
    const memberId = memberIdByEmail.get(email); // subscriber emails are already normalized at parse time
    if (!memberId) continue;
    const { error: matchErr, count } = await supabase
      .from('substack_subscribers')
      .update({ member_id: memberId, updated_at: now }, { count: 'exact' })
      .eq('email', email)
      .is('member_id', null);
    if (!matchErr && count) matchedCount += count;
  }

  // 6. Fetch subscriber ids (including newly inserted ones, now with member_id linked where matched)
  const { data: allSubscribers, error: allSubsErr } = await supabase
    .from('substack_subscribers')
    .select('id, email, member_id')
    .in('email', incomingEmails);
  if (allSubsErr) return res.status(500).json({ error: 'Failed to fetch subscriber ids for engagement snapshot', details: allSubsErr.message });

  const subscriberByEmail = new Map(allSubscribers.map((s) => [s.email, s]));

  const engagementRows = parsedRows
    .map((row) => {
      const subscriber = subscriberByEmail.get(row.email);
      if (!subscriber) return null;
      return {
        subscriber_id: subscriber.id,
        member_id: subscriber.member_id || null,
        import_run_id: importRun.id,
        ...row.engagement,
        snapshot_at: now,
      };
    })
    .filter(Boolean);

  if (engagementRows.length > 0) {
    const { error: engagementErr } = await supabase.from('substack_engagement_snapshots').insert(engagementRows);
    if (engagementErr) return res.status(500).json({ error: 'Failed to insert engagement snapshot', details: engagementErr.message });
  }

  // 7. Update the import run with final counts
  await supabase
    .from('substack_import_runs')
    .update({
      total_rows: parsedRows.length,
      new_count: toInsert.length,
      reactivated_count: reactivatedCount,
      unsubscribed_count: unsubscribedCount,
    })
    .eq('id', importRun.id);

  res.json({
    import_run_id: importRun.id,
    total_rows: parsedRows.length,
    new: toInsert.length,
    reactivated: reactivatedCount,
    unsubscribed: unsubscribedCount,
    engagement_snapshots_created: engagementRows.length,
    matched_to_members: matchedCount,
  });
});

module.exports = router;