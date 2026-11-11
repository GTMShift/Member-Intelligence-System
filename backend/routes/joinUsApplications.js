const express = require('express');
const supabase = require('../supabaseClient');
const requireAdmin = require('../middleware/requireAdmin');
const { serverError } = require('../utils/serverError');

const router = express.Router();

// Database rules (migrations 041/042) that block an approval for a reason an
// admin can act on. Anything else is an unexpected failure.
const DECISION_CONFLICTS = [
  {
    match: 'Ambiguous member match',
    error: 'Approval needs admin review because the email and LinkedIn match different members.',
  },
  {
    match: 'LinkedIn URL is required',
    error: 'This applicant has no LinkedIn URL, which a new member record needs.',
  },
  {
    match: 'Email address is required',
    error: 'This application has no email address, so it cannot be approved.',
  },
  {
    match: 'already linked to a different login',
    error: 'The matching member record is already linked to a different login. Resolve that link before approving.',
  },
  {
    match: 'Only pending applications can be approved or rejected',
    error: 'This application has already been reviewed.',
  },
];

function decisionConflict(error) {
  const message = error?.message || '';
  return DECISION_CONFLICTS.find((rule) => message.includes(rule.match)) || null;
}

router.get('/', requireAdmin, async (req, res) => {
  const { status } = req.query;
  const allowedStatuses = ['pending', 'approved', 'rejected'];

  if (status && !allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Status must be pending, approved, or rejected',
    });
  }

  let query = supabase
    .from('join_us_applications')
    .select(`
      id,
      first_name,
      last_name,
      email_address,
      linkedin,
      phone_number,
      company,
      job_title,
      status,
      created_at,
      reviewed_by,
      reviewed_at
    `)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const { data: applications, error } = await query;

  if (error) {
    return serverError(res, 'list join us applications', error);
  }

  return res.json({ applications });
});

async function decide(req, res, decision) {
  const { applicationId } = req.params;
  const verb = decision === 'approved' ? 'approved' : 'rejected';

  const { data: application, error: fetchError } = await supabase
    .from('join_us_applications')
    .select('id, status')
    .eq('id', applicationId)
    .maybeSingle();

  if (fetchError) {
    return serverError(res, `load join us application for ${verb}`, fetchError);
  }

  if (!application) {
    return res.status(404).json({ error: 'Application not found' });
  }

  if (application.status !== 'pending') {
    return res.status(409).json({ error: `Only pending applications can be ${verb}` });
  }

  // Only update while still pending, so two admins acting at once cannot both
  // decide the same application.
  const { data: updated, error: updateError } = await supabase
    .from('join_us_applications')
    .update({ status: decision, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
    .eq('id', applicationId)
    .eq('status', 'pending')
    .select(decision === 'approved' ? 'id, status, member_id' : 'id, status')
    .maybeSingle();

  if (updateError) {
    const conflict = decisionConflict(updateError);
    if (conflict) {
      return res.status(409).json({ error: conflict.error });
    }
    return serverError(res, `join us application ${verb}`, updateError);
  }

  if (!updated) {
    return res.status(409).json({ error: 'This application has already been reviewed.' });
  }

  return res.json({ application: updated });
}

router.post('/:applicationId/approve', requireAdmin, (req, res) => decide(req, res, 'approved'));
router.post('/:applicationId/reject', requireAdmin, (req, res) => decide(req, res, 'rejected'));

module.exports = router;
