const express = require('express');
const router = express.Router();
const supabase = require('../supabaseClient');
const { isValidEmail, isValidDate, isValidLinkedIn } = require('../utils/validate');

// CREATE MEMBER
router.post('/', async (req, res) => {
  const {
    first_name,
    last_name,
    email,
    linkedin_url,
    phone,
    record_source,
    seniority_level,
    country,
    state_region,
    city,
    icp,
    company_id,
    signup_source,
    job_title,
    job_start_date
  } = req.body;

  // Required field validation
  if (!first_name || !last_name || !email || !linkedin_url) {
    return res.status(400).json({ error: 'first_name, last_name, email, and linkedin_url are required' });
  }

  // Format validation
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (!isValidLinkedIn(linkedin_url)) {
    return res.status(400).json({ error: 'Invalid LinkedIn URL format. Must start with https://linkedin.com/in/' });
  }

  if (job_start_date && !isValidDate(job_start_date)) {
    return res.status(400).json({ error: 'Invalid job_start_date format. Use YYYY-MM-DD' });
  }

  // Duplicate detection
  const { data: existingEmail } = await supabase
    .from('members')
    .select('id')
    .eq('email', email)
    .single();

  if (existingEmail) {
    return res.status(409).json({ error: 'A member with this email already exists' });
  }

  const { data: existingLinkedIn } = await supabase
    .from('members')
    .select('id')
    .eq('linkedin_url', linkedin_url)
    .single();

  if (existingLinkedIn) {
    return res.status(409).json({ error: 'A member with this LinkedIn URL already exists' });
  }

  // Step 1: Insert into members
  const { data: member, error: memberError } = await supabase
    .from('members')
    .insert({ first_name, last_name, email, linkedin_url, phone, record_source })
    .select()
    .single();

  if (memberError) return res.status(500).json({ error: memberError.message });

  // Step 2: Insert into member_profile
  const { error: profileError } = await supabase
    .from('member_profile')
    .insert({
      member_id: member.id,
      seniority_level,
      country,
      state_region,
      city,
      icp,
      company_id,
      signup_source
    });

  if (profileError) return res.status(500).json({ error: profileError.message });

  // Step 3: Insert into employment_history if job info provided
  if (job_title) {
    const { error: employmentError } = await supabase
      .from('employment_history')
      .insert({
        member_id: member.id,
        company: company_id || 'Unknown',
        role: job_title,
        start_date: job_start_date || null,
        is_current: true,
        source: 'Manual'
      });

    if (employmentError) return res.status(500).json({ error: employmentError.message });
  }

  res.status(201).json({ message: 'Member created', member_id: member.id });
});

// GET FULL MEMBER PROFILE
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  const { data: member, error: memberError } = await supabase
    .from('members')
    .select()
    .eq('id', id)
    .single();

  if (memberError) return res.status(404).json({ error: 'Member not found' });

  const { data: profile } = await supabase
    .from('member_profile')
    .select()
    .eq('member_id', id)
    .single();

  const { data: currentJob } = await supabase
    .from('employment_history')
    .select()
    .eq('member_id', id)
    .eq('is_current', true)
    .single();

  const { data: employmentHistory } = await supabase
    .from('employment_history')
    .select()
    .eq('member_id', id)
    .order('start_date', { ascending: false });

  res.json({
    ...member,
    profile,
    current_job: currentJob || null,
    employment_history: employmentHistory || []
  });
});

// UPDATE MEMBER
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    first_name,
    last_name,
    email,
    linkedin_url,
    phone,
    record_source,
    seniority_level,
    country,
    state_region,
    city,
    icp,
    company_id,
    signup_source,
    current_job_start_date
  } = req.body;

  // Format validation
  if (email && !isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  if (linkedin_url && !isValidLinkedIn(linkedin_url)) {
    return res.status(400).json({ error: 'Invalid LinkedIn URL format. Must start with https://linkedin.com/in/' });
  }

  // Check member exists
  const { data: existing } = await supabase
    .from('members')
    .select('id')
    .eq('id', id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Member not found' });

  // Update members table
  const { error: memberError } = await supabase
    .from('members')
    .update({ first_name, last_name, email, linkedin_url, phone, record_source, last_updated: new Date().toISOString() })
    .eq('id', id);

  if (memberError) return res.status(500).json({ error: memberError.message });

  // Update member_profile table
  const { error: profileError } = await supabase
    .from('member_profile')
    .update({ seniority_level, country, state_region, city, icp, company_id, signup_source, current_job_start_date, updated_at: new Date().toISOString() })
    .eq('member_id', id);

  if (profileError) return res.status(500).json({ error: profileError.message });

  res.json({ message: 'Member updated', member_id: id });
});

// DELETE MEMBER
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  // Check member exists
  const { data: existing } = await supabase
    .from('members')
    .select('id')
    .eq('id', id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Member not found' });

  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', id);

  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: 'Member deleted', member_id: id });
});

module.exports = router;
