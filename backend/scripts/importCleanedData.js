// scripts/importCleanedData.js
//
// One-time migration script: reads the "Member Data (Cleaned)" table and writes
// into members, member_profile, companies, and employment_history.
//
// Run from the backend/ folder with: node scripts/importCleanedData.js

const supabase = require('../supabaseClient');

const SOURCE_TABLE = 'Member Data (Cleaned)';

// Optional safety limit for testing: set IMPORT_LIMIT=5 to only process the first 5 rows.
// Leave unset (or run without it) to process everything.
const IMPORT_LIMIT = process.env.IMPORT_LIMIT ? parseInt(process.env.IMPORT_LIMIT, 10) : null;

// ---- Helpers -----------------------------------------------------------

const clean = (v) => {
  if (v === undefined || v === null) return null;
  const trimmed = String(v).trim();
  return trimmed === '' ? null : trimmed;
};

const toInt = (v) => {
  const c = clean(v);
  if (c === null) return null;
  const n = parseInt(c, 10);
  return isNaN(n) ? null : n;
};

const toDate = (v) => {
  const c = clean(v);
  if (c === null) return null;
  const d = new Date(c);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); // date only, matches `date` columns
};

const toArray = (v) => {
  if (v === undefined || v === null) return null;
  if (Array.isArray(v)) return v.length ? v : null;
  return null;
};

const PERSONAL_EMAIL_DOMAINS = [
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'live.com', 'proton.me', 'protonmail.com', 'me.com',
];

// Splits a field that may contain multiple emails separated by "/" (or similar),
// picks a personal-domain address as the primary, and returns the rest as extras.
function splitEmails(raw) {
  const c = clean(raw);
  if (!c) return { primary: null, extras: [] };

  const candidates = c
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.includes('@'));

  if (candidates.length === 0) return { primary: null, extras: [] };
  if (candidates.length === 1) return { primary: candidates[0], extras: [] };

  const personalIndex = candidates.findIndex((email) => {
    const domain = email.split('@')[1]?.toLowerCase();
    return domain && PERSONAL_EMAIL_DOMAINS.includes(domain);
  });

  const primaryIndex = personalIndex !== -1 ? personalIndex : 0;
  const primary = candidates[primaryIndex];
  const extras = candidates.filter((_, i) => i !== primaryIndex);
  return { primary, extras };
}

// ---- Per-row steps ------------------------------------------------------

async function findOrCreateCompany(row) {
  const name = clean(row['Current Company Name']);
  const domain = clean(row['Current_company Domain']);
  if (!name && !domain) return null;

  // Prefer matching on domain (more reliable/unique than name), fall back to name
  let existing = null;
  if (domain) {
    const { data } = await supabase.from('companies').select('id').eq('domain', domain).maybeSingle();
    existing = data;
  }
  if (!existing && name) {
    const { data } = await supabase.from('companies').select('id').ilike('name', name).maybeSingle();
    existing = data;
  }
  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from('companies')
    .insert({
      name,
      linkedin_url: clean(row['Current Company Linkedin']),
      domain,
      size: row['Team Size'] !== undefined && row['Team Size'] !== null ? String(row['Team Size']) : null,
      industry: clean(row['Industry']),
      sub_industry: clean(row['Sub Industry']),
      overview: clean(row['Overview (Current Company)']),
      company_type: clean(row['Type']),
      revenue: clean(row['Formatted Revenue']),
      tags: clean(row['Company Tags (2)']),
    })
    .select('id')
    .single();
  if (error) throw new Error(`Company insert failed for "${name}": ${error.message}`);
  return created.id;
}

async function upsertMember(row) {
  const { primary: splitEmail, extras } = splitEmails(row['Email Address']);
  const email = splitEmail || clean(row['Work Email (enriched)']);
  if (!email) return null; // no usable identifier — caller will count this as skipped

  const memberFields = {
    first_name: clean(row['First Name']),
    last_name: clean(row['Last Name']),
    email,
    phone: clean(row['Phone Number']),
    linkedin_url: clean(row['Linkedin']),
  };

  const { data: existing } = await supabase.from('members').select('id').eq('email', email).maybeSingle();

  if (existing) {
    const { error } = await supabase.from('members').update(memberFields).eq('id', existing.id);
    if (error) throw new Error(`Member update failed for ${email}: ${error.message}`);
    return { id: existing.id, created: false, extraEmails: extras };
  }

  const { data: created, error } = await supabase.from('members').insert(memberFields).select('id').single();
  if (error) throw new Error(`Member insert failed for ${email}: ${error.message}`);
  return { id: created.id, created: true, extraEmails: extras };
}

