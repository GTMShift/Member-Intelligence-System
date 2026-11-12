const express = require('express');
const router = express.Router({ mergeParams: true });
const supabase = require('../supabaseClient');
const { isValidDate, isValidEnum } = require('../utils/validate');
const { serverError } = require('../utils/serverError');
const { requireRole } = require('../middleware/auth');

const VALID_SOURCES = ['Apollo', 'Manual', 'Import'];

router.use(requireRole(['admin', 'member']));

function requireMemberAccess(req, res, next) {
  if (req.profile.role === 'admin' || (req.profile.role === 'member' && req.profile.member_id === req.params.id)) return next();
  return res.status(403).json({ error: 'Forbidden' });
}

function requireAdmin(req, res, next) {
  if (req.profile.role === 'admin') return next();
  return res.status(403).json({ error: 'Forbidden' });
}

function isCalendarDate(value) {
  if (!isValidDate(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateEmploymentInput(req, res, action) {
  const body = req.body ?? {};
  const company = typeof body.company === 'string' ? body.company.trim() : '';
  const role = typeof body.role === 'string' ? body.role.trim() : '';
  const startDate = body.start_date || null;

  if (action === 'change' && (!company || !role || !startDate)) {
    res.status(400).json({ error: 'company, role, and start_date are required for a job change' });
    return null;
  }
  if (action === 'correct' && !company && !role && !startDate) {
    res.status(400).json({ error: 'Provide at least one field to correct' });
    return null;
  }
  if (startDate && !isCalendarDate(startDate)) {
    res.status(400).json({ error: 'Invalid start_date. Use a real date in YYYY-MM-DD format' });
    return null;
  }

  return { company: company || null, role: role || null, startDate };
}

async function saveEmployment(req, res, action) {
  const input = validateEmploymentInput(req, res, action);
  if (!input) return;

  const { data, error } = await supabase.rpc('save_member_employment', {
    p_member_id: req.params.id,
    p_action: action,
    p_company: input.company,
    p_role: input.role,
    p_start_date: input.startDate,
  });

  if (error?.code === 'P0002') return res.status(404).json({ error: 'Member not found' });
  if (error?.code === '22023') return res.status(400).json({ error: error.message });
  if (error?.code === '23505') return res.status(409).json({ error: 'Member already has a current position' });
  if (error) return serverError(res, `employment.${action}`, error);
  return res.json(data);
}

// POST /members/:id/employment/change
// Atomically closes the current job and inserts the new current position.
router.post('/change', requireMemberAccess, async (req, res) => saveEmployment(req, res, 'change'));

// POST /members/:id/employment/correct
// Edits the current row in place; if none exists, it creates the initial current row.
router.post('/correct', requireMemberAccess, async (req, res) => saveEmployment(req, res, 'correct'));

// ADD JOB
router.post('/', requireAdmin, async (req, res) => {
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

  if (error) return serverError(res, 'employment.create', error);
  res.status(201).json(data);
});

// GET ALL JOBS FOR A MEMBER
router.get('/', requireMemberAccess, async (req, res) => {
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
    .order('is_current', { ascending: false })
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) return serverError(res, 'employment.list', error);
  res.json(data);
});

// UPDATE A JOB
router.put('/:jobId', requireAdmin, async (req, res) => {
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

  if (error) return serverError(res, 'employment.update', error);
  res.json({ message: 'Job updated', job_id: jobId });
});

module.exports = router;
