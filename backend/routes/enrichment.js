const express = require('express');
const axios = require('axios');
const router = express.Router({ mergeParams: true });
const supabase = require('../supabaseClient');

const FULLENRICH_BULK_URL = 'https://app.fullenrich.com/api/v2/contact/enrich/bulk';

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com',
  'aol.com', 'live.com', 'proton.me', 'protonmail.com', 'me.com',
]);

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function normalizeLinkedInUrl(url) {
  if (!hasValue(url)) return null;
  const trimmed = String(url).trim();
  return trimmed.includes('linkedin.com/in/') ? trimmed : null;
}

function domainFromEmail(email) {
  if (!hasValue(email)) return null;
  const domain = String(email).split('@')[1]?.trim().toLowerCase();
  if (!domain || PERSONAL_EMAIL_DOMAINS.has(domain)) return null;
  return domain;
}

function firstProfile(memberProfile) {
  if (!memberProfile) return null;
  return Array.isArray(memberProfile) ? memberProfile[0] : memberProfile;
}

async function logEnrichmentRun(memberId, runType, status, fieldsUpdated, fieldsSkipped) {
  const { error } = await supabase
    .from('enrichment_runs')
    .insert({
      member_id: memberId,
      run_type: runType,
      status,
      fields_updated: fieldsUpdated,
      fields_skipped: fieldsSkipped,
    });

  if (error) {
    console.error('Failed to log enrichment run:', error.message);
  }
}

router.post('/', async (req, res) => {
  const { id } = req.params;
  const run_type = req.body.run_type || 'manual';

  if (!process.env.FULLENRICH_API_KEY) {
    return res.status(500).json({ error: 'FULLENRICH_API_KEY is not configured' });
  }

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select(
      'id, email, linkedin_url, first_name, last_name, member_profile(company_id, companies(name, domain))',
    )
    .eq('id', id)
    .single();

  if (memberError || !member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  if (!hasValue(member.first_name) || !hasValue(member.last_name)) {
    return res.status(422).json({
      error: 'Member must have first_name and last_name for enrichment',
    });
  }

  const linkedinUrl = normalizeLinkedInUrl(member.linkedin_url);
  const profile = firstProfile(member.member_profile);
  const company = profile?.companies ?? null;
  const companyDomain = hasValue(company?.domain) ? String(company.domain).trim() : null;
  const companyName = hasValue(company?.name) ? String(company.name).trim() : null;
  const emailDomain = domainFromEmail(member.email);
  const domain = companyDomain || emailDomain;

  // FullEnrich requires either linkedin_url OR (name + company domain/name).
  if (!linkedinUrl && !domain && !companyName) {
    return res.status(422).json({
      error:
        'FullEnrich needs a LinkedIn URL or a company domain/name. Add LinkedIn or link a company, then try again.',
    });
  }

  const contactData = {
    first_name: member.first_name,
    last_name: member.last_name,
    enrich_fields: ['contact.work_emails', 'contact.phones'],
    // FullEnrich requires custom values to be strings.
    custom: { member_id: String(id) },
  };

  if (linkedinUrl) contactData.linkedin_url = linkedinUrl;
  if (hasValue(member.email)) contactData.email = String(member.email).trim();
  if (domain) contactData.domain = domain;
  if (companyName) contactData.company_name = companyName;

  const enrichPayload = {
    name: `${member.first_name} ${member.last_name}`,
    data: [contactData],
  };

  let enrichmentResponse;

  try {
    enrichmentResponse = await axios.post(
      FULLENRICH_BULK_URL,
      enrichPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.FULLENRICH_API_KEY}`,
        },
        timeout: 15000,
      },
    );
  } catch (error) {
    await logEnrichmentRun(id, run_type, 'failed', {}, {});
    const providerMessage =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;
    console.error('FullEnrich API call failed:', error.response?.data || error.message);
    return res.status(502).json({
      error: 'FullEnrich request failed',
      details: providerMessage,
    });
  }

  const enrichmentId = enrichmentResponse.data?.enrichment_id;

  await logEnrichmentRun(id, run_type, 'partial', { enrichment_id: enrichmentId }, {});

  await supabase
    .from('members')
    .update({
      enriched_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
    })
    .eq('id', id);

  return res.json({
    status: 'pending',
    member_id: id,
    enrichment_id: enrichmentId,
    message: 'Enrichment started — results will be available shortly',
  });
});

module.exports = router;
