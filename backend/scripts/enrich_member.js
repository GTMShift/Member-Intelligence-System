/**
 * enrich_member.js
 * Enriches a single member via FullEnrich and writes results to Supabase.
 * Only fills empty fields — never overwrites existing data.
 *
 * Usage:
 *   cd backend
 *   node scripts/enrich_member.js <member_uuid>
 *
 * Example:
 *   node scripts/enrich_member.js 3a9ac6b8-dd1b-4897-89e9-be4706ebc714
 */

require('dotenv').config();
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FULLENRICH_API_KEY = process.env.FULLENRICH_API_KEY;
const FULLENRICH_BULK_URL = 'https://app.fullenrich.com/api/v2/contact/enrich/bulk';
const FULLENRICH_STATUS_URL = 'https://app.fullenrich.com/api/v1/contact/enrich/bulk';
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 24;

function inferSeniority(title) {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes('chief') || t.includes('cro') || t.includes('ceo') || t.includes('coo') ||
      t.includes('cto') || t.includes('cmo') || t.includes('president') ||
      t.includes('global vp') || t.includes('svp') || t.includes('senior vice president') ||
      t.includes('evp') || t.includes('executive vice president')) return 'Global VP/SVP';
  if (t.includes('vice president') || t.includes(' vp ') || t.startsWith('vp ') || t.endsWith(' vp')) return 'VP';
  if (t.includes('senior director')) return 'Senior Director';
  if (t.includes('director')) return 'Director';
  if (t.includes('senior manager')) return 'Senior Manager';
  if (t.includes('manager')) return 'Manager';
  return 'Individual Contributor';
}

function parseLocation(location) {
  if (!location) return { city: null, state_region: null };
  const parts = location.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) return { city: parts[0], state_region: parts.slice(1, -1).join(', ') || parts[1] };
  return { city: parts[0] || null, state_region: null };
}

async function findOrCreateCompany(companyData) {
  const name = companyData.name?.trim();
  if (!name) return null;
  const { data: existing } = await supabase.from('companies').select('id, linkedin_url, domain, industry, size, overview').ilike('name', name).limit(1);
  if (existing && existing.length > 0) {
    const co = existing[0];
    const updates = {};
    if (!co.linkedin_url && companyData.linkedin_url) updates.linkedin_url = companyData.linkedin_url;
    if (!co.domain && companyData.domain) updates.domain = companyData.domain;
    if (!co.industry && companyData.industry) updates.industry = companyData.industry;
    if (!co.size && companyData.headcount_range) updates.size = companyData.headcount_range;
    if (!co.overview && companyData.description) updates.overview = companyData.description;
    if (Object.keys(updates).length > 0) await supabase.from('companies').update(updates).eq('id', co.id);
    return co.id;
  }
  const { data: created, error } = await supabase.from('companies').insert({
    name,
    linkedin_url: companyData.linkedin_url || null,
    domain: companyData.domain || null,
    industry: companyData.industry || null,
    size: companyData.headcount_range || null,
    overview: companyData.description || null,
  }).select('id').single();
  if (error) { console.error(`Failed to create company "${name}":`, error.message); return null; }
  return created.id;
}

async function main() {
  const memberId = process.argv[2];
  if (!memberId) {
    console.error('Usage: node scripts/enrich_member.js <member_uuid>');
    process.exit(1);
  }

  // Fetch member
  const { data: m, error: memberErr } = await supabase
    .from('members')
    .select('id, first_name, last_name, email, linkedin_url, phone, member_profile ( company_id, work_email_enriched, city, state_region, seniority_level, current_job_start_date )')
    .eq('id', memberId)
    .single();

  if (memberErr || !m) {
    console.error('Member not found:', memberId);
    process.exit(1);
  }

  const profile = Array.isArray(m.member_profile) ? m.member_profile[0] : m.member_profile;
  console.log(`\nEnriching: ${m.first_name} ${m.last_name}`);

  const linkedinUrl = m.linkedin_url && m.linkedin_url.includes('linkedin.com/in/') ? m.linkedin_url : null;

  if (!linkedinUrl && !m.email) {
    console.log('Skipped — no valid LinkedIn URL or email.');
    process.exit(0);
  }

  // Send to FullEnrich
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
  );

  const enrichmentId = enrichRes.data?.enrichment_id;
  if (!enrichmentId) { console.error('No enrichment_id returned.'); process.exit(1); }
  console.log(`Enrichment started: ${enrichmentId}`);
  console.log('Polling for results...');

  // Poll for results
  let contact = null;
  for (let i = 0; i < MAX_POLL_ATTEMPTS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await axios.get(`${FULLENRICH_STATUS_URL}/${enrichmentId}`, {
      headers: { Authorization: `Bearer ${FULLENRICH_API_KEY}` }, timeout: 15000
    });
    if (res.data?.status === 'FINISHED') {
      contact = res.data?.datas?.[0]?.contact ?? null;
      break;
    }
    process.stdout.write('.');
  }
  console.log('');

  if (!contact) { console.error('Timed out waiting for results.'); process.exit(1); }

  const position = contact?.profile?.position;
  const company = position?.company;
  const profileUpdates = {};
  const memberUpdates = {};
  const applied = [];

  if (!profile?.work_email_enriched && contact?.most_probable_email) {
    profileUpdates.work_email_enriched = contact.most_probable_email;
    applied.push('work_email');
  }
  if (!profile?.city && contact?.profile?.location) {
    const { city, state_region } = parseLocation(contact.profile.location);
    if (city) profileUpdates.city = city;
    if (state_region) profileUpdates.state_region = state_region;
    if (city || state_region) applied.push('location');
  }
  if (!profile?.seniority_level && position?.title) {
    const seniority = inferSeniority(position.title);
    if (seniority) { profileUpdates.seniority_level = seniority; applied.push(`seniority (${seniority})`); }
  }
  if (!profile?.current_job_start_date && position?.start_at?.year) {
    const month = position.start_at.month || 1;
    profileUpdates.current_job_start_date = `${position.start_at.year}-${String(month).padStart(2, '0')}-01`;
    applied.push('job_start_date');
  }
  if (!profile?.company_id && company?.name) {
    const companyId = await findOrCreateCompany(company);
    if (companyId) { profileUpdates.company_id = companyId; applied.push(`company (${company.name})`); }
  }
  if (!m.phone && contact?.most_probable_phone) {
    memberUpdates.phone = contact.most_probable_phone;
    applied.push('phone');
  }

  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updated_at = new Date().toISOString();
    const { error } = await supabase.from('member_profile').update(profileUpdates).eq('member_id', memberId);
    if (error) throw new Error(`Profile update failed: ${error.message}`);
  }

  if (position?.title && company?.name) {
    const { data: existingJob } = await supabase.from('employment_history').select('id').eq('member_id', memberId).eq('is_current', true).maybeSingle();
    if (!existingJob) {
      await supabase.from('employment_history').insert({ member_id: memberId, company: company.name, role: position.title, is_current: true, source: 'FullEnrich' });
      applied.push(`job_title (${position.title})`);
    }
  }

  if (Object.keys(memberUpdates).length > 0) {
    await supabase.from('members').update({ ...memberUpdates, last_updated: new Date().toISOString() }).eq('id', memberId);
  }

  if (applied.length > 0) {
    console.log(`✓ Applied: ${applied.join(', ')}`);
  } else {
    console.log('All fields already set — nothing to update.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});