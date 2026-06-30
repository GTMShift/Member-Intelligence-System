const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../supabaseClient');
const { isValidDate, isValidEnum } = require('../utils/validate');

const VALID_SOURCES = ['Apollo', 'Manual', 'Import'];

// ADD JOB
router.post('/', async (req, res) => {
  const { id } = req.params;
  const { company, role, start_date, end_date, is_current, source } = req.body;

  if (!company) return res.status(400).json({ error: 'company is required' });

  if (source && !isValidEnum(source, VALID_SOURCES)) {
    return res.status(400).json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  if (start_date && !isValidDate(start_date)) {
    return res.status(400).json({ error: 'Invalid start_date format. Use YYYY-MM-DD' });
  }

  if (end_date && !isValidDate(end_date)) {
    return res.status(400).json({ error: 'Invalid end_date format. Use YYYY-MM-DD' });
  }

  // Check member exists
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', id)
    .single();

  if (!member) return res.status(404).json({ error: 'Member not found' });

  // If this is the new current job, set all other jobs to is_current = false
  if (is_current) {
    await supabase
      .from('employment_history')
      .update({ is_current: false })
      .eq('member_id', id)
      .eq('is_current', true);
  }

  const { data, error } = await supabase
    .from('employment_history')
    .insert({ member_id: id, company, role, start_date, end_date, is_current: is_current || false, source: source || 'Manual' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// GET ALL JOBS FOR A MEMBER
router.get('/', async (req, res) => {
  const { id } = req.params;

  // Check member exists
  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', id)
    .single();

  if (!member) return res.status(404).json({ error: 'Member not found' });

  const { data, error } = await supabase
    .from('employment_history')
    .select()
    .eq('member_id', id)
    .order('start_date', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// UPDATE A JOB
router.put('/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const { company, role, start_date, end_date, is_current, source } = req.body;

  if (source && !isValidEnum(source, VALID_SOURCES)) {
    return res.status(400).json({ error: `Invalid source. Must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  if (start_date && !isValidDate(start_date)) {
    return res.status(400).json({ error: 'Invalid start_date format. Use YYYY-MM-DD' });
  }

  if (end_date && !isValidDate(end_date)) {
    return res.status(400).json({ error: 'Invalid end_date format. Use YYYY-MM-DD' });
  }

  // Check job exists
  const { data: existing } = await supabase
    .from('employment_history')
    .select('id')
    .eq('id', jobId)
    .single();

  if (!existing) return res.status(404).json({ error: 'Job not found' });

  const { error } = await supabase
    .from('employment_history')
    .update({ company, role, start_date, end_date, is_current, source })
    .eq('id', jobId);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Job updated', job_id: jobId });
});

module.exports = router;