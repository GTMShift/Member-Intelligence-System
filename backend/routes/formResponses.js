const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { isValidEmail } = require('../utils/validate');

// CREATE FORM RESPONSE
// Intended for external applications to submit raw signup form data,
// distinct from /members which writes directly into the members schema.
router.post('/', async (req, res) => {
  const {
    first_name,
    last_name,
    email_address,
    email,
    linkedin,
    linkedin_url,
    phone_number,
    phone,
    company,
    current_company,
    job_title,
    current_role,
  } = req.body;

  const resolvedEmail = email_address ?? email;
  const resolvedLinkedIn = linkedin ?? linkedin_url;
  const resolvedPhone = phone_number ?? phone;
  const resolvedCompany = company ?? current_company;
  const resolvedJobTitle = job_title ?? current_role;

  if (!first_name || !last_name || !resolvedEmail) {
    return res.status(400).json({
      error: 'Missing required fields: first_name, last_name, email (or email_address)',
    });
  }

  if (!isValidEmail(resolvedEmail)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  const { data: existingByEmail } = await supabase
    .from('form_responses')
    .select('id')
    .eq('email_address', resolvedEmail)
    .maybeSingle();

  if (existingByEmail) {
    return res.status(409).json({ error: 'A response with this email already exists' });
  }

  if (resolvedLinkedIn) {
    const { data: existingByLinkedIn } = await supabase
      .from('form_responses')
      .select('id')
      .eq('linkedin', resolvedLinkedIn)
      .maybeSingle();

    if (existingByLinkedIn) {
      return res.status(409).json({ error: 'A response with this LinkedIn URL already exists' });
    }
  }

  const { data: row, error: insertError } = await supabase
    .from('form_responses')
    .insert({
      first_name,
      last_name,
      email_address: resolvedEmail,
      linkedin: resolvedLinkedIn || null,
      phone_number: resolvedPhone || null,
      company: resolvedCompany || null,
      job_title: resolvedJobTitle || null,
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') {
      return res.status(409).json({
        error: 'A response with this email or LinkedIn URL already exists',
      });
    }
    return res.status(500).json({ error: insertError.message });
  }

  res.status(201).json({ success: true, id: row.id });
});

module.exports = router;
