// scripts/fixTags.js
//
// One-time correction: the "Tags" column from the cleaned data was never
// mapped anywhere during the original import — it was silently dropped.
// This script backfills it into the new member_profile.tags array column,
// splitting on commas since some rows have multiple values (e.g.
// "Substack, OTR-SC-2026").
//
// Run from the backend/ folder with: node scripts/fixTags.js

const supabase = require('../supabaseClient');

const SOURCE_TABLE = 'Member Data (Cleaned)';

const clean = (v) => {
  if (v === undefined || v === null) return null;
  const trimmed = String(v).trim();
  return trimmed === '' ? null : trimmed;
};

// Same email-splitting logic as the original import, so matching stays consistent
const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'live.com', 'proton.me', 'protonmail.com', 'me.com',
];

function splitEmails(raw) {
  const c = clean(raw);
  if (!c) return { primary: null };
  const candidates = c.split('/').map((s) => s.trim()).filter((s) => s.includes('@'));
  if (candidates.length === 0) return { primary: null };
  if (candidates.length === 1) return { primary: candidates[0] };
  const personalIndex = candidates.findIndex((email) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return domain && PERSONAL_EMAIL_DOMAINS.includes(domain);
  });
  return { primary: candidates[personalIndex !== -1 ? personalIndex : 0] };
}

function parseTags(raw) {
  const c = clean(raw);
  if (!c) return null;
  const tags = c.split(',').map((t) => t.trim()).filter(Boolean);
  return tags.length > 0 ? tags : null;
}

async function run() {
  console.log(`Fetching rows from "${SOURCE_TABLE}"...`);
  const { data: rows, error } = await supabase.from(SOURCE_TABLE).select('*');
  if (error) throw new Error(`Failed to fetch source table: ${error.message}`);
  console.log(`Fetched ${rows.length} rows.`);

  let updated = 0;
  let skippedNoEmail = 0;
  let skippedNoMember = 0;
  let skippedNoValue = 0;
  const errors = [];

  for (const [i, row] of rows.entries()) {
    const { primary: email } = splitEmails(row['Email Address']);
    if (!email) {
      skippedNoEmail++;
      continue;
    }

    const tags = parseTags(row['Tags']);
    if (!tags) {
      skippedNoValue++;
      continue;
    }

    try {
      const { data: member, error: memberErr } = await supabase
        .from('members')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      if (memberErr) throw new Error(memberErr.message);
      if (!member) {
        skippedNoMember++;
        continue;
      }

      const { error: updateErr } = await supabase
        .from('member_profile')
        .update({ tags })
        .eq('member_id', member.id);
      if (updateErr) throw new Error(updateErr.message);

      updated++;
      if (updated % 50 === 0) console.log(`Updated ${updated} so far...`);
    } catch (err) {
      errors.push({ row: i, email, message: err.message });
    }
  }

  console.log('\n--- tags backfill summary ---');
  console.log(`Updated:              ${updated}`);
  console.log(`Skipped (no email):   ${skippedNoEmail}`);
  console.log(`Skipped (no member):  ${skippedNoMember}`);
  console.log(`Skipped (no value):   ${skippedNoValue}`);
  console.log(`Errors:               ${errors.length}`);
  if (errors.length > 0) {
    errors.slice(0, 10).forEach((e) => console.log(`  Row ${e.row} (${e.email}): ${e.message}`));
  }
}

run()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });