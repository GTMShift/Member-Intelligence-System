const express = require('express');
const axios = require('axios');
const router = express.Router({ mergeParams: true });
const supabase = require('../supabaseClient');

const FULLENRICH_BULK_URL = 'https://app.fullenrich.com/api/v2/contact/enrich/bulk';

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
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
    .select('id, email, linkedin_url, first_name, last_name')
    .eq('id', id)
    .single();

  if (memberError || !member) {
    return res.status(404).json({ error: 'Member not found' });
  }

  if (!hasValue(member.first_name) || !hasValue(member.last_name)) {
    return res.status(422).json({ error: 'Member must have first_name and last_name for enrichment' });
  }

  if (!hasValue(member.email) && !hasValue(member.linkedin_url)) {
    return res.status(422).json({ error: 'Member must have email or linkedin_url for enrichment' });
  }

  const contactData = {
    first_name: member.first_name,
    last_name: member.last_name,
    enrich_fields: ['contact.work_emails'],
    custom: { member_id: id },
  };

  if (hasValue(member.linkedin_url)) {
    contactData.linkedin_url = member.linkedin_url;
  }

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
      }
    );
  } catch (error) {
    await logEnrichmentRun(id, run_type, 'failed', {}, {});
    console.error('FullEnrich API call failed:', error.response?.data || error.message);
    return res.status(502).json({ error: 'FullEnrich request failed' });
  }

  const enrichmentId = enrichmentResponse.data?.enrichment_id;

  await logEnrichmentRun(id, run_type, 'partial', { enrichment_id: enrichmentId }, {});

  return res.json({
    status: 'pending',
    member_id: id,
    enrichment_id: enrichmentId,
    message: 'Enrichment started — results will be available shortly',
  });
});

module.exports = router;
