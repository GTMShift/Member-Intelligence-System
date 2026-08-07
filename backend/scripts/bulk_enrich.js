/**
 * bulk_enrich.js
 * Enriches all active members via FullEnrich.
 * Only writes fields that are currently empty — never overwrites existing data.
 *
 * Usage:
 *   cd backend
 *   node scripts/bulk_enrich.js
 */

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

const FULLENRICH_API_KEY = process.env.FULLENRICH_API_KEY;
const FULLENRICH_BULK_URL = 'https://app.fullenrich.com/api/v2/contact/enrich/bulk';
const FULLENRICH_STATUS_URL = 'https://app.fullenrich.com/api/v1/contact/enrich/bulk';

const DELAY_MS = 500;        // between enrichment requests
const POLL_INTERVAL_MS = 5000; // how often to poll for results
const MAX_POLL_ATTEMPTS = 24;  // max 2 minutes per member

// ============================================================================
// Seniority inference from job title
// ============================================================================
function inferSeniority(title) {
  if (!title) return null;
  const t = title.toLowerCase();

  if (t.includes('chief') || t.includes('cro') || t.includes('ceo') || t.includes('coo') ||
      t.includes('cto') || t.includes('cmo') || t.includes('president') ||
      t.includes('global vp') || t.includes('svp') || t.includes('senior vice president') ||
      t.includes('evp') || t.includes('executive vice president')) {
    return 'Global VP/SVP';
  }
  if (t.includes('vice president') || t.includes(' vp ') || t.startsWith('vp ') || t.endsWith(' vp')) {
    return 'VP';
  }
  if (t.includes('senior director')) {
    return 'Senior Director';
  }
  if (t.includes('director')) {
    return 'Director';
  }
  if (t.includes('senior manager')) {
    return 'Senior Manager';
  }
  if (t.includes('manager')) {
    return 'Manager';
  }
  return 'Individual Contributor';
}

// ============================================================================
// Parse location string into city / state_region
// ============================================================================
function parseLocation(location) {
  if (!location) return { city: null, state_region: null };
  const parts = location.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0], state_region: parts.slice(1, -1).join(', ') || parts[1] };
  }
  return { city: parts[0] || null, state_region: null };
}

// ============================================================================
// Find or create company, return company_id
// ============================================================================
async function findOrCreateCompany(companyData) {
  const name = companyData.name?.trim();
  if (!name) return null;

  const { data: existing } = await supabase
    .from('companies')
    .select('id, linkedin_url, domain, industry, size, overview')
    .ilike('name', name)
    .limit(1);

  if (existing && existing.length > 0) {
    const co = existing[0];
    const updates = {};
    if (!co.linkedin_url && companyData.linkedin_url) updates.linkedin_url = companyData.linkedin_url;
    if (!co.domain && companyData.domain) updates.domain = companyData.domain;
    if (!co.industry && companyData.industry) updates.industry = companyData.industry;
    if (!co.size && companyData.headcount_range) updates.size = companyData.headcount_range;
    if (!co.overview && companyData.description) updates.overview = companyData.description;

    if (Object.keys(updates).length > 0) {
      await supabase.from('companies').update(updates).eq('id', co.id);
    }
    return co.id;
  }

  const { data: created, error } = await supabase
    .from('companies')
    .insert({
      name,
      linkedin_url: companyData.linkedin_url || null,
      domain: companyData.domain || null,
      industry: companyData.industry || null,
      size: companyData.headcount_range || null,
      overview: companyData.description || null,
    })
    .select('id')
    .single();

  if (error) {
    console.error(`    Failed to create company "${name}":`, error.message);
    return null;
  }
  return created.id;
}

// ============================================================================
// Apply enrichment results — only fill empty fields
// ============================================================================
async function applyEnrichment(memberId, contact, currentProfile, currentMember) {
  const position = contact?.profile?.position;
  const company = position?.company;
  const profileUpdates = {};
  const memberUpdates = {};
  const applied = [];
  const skipped = [];

  // Work email
  if (!currentProfile.work_email_enriched && contact?.most_probable_email) {
    profileUpdates.work_email_enriched = contact.most_probable_email;
    applied.push('work_email');
  } else if (contact?.most_probable_email) {
    skipped.push('work_email (already set)');
  }

  // Location
  if (!currentProfile.city && contact?.profile?.location) {
    const { city, state_region } = parseLocation(contact.profile.location);
    if (city) { profileUpdates.city = city; }
    if (state_region) { profileUpdates.state_region = state_region; }
    if (city || state_region) applied.push('location');
  } else if (contact?.profile?.location) {
    skipped.push('location (already set)');
  }

  // Seniority
  if (!currentProfile.seniority_level && position?.title) {
    const seniority = inferSeniority(position.title);
    if (seniority) {
      profileUpdates.seniority_level = seniority;
      applied.push(`seniority (${seniority})`);
    }
  } else if (position?.title) {
    skipped.push('seniority (already set)');
  }

  // Team size — only write to companies table, not member_profile (expects integer)
  // handled in findOrCreateCompany

  // Job start date
  if (!currentProfile.current_job_start_date && position?.start_at?.year) {
    const month = position.start_at.month || 1;
    const year = position.start_at.year;
    profileUpdates.current_job_start_date = `${year}-${String(month).padStart(2, '0')}-01`;
    applied.push('job_start_date');
  }

  // Company
  let companyId = currentProfile.company_id;
  if (!companyId && company?.name) {
    companyId = await findOrCreateCompany(company);
    if (companyId) {
      profileUpdates.company_id = companyId;
      applied.push(`company (${company.name})`);
    }
  } else if (company?.name) {
    skipped.push('company (already set)');
  }

  // Phone on members table
  if (!currentMember.phone && contact?.most_probable_phone) {
    memberUpdates.phone = contact.most_probable_phone;
    applied.push('phone');
  }

  // Write profile updates
  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('member_profile')
      .update(profileUpdates)
      .eq('member_id', memberId);
    if (error) throw new Error(`Profile update failed: ${error.message}`);
  }

  // Write employment history if we have job title
  if (position?.title && company?.name) {
    const { data: existingJob } = await supabase
      .from('employment_history')
      .select('id, role, company')
      .eq('member_id', memberId)
      .eq('is_current', true)
      .maybeSingle();

    if (!existingJob) {
      // No current job record — insert new one
      await supabase.from('employment_history').insert({
        member_id: memberId,
        company: company.name,
        role: position.title,
        is_current: true,
        source: 'Manual',
      });
      applied.push(`job_title (${position.title})`);
    } else if (!existingJob.role || !existingJob.company) {
      // Existing record has empty role or company — update it
      const updates = {};
      if (!existingJob.role) updates.role = position.title;
      if (!existingJob.company) updates.company = company.name;
      await supabase.from('employment_history').update(updates).eq('id', existingJob.id);
      applied.push(`job_title updated (${position.title})`);
    } else {
      applied.push('job_title (already set)');
    }
  }

  // Write member updates
  if (Object.keys(memberUpdates).length > 0) {
    memberUpdates.last_updated = new Date().toISOString();
    await supabase.from('members').update(memberUpdates).eq('id', memberId);
  }

  return { applied, skipped };
}