async function upsertMemberProfile(memberId, companyId, row, extraEmails) {
  const profileFields = {
    member_id: memberId,
    company_id: companyId,
    icp: clean(row['ICP']),
    work_email_enriched: clean(row['Work Email (enriched)']),
    additional_emails: extraEmails && extraEmails.length ? extraEmails : null,
    country: clean(row['Country']),
    state_region: clean(row['state_region']),
    city: clean(row['City']),
    zip_code: clean(row['Postal Code']),
    seniority_level: clean(row['Seniority Level seniority']),
    bucket: clean(row['bucket']),
    fit_score: toInt(row['fit_score']),
    tagged_manually: row['tagged_manually'] ?? null,
    tagged_at: row['tagged_at'] ?? null,
    tagged_by: row['tagged_by'] ?? null,
    tag_note: clean(row['tag_note']),
    event_interest: clean(row['What is one thing you want to get out of this event?']),
    dietary_restrictions: clean(row['Dietary Restrictions']),
    teams_you_oversee: toArray(row['teams_on']),
    regions: toArray(row['regions']),
    management_layers: clean(row['Management Layers']),
    address: clean(row['Address']),
  };

  const { data: existing } = await supabase
    .from('member_profile')
    .select('id')
    .eq('member_id', memberId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase.from('member_profile').update(profileFields).eq('id', existing.id);
    if (error) throw new Error(`Profile update failed for member ${memberId}: ${error.message}`);
  } else {
    const { error } = await supabase.from('member_profile').insert(profileFields);
    if (error) throw new Error(`Profile insert failed for member ${memberId}: ${error.message}`);
  }
}

async function insertEmploymentIfMissing(memberId, company, role, startDate, isCurrent) {
  if (!company) return false; // company is required (NOT NULL) — nothing to record without it

  const { data: existing } = await supabase
    .from('employment_history')
    .select('id')
    .eq('member_id', memberId)
    .eq('company', company)
    .eq('role', role)
    .eq('is_current', isCurrent)
    .maybeSingle();
  if (existing) return false; // already recorded, don't duplicate

  const { error } = await supabase.from('employment_history').insert({
    member_id: memberId,
    company,
    role,
    start_date: startDate,
    is_current: isCurrent,
    source: 'Import',
  });
  if (error) throw new Error(`Employment history insert failed for member ${memberId}: ${error.message}`);
  return true;
}

// ---- Main ---------------------------------------------------------------

async function run() {
  console.log(`Fetching rows from "${SOURCE_TABLE}"...`);
  let query = supabase.from(SOURCE_TABLE).select('*');
  if (IMPORT_LIMIT) {
    console.log(`⚠️  TEST MODE: limited to first ${IMPORT_LIMIT} rows (set via IMPORT_LIMIT).`);
    query = query.limit(IMPORT_LIMIT);
  }
  const { data: rows, error } = await query;
  if (error) throw new Error(`Failed to fetch source table: ${error.message}`);
  console.log(`Fetched ${rows.length} rows.`);

  const summary = {
    membersCreated: 0,
    membersUpdated: 0,
    companiesTouched: 0,
    employmentRowsCreated: 0,
    skippedNoEmail: 0,
    errors: [],
  };

  for (const [i, row] of rows.entries()) {
    try {
      const companyId = await findOrCreateCompany(row);
      if (companyId) summary.companiesTouched++;

      const memberResult = await upsertMember(row);
      if (!memberResult) {
        summary.skippedNoEmail++;
        continue;
      }
      const { id: memberId, created, extraEmails } = memberResult;
      created ? summary.membersCreated++ : summary.membersUpdated++;

      await upsertMemberProfile(memberId, companyId, row, extraEmails);

      // Current role
      const currentCompany = clean(row['Current Company Name']);
      const currentRole = clean(row['Current Role']);
      const currentStart = toDate(row['Current Job Start Date']);
      if (await insertEmploymentIfMissing(memberId, currentCompany, currentRole, currentStart, true)) {
        summary.employmentRowsCreated++;
      }

      // Previous roles (1–3)
      for (const n of [1, 2, 3]) {
        const prevCompany = clean(row[`Prev Company_${n}`]);
        const prevRole = clean(row[`Prev Role_${n}`]);
        if (await insertEmploymentIfMissing(memberId, prevCompany, prevRole, null, false)) {
          summary.employmentRowsCreated++;
        }
      }

      if ((i + 1) % 50 === 0) console.log(`Processed ${i + 1}/${rows.length}...`);
    } catch (err) {
      summary.errors.push({ row: i, email: row['Email Address'], message: err.message });
    }
  }

  console.log('\n--- Import summary ---');
  console.log(`Members created:        ${summary.membersCreated}`);
  console.log(`Members updated:        ${summary.membersUpdated}`);
  console.log(`Companies touched:      ${summary.companiesTouched}`);
  console.log(`Employment rows added:  ${summary.employmentRowsCreated}`);
  console.log(`Skipped (no email):     ${summary.skippedNoEmail}`);
  console.log(`Errors:                 ${summary.errors.length}`);
  if (summary.errors.length > 0) {
    console.log('\nFirst 10 errors:');
    summary.errors.slice(0, 10).forEach((e) => console.log(`  Row ${e.row} (${e.email}): ${e.message}`));
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