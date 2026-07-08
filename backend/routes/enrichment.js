const express = require('express');
const axios = require('axios');
const router = express.Router({ mergeParams: true });
const supabase = require('../supabaseClient');

function bucketEmployeeCount(count) {
  const numericCount = Number(count);

  if (!Number.isFinite(numericCount) || numericCount < 1) {
    return null;
  }
  if (numericCount <= 10) return '1-10';
  if (numericCount <= 50) return '11-50';
  if (numericCount <= 200) return '51-200';
  if (numericCount <= 500) return '201-500';
  if (numericCount <= 1000) return '501-1000';
  return '1000+';
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

async function logEnrichmentRun(memberId, status, fieldsUpdated, fieldsSkipped) {
  const { error } = await supabase
    .from('enrichment_runs')
    .insert({
      member_id: memberId,
      run_type: 'FullEnrich',
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

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select('id, email, linkedin_url')
    .eq('id', id)
    .single();

  if (memberError || !member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  if (!member.email || !member.linkedin_url) {
    return res.status(422).json({ error: 'Member must have both email and linkedin_url for enrichment' });
  }

  const { data: profile } = await supabase
    .from('member_profile')
    .select()
    .eq('member_id', id)
    .single();

  let enrichmentResponse;

  try {
    enrichmentResponse = await axios.post(
      'https://api.fullenrich.com/v1/enrich',
      {
        linkedin_url: member.linkedin_url,
        email: member.email,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.FULLENRICH_API_KEY}`,
        },
      }
    );
  } catch (error) {
    await logEnrichmentRun(id, 'failed', [], []);
    console.error('FullEnrich API call failed:', error.response?.data || error.message);
    return res.status(502).json({ error: 'FullEnrich request failed' });
  }

  const person = enrichmentResponse.data?.person;

  if (!person) {
    await logEnrichmentRun(id, 'failed', [], []);
    return res.status(200).json({
      status: 'failed',
      fields_updated: [],
      fields_skipped: [],
      message: 'FullEnrich returned no person data',
    });
  }

  const currentProfile = profile || {};
  const fieldsUpdated = [];
  const fieldsSkipped = [];
  const profileUpdates = {};

  const profileFieldMappings = [
    ['seniority_level', person.seniority],
    ['city', person.city],
    ['state_region', person.state],
    ['country', person.country],
    ['work_email_enriched', person.work_email],
  ];

  for (const [column, value] of profileFieldMappings) {
    if (!hasValue(value)) {
      fieldsSkipped.push(column);
      continue;
    }

    if (hasValue(currentProfile[column])) {
      fieldsSkipped.push(column);
      continue;
    }

    profileUpdates[column] = value;
    fieldsUpdated.push(column);
  }

  let companyId = currentProfile.company_id || null;
  const organization = person.organization || {};

  if (organization.domain) {
    const companyPayload = {
      domain: organization.domain,
      name: organization.name || organization.company_name || organization.domain,
      linkedin_url: organization.linkedin_url || organization.linkedin || null,
      size: bucketEmployeeCount(organization.employee_count || organization.headcount),
      industry: organization.industry || null,
      sub_industry: organization.sub_industry || organization.industry_group || null,
      overview: organization.description || organization.summary || null,
      company_type: organization.type || null,
      revenue: organization.revenue || null,
      tags: Array.isArray(organization.tags) ? organization.tags.join(', ') : organization.tags || null,
      updated_at: new Date().toISOString(),
    };

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .upsert(companyPayload, { onConflict: 'domain' })
      .select('id')
      .single();

    if (companyError) {
      console.error('Company upsert failed:', companyError.message);
    } else if (!hasValue(currentProfile.company_id)) {
      companyId = company.id;
      profileUpdates.company_id = company.id;
      fieldsUpdated.push('company_id');
    } else {
      fieldsSkipped.push('company_id');
    }
  } else {
    fieldsSkipped.push('company_id');
  }

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileUpdateError } = await supabase
      .from('member_profile')
      .update({
        ...profileUpdates,
        updated_at: new Date().toISOString(),
      })
      .eq('member_id', id);

    if (profileUpdateError) {
      return res.status(500).json({ error: profileUpdateError.message });
    }
  }

  const { error: deleteEmploymentError } = await supabase
    .from('employment_history')
    .delete()
    .eq('member_id', id)
    .eq('source', 'FullEnrich');

  if (deleteEmploymentError) {
    return res.status(500).json({ error: deleteEmploymentError.message });
  }

  const employmentHistory = Array.isArray(person.employment_history) ? person.employment_history : [];

  if (employmentHistory.length > 0) {
    const employmentRows = employmentHistory.map((job) => ({
      member_id: id,
      company: job.company || job.organization_name || organization.name || 'Unknown',
      role: job.title || job.role || 'Unknown',
      start_date: job.start_date || null,
      end_date: job.end_date || null,
      is_current: Boolean(job.is_current),
      source: 'FullEnrich',
    }));

    const { error: insertEmploymentError } = await supabase
      .from('employment_history')
      .insert(employmentRows);

    if (insertEmploymentError) {
      return res.status(500).json({ error: insertEmploymentError.message });
    }
  }

  const { error: memberUpdateError } = await supabase
    .from('members')
    .update({ enriched_at: new Date().toISOString() })
    .eq('id', id);

  if (memberUpdateError) {
    return res.status(500).json({ error: memberUpdateError.message });
  }

  await logEnrichmentRun(id, 'success', fieldsUpdated, fieldsSkipped);

  res.json({
    status: 'success',
    member_id: id,
    company_id: companyId,
    fields_updated: fieldsUpdated,
    fields_skipped: fieldsSkipped,
    employment_history_count: employmentHistory.length,
    enrichment_result: enrichmentResponse.data,
  });
});

module.exports = router;