// ============================================================================
// Poll FullEnrich for results
// ============================================================================
async function pollForResults(enrichmentId) {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));

    const response = await axios.get(`${FULLENRICH_STATUS_URL}/${enrichmentId}`, {
      headers: { Authorization: `Bearer ${FULLENRICH_API_KEY}` },
      timeout: 15000,
    });

    if (response.data?.status === 'FINISHED') {
      return response.data?.datas?.[0]?.contact ?? null;
    }
  }
  return null;
}

// ============================================================================
// Log enrichment run
// ============================================================================
async function logRun(memberId, status, applied, skipped, errorMsg) {
  await supabase.from('enrichment_runs').insert({
    member_id: memberId,
    run_type: 'bulk',
    status,
    fields_updated: { fields: applied },
    fields_skipped: { fields: skipped },
    error_message: errorMsg || null,
  });
}

// ============================================================================
// Main
// ============================================================================
async function main() {
  if (!FULLENRICH_API_KEY) {
    console.error('FULLENRICH_API_KEY not set in .env');
    process.exit(1);
  }

  // Fetch all active members with their profiles
  const { data: members, error } = await supabase
    .from('members')
    .select(`
      id, first_name, last_name, email, linkedin_url, phone,
      member_profile ( company_id, work_email_enriched, city, state_region,
        seniority_level, team_size, current_job_start_date )
    `)
    .eq('subscription_status', 'active');

  if (error) {
    console.error('Failed to fetch members:', error.message);
    process.exit(1);
  }

  console.log(`\nStarting bulk enrichment for ${members.length} members...\n`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const profile = Array.isArray(m.member_profile) ? m.member_profile[0] : m.member_profile;
    const prefix = `[${i + 1}/${members.length}] ${m.first_name} ${m.last_name}`;

    if (!m.linkedin_url && !m.email) {
      console.log(`${prefix} — skipped (no linkedin or email)`);
      skipCount++;
      continue;
    }

    try {
      // Send to FullEnrich
    // Validate linkedin_url format before sending
      const linkedinUrl = m.linkedin_url && m.linkedin_url.includes('linkedin.com/in/') 
        ? m.linkedin_url 
        : null;

      const contactData = {
        first_name: m.first_name,
        last_name: m.last_name,
        enrich_fields: ['contact.work_emails', 'contact.phones'],
        custom: { member_id: m.id },
      };
      if (linkedinUrl) contactData.linkedin_url = linkedinUrl;
      if (m.email) contactData.email = m.email;

      const enrichRes = await axios.post(
        FULLENRICH_BULK_URL,
        { name: `${m.first_name} ${m.last_name}`, data: [contactData] },
        { headers: { Authorization: `Bearer ${FULLENRICH_API_KEY}` }, timeout: 15000 }
      ).catch(err => {
        console.error(`    FullEnrich error details:`, JSON.stringify(err.response?.data));
        throw err;
      });

      const enrichmentId = enrichRes.data?.enrichment_id;
      if (!enrichmentId) {
        console.log(`${prefix} — no enrichment_id returned`);
        errorCount++;
        continue;
      }

      // Poll for results
      const contact = await pollForResults(enrichmentId);
      if (!contact) {
        console.log(`${prefix} — timed out waiting for results`);
        await logRun(m.id, 'failed', [], [], 'Polling timed out');
        errorCount++;
        continue;
      }

      // Apply results
      const { applied, skipped } = await applyEnrichment(m.id, contact, profile || {}, m);
      await logRun(m.id, 'complete', applied, skipped, null);

      if (applied.length > 0) {
        console.log(`${prefix} — ✓ applied: ${applied.join(', ')}`);
        successCount++;
      } else {
        console.log(`${prefix} — all fields already set`);
        skipCount++;
      }

    } catch (err) {
      console.error(`${prefix} — error: ${err.message}`);
      await logRun(m.id, 'failed', [], [], err.message);
      errorCount++;
    }

    // Pause between requests
    await new Promise(resolve => setTimeout(resolve, DELAY_MS));
  }

  console.log(`\nDone.`);
  console.log(`  Enriched: ${successCount}`);
  console.log(`  Skipped:  ${skipCount}`);
  console.log(`  Errors:   ${errorCount}`);
}

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err.message);
  process.exit(1);
});

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});